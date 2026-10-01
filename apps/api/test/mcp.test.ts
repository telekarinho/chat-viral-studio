import { describe, expect, it } from "vitest";
import { CONTROLPOT_PROFILE, RODRIGO_PROFILE, fingerprintsFor, generateLocal, type ContentDraft } from "@postai/domain";
import { MCP_TOOLS, handleMcp, todayBrasilia, type McpContent, type McpStore } from "../src/mcp";

const ID = "22222222-2222-4222-8222-222222222222";
const thought: McpContent = { id: ID, format: "thought", pillarSlug: "familia", title: "Pensamento do Dia", date: "2026-10-01", hasScript: false, project: null };
const draft = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "thought", eventText: null, recent: [] }).draft;

function fakeStore(opts: { profile?: typeof RODRIGO_PROFILE; recent?: ContentDraft } = {}) {
  const saved: { contentId: string; draft: ContentDraft }[] = [];
  const store: McpStore = {
    contentsOn: async (date) => (date === "2026-10-01" ? [thought] : []),
    content: async (id) => (id === ID ? thought : null),
    profile: async () => opts.profile ?? RODRIGO_PROFILE,
    pillarName: async (slug) => (slug === "familia" ? "Família" : slug),
    recentFingerprints: async () => (opts.recent ? fingerprintsFor(opts.recent).map((f) => ({ ...f, contentItemId: "outro" })) : []),
    recentSummaries: async () => [],
    saveDraft: async (contentId, d) => void saved.push({ contentId, draft: d }),
    strategy: async () => ({ pillars: [{ slug: "familia", name: "Família", targetPercent: 30 }], routine: [{ weekday: 1, startTime: "07:30", title: "Pensamento", format: "thought" }] }),
    posts: async () => [{
      id: ID, title: "Pequenas escolhas", pillarSlug: "familia", format: "thought", date: "2026-09-30", postedAt: "2026-09-30T22:30:00.000Z", postedTo: ["Instagram"],
      metrics: { views: 2000, likes: 100, comments: 10, shares: 10, saves: 5, updatedAt: "2026-10-01T00:00:00Z" },
    }],
  };
  return { store, saved };
}

const call = (store: McpStore, name: string, args: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, store, new Date("2026-10-01T15:00:00Z"));
const textOf = (r: unknown) => ((r as { result: { content: { text: string }[] } }).result.content[0]!.text);
const isError = (r: unknown) => Boolean((r as { result: { isError?: boolean } }).result.isError);

describe("conector MCP do Post.ai", () => {
  it("responde ao aperto de mão MCP, lista as ferramentas e ignora notificações", async () => {
    const { store } = fakeStore();
    const init = await handleMcp({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude" } } }, store);
    expect(init).toMatchObject({ result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "postai" } } });
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, store)).toBeNull();
    const list = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, store)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));
    expect(await handleMcp({ jsonrpc: "2.0", id: 3, method: "nada" }, store)).toMatchObject({ error: { code: -32601 } });
  });

  it("hoje é a data de Brasília (meia-noite UTC ainda é ontem aqui)", () => {
    expect(todayBrasilia(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01");
  });

  it("lista os conteúdos do dia com o nome do tema", async () => {
    const { store } = fakeStore();
    expect(textOf(await call(store, "conteudos_do_dia"))).toContain(`id ${ID} · Pensamento do Dia · tema: Família · sem roteiro`);
  });

  it("entrega as regras do perfil (com formato que viraliza e fechamento) para o assistente seguir", async () => {
    const { store } = fakeStore();
    const t = textOf(await call(store, "instrucoes_do_roteiro", { content_id: ID, acontecimento: "levei meu filho na escola" }));
    expect(t).toContain("E se der certo!");
    expect(t).toContain("ninguém te conta que");
    expect(t).toContain("levei meu filho na escola");
    expect(t).toContain("Responda APENAS com um bloco JSON");
  });

  it("salva só roteiro válido; inválido ou repetido volta com o que corrigir", async () => {
    const { store, saved } = fakeStore();
    expect(isError(await call(store, "salvar_roteiro", { content_id: ID, roteiro: { title: "x" } }))).toBe(true);
    expect(saved).toHaveLength(0);
    const ok = await call(store, "salvar_roteiro", { content_id: ID, roteiro: draft });
    expect(isError(ok)).toBe(false);
    expect(saved[0]).toMatchObject({ contentId: ID });
    expect(saved[0]!.draft.script.trim().endsWith("E se der certo!")).toBe(true);
    const repeated = fakeStore({ recent: draft });
    expect(textOf(await call(repeated.store, "salvar_roteiro", { content_id: ID, roteiro: draft }))).toContain("repetir");
    expect(repeated.saved).toHaveLength(0);
  });

  it("empresa: roteiro com preço é recusado", async () => {
    const { store, saved } = fakeStore({ profile: CONTROLPOT_PROFILE });
    const caro = { ...draft, script: `${draft.script} Custa só R$ 1.990.` };
    expect(textOf(await call(store, "salvar_roteiro", { content_id: ID, roteiro: caro }))).toContain("preço");
    expect(saved).toHaveLength(0);
  });

  it("conteúdo de outro perfil não existe para o link", async () => {
    const { store } = fakeStore();
    expect(isError(await call(store, "instrucoes_do_roteiro", { content_id: "33333333-3333-4333-8333-333333333333" }))).toBe(true);
  });

  it("estratégia e desempenho com horário de Brasília e envios a cada mil", async () => {
    const { store } = fakeStore();
    expect(textOf(await call(store, "perfil_e_estrategia"))).toContain("Família 30%");
    const perf = textOf(await call(store, "desempenho_dos_posts"));
    expect(perf).toContain("postado qua 2026-09-30 19:30 em Instagram");
    expect(perf).toContain("5.0 envios/mil");
    expect(perf).toContain("poucos posts");
  });
});
