import { describe, expect, it } from "vitest";
import { CONTROLPOT_PROFILE, RODRIGO_PROFILE, fingerprintsFor, generateLocal, type ContentDraft } from "@postai/domain";
import { MCP_TOOLS, handleMcp, todayBrasilia, type McpContent, type McpContext, type McpStore } from "../src/mcp";

const PESSOAL = "11111111-1111-4111-8111-111111111111";
const EMPRESA = "44444444-4444-4444-8444-444444444444";
const ID = "22222222-2222-4222-8222-222222222222";
const thought: McpContent = { id: ID, format: "thought", pillarSlug: "familia", title: "Pensamento do Dia", date: "2026-10-01", hasScript: false, project: null };
const raw = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "thought", eventText: null, recent: [] }).draft;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
// roteiro dentro das regras do diretor (gancho curto, texto de tela 2–5 palavras, duração ≈ palavras ÷ 2,5)
const draft: ContentDraft = {
  ...raw, hook_options: ["Ninguém te conta isso sobre ter 40", "Eu quase desisti hoje", "Você já sentiu isso?"], screen_text: "Vida real 40+",
  duration_seconds: Math.max(3, Math.round(words(`${raw.script}`) / 2.5)),
};

function fakeStore(opts: { profile?: typeof RODRIGO_PROFILE; recent?: ContentDraft; content?: McpContent | null } = {}) {
  const saved: { contentId: string; draft: ContentDraft }[] = [];
  const improvements: { titulo: string }[] = [];
  const own = opts.content === undefined ? thought : opts.content;
  const store: McpStore = {
    contentsOn: async (date) => (date === "2026-10-01" && own ? [own] : []),
    content: async (id) => (own && id === own.id ? own : null),
    profile: async () => opts.profile ?? RODRIGO_PROFILE,
    pillarName: async (slug) => (slug === "familia" ? "Família" : slug === "humor" ? "Humor" : slug),
    recentFingerprints: async () => (opts.recent ? fingerprintsFor(opts.recent).map((f) => ({ ...f, contentItemId: "outro" })) : []),
    recentSummaries: async () => [],
    saveDraft: async (contentId, d) => void saved.push({ contentId, draft: d }),
    strategy: async () => ({ pillars: [{ slug: "familia", name: "Família", targetPercent: 30 }, { slug: "humor", name: "Humor", targetPercent: 10 }], routine: [{ weekday: 1, startTime: "07:30", title: "Pensamento", format: "thought" }] }),
    posts: async () => [{
      id: ID, title: "Pequenas escolhas", pillarSlug: "familia", format: "thought", date: "2026-09-30", postedAt: "2026-09-30T22:30:00.000Z", postedTo: ["Instagram"],
      metrics: { views: 2000, likes: 100, comments: 10, shares: 10, saves: 5, updatedAt: "2026-10-01T00:00:00Z" },
    }],
    readScript: async () => ({ draft: raw, edit: null, metrics: null, postedAt: null, pendingFromAssistant: true }),
    planDays: async (start, days) => Array.from({ length: days }, (_, i) => ({ date: i === 0 ? start : `dia+${i}`, created: i > 0, items: i === 0 && own ? [own] : [] })),
    pillarCounts: async () => ({ familia: 3 }),
    recentTopics: async () => ["treinar sem vontade", "Treinar sem vontade", "cansaço não é desistir"],
    saveImprovement: async (i) => { improvements.push(i); return "m1"; },
    improvements: async () => improvements.map((m) => ({ id: "m1", titulo: m.titulo, prioridade: "alta", status: "nova", issueNumber: null, createdAt: "x" })),
  };
  return { store, saved, improvements };
}

/** link do perfil pessoal; o mesmo dono também tem a empresa */
function fakeCtx() {
  const pessoal = fakeStore();
  const empresa = fakeStore({ profile: CONTROLPOT_PROFILE, content: { ...thought, id: "55555555-5555-4555-8555-555555555555" } });
  const ctx: McpContext = {
    defaultProfileId: PESSOAL,
    profiles: async () => [{ id: PESSOAL, name: "RodrigoSerra.me", kind: "pessoal", signature: "RodrigoSerra.me" }, { id: EMPRESA, name: "ControlPot", kind: "empresa", signature: "ControlPot" }],
    store: async (id) => (id === PESSOAL ? pessoal.store : id === EMPRESA ? empresa.store : null),
  };
  return { ctx, pessoal, empresa };
}

const call = (ctx: McpContext, name: string, args: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx, new Date("2026-10-01T15:00:00Z"));
const textOf = (r: unknown) => ((r as { result: { content: { text: string }[] } }).result.content[0]!.text);
const isError = (r: unknown) => Boolean((r as { result: { isError?: boolean } }).result.isError);

describe("conector MCP do Post.ai (diretor de gravações)", () => {
  it("responde ao aperto de mão MCP, lista as ferramentas e ignora notificações", async () => {
    const { ctx } = fakeCtx();
    const init = await handleMcp({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude" } } }, ctx);
    expect(init).toMatchObject({ result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "postai" } } });
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    const list = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));
    expect(await handleMcp({ jsonrpc: "2.0", id: 3, method: "nada" }, ctx)).toMatchObject({ error: { code: -32601 } });
  });

  it("hoje é a data de Brasília (meia-noite UTC ainda é ontem aqui)", () => {
    expect(todayBrasilia(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01");
  });

  it("lista os perfis e cada chamada fica só no perfil escolhido", async () => {
    const { ctx, empresa } = fakeCtx();
    const perfis = textOf(await call(ctx, "listar_perfis"));
    expect(perfis).toContain(`id ${PESSOAL} · RodrigoSerra.me · pessoal (padrão deste link)`);
    expect(perfis).toContain(`id ${EMPRESA} · ControlPot · empresa`);
    // sem profile_id: perfil do link; com profile_id: só aquele perfil
    expect(textOf(await call(ctx, "conteudos_do_dia"))).toContain(`id ${ID}`);
    const emp = textOf(await call(ctx, "conteudos_do_dia", { profile_id: EMPRESA }));
    expect(emp).toContain("55555555-5555-4555-8555-555555555555");
    expect(emp).not.toContain(ID);
    // conteúdo do pessoal não existe dentro da empresa
    expect(isError(await call(ctx, "salvar_roteiro", { profile_id: EMPRESA, content_id: ID, roteiro: draft }))).toBe(true);
    expect(empresa.saved).toHaveLength(0);
    expect(isError(await call(ctx, "conteudos_do_dia", { profile_id: "99999999-9999-4999-8999-999999999999" }))).toBe(true);
  });

  it("lê o roteiro salvo (para auditar) e planeja dias futuros", async () => {
    const { ctx } = fakeCtx();
    const lido = JSON.parse(textOf(await call(ctx, "ler_roteiro", { content_id: ID })));
    expect(lido).toMatchObject({ content_id: ID, tema: "Família", pendingFromAssistant: true });
    expect(lido.draft.title).toBe(raw.title);
    const plano = textOf(await call(ctx, "criar_plano", { data_inicio: "2026-10-01", dias: 3 }));
    expect(plano).toContain("2026-10-01:");
    expect(plano).toContain("(plano criado agora)");
    expect(plano).toContain(`id ${ID}`);
  });

  it("instruções trazem voz, formatos que viralizam, temas abaixo da meta e assuntos bloqueados", async () => {
    const { ctx } = fakeCtx();
    const t = textOf(await call(ctx, "instrucoes_do_roteiro", { content_id: ID, acontecimento: "levei minha filha no parque" }));
    expect(t).toContain("E se der certo!");
    expect(t).toContain("ninguém te conta que");
    expect(t).toContain("levei minha filha no parque");
    // Humor zerado (meta 10%) vem antes de Família (100% feito)
    expect(t.indexOf("Humor: meta 10% · feito 0% (faltam 10 pontos)")).toBeGreaterThan(-1);
    expect(t.indexOf("Humor: meta")).toBeLessThan(t.indexOf("Família: meta"));
    expect(t).toContain("- treinar sem vontade (2x)");
    expect(t).toContain("gancho ≤ 12 palavras");
  });

  it("salva só roteiro válido: contrato, regras do diretor e repetição", async () => {
    const { ctx, pessoal } = fakeCtx();
    expect(isError(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { title: "x" } }))).toBe(true);
    const longo = await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, hook_options: ["uma duas três quatro cinco seis sete oito nove dez onze doze treze", "b c", "d e"] } });
    expect(textOf(longo)).toContain("gancho 1 tem 13 palavras");
    expect(pessoal.saved).toHaveLength(0);
    const ok = await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: draft });
    expect(textOf(ok)).toContain("enviado para o Post.ai");
    expect(pessoal.saved[0]!.draft.script.trim().endsWith("E se der certo!")).toBe(true);
  });

  it("empresa: roteiro com preço é recusado", async () => {
    const { ctx, empresa } = fakeCtx();
    const caro = { ...draft, script: `${draft.script} Custa só R$ 1.990.` };
    expect(textOf(await call(ctx, "salvar_roteiro", { profile_id: EMPRESA, content_id: "55555555-5555-4555-8555-555555555555", roteiro: caro }))).toMatch(/preço|bate com o texto/);
    expect(empresa.saved).toHaveLength(0);
  });

  it("registra melhoria para o backlog e mostra o andamento", async () => {
    const { ctx } = fakeCtx();
    expect(isError(await call(ctx, "registrar_melhoria", { titulo: "x", descricao: "" }))).toBe(true);
    expect(textOf(await call(ctx, "registrar_melhoria", { titulo: "Mostrar retenção no painel", descricao: "Problema… Proposta… Aceite…", prioridade: "alta" }))).toContain("Melhoria registrada");
    expect(textOf(await call(ctx, "listar_melhorias"))).toContain("[nova] Mostrar retenção no painel");
  });

  it("estratégia e desempenho com horário de Brasília e envios a cada mil", async () => {
    const { ctx } = fakeCtx();
    expect(textOf(await call(ctx, "perfil_e_estrategia"))).toContain("Família 30%");
    const perf = textOf(await call(ctx, "desempenho_dos_posts"));
    expect(perf).toContain("postado qua 2026-09-30 19:30 em Instagram");
    expect(perf).toContain("5.0 envios/mil");
    expect(perf).toContain("poucos posts");
  });
});
