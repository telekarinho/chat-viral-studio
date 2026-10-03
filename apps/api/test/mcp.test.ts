import { describe, expect, it } from "vitest";
import { CONTROLPOT_PROFILE, RODRIGO_PROFILE, fingerprintsFor, generateLocal, type ContentDraft, type Pillar, type PostMetrics } from "@postai/domain";
import { MCP_TOOLS, handleMcp, todayBrasilia, type McpContent, type McpContext, type McpStore } from "../src/mcp";
import type { FilmableProof, NewProfile, RealCase } from "../src/mcp-profiles";

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

function fakeStore(opts: { profile?: typeof RODRIGO_PROFILE; recent?: ContentDraft; content?: McpContent | null; pending?: ContentDraft } = {}) {
  const saved: { contentId: string; draft: ContentDraft }[] = [];
  const scenes: { contentId: string; takes: unknown[] }[] = [];
  const metrics: { contentId: string; m: PostMetrics }[] = [];
  const improvements: { titulo: string }[] = [];
  const proposals: { contentId: string; edit: unknown; motivo: string }[] = [];
  const requests = [{ id: "r1", contentId: ID, texto: "quero mais rápido", createdAt: "2026-10-01T12:00:00Z", resposta: null as string | null }];
  const own = opts.content === undefined ? thought : opts.content;
  const state = { profile: opts.profile ?? RODRIGO_PROFILE, pillars: null as Pillar[] | null, cases: [] as RealCase[], proofs: [] as FilmableProof[] };
  const store: McpStore = {
    contentsOn: async (date) => (date === "2026-10-01" && own ? [own] : []),
    content: async (id) => (own && id === own.id ? own : null),
    profile: async () => state.profile,
    pillarName: async (slug) => (slug === "familia" ? "Família" : slug === "humor" ? "Humor" : slug),
    recentFingerprints: async () => (opts.recent ? fingerprintsFor(opts.recent).map((f) => ({ ...f, contentItemId: "outro" })) : []),
    recentSummaries: async () => [],
    saveDraft: async (contentId, d) => void saved.push({ contentId, draft: d }),
    saveScenes: async (contentId, takes) => void scenes.push({ contentId, takes }),
    saveMetrics: async (contentId, m) => void metrics.push({ contentId, m }),
    strategy: async () => ({ pillars: [{ slug: "familia", name: "Família", targetPercent: 30 }, { slug: "humor", name: "Humor", targetPercent: 10 }], routine: [{ weekday: 1, startTime: "07:30", title: "Pensamento", format: "thought" }] }),
    posts: async () => [{
      id: ID, title: "Pequenas escolhas", pillarSlug: "familia", format: "thought", date: "2026-09-30", postedAt: "2026-09-30T22:30:00.000Z", postedTo: ["Instagram"],
      metrics: { views: 2000, likes: 100, comments: 10, shares: 10, saves: 5, updatedAt: "2026-10-01T00:00:00Z", completionRate: 42 }, hook: "Eu quase desisti hoje", music: "Karma",
    }],
    readScript: async () => (opts.pending
      ? { draft: null, edit: null, metrics: null, postedAt: null, pendingFromAssistant: true, pending: { sentAt: "2026-10-02T12:00:00Z", draft: opts.pending, scenes: null } }
      : { draft: raw, edit: null, metrics: null, postedAt: null, pendingFromAssistant: true }),
    musicFavorites: async () => ["mixkit-963"],
    mediaLibrary: async ({ categoria }) => [
      { id: "b1", segmentIndex: null, createdAt: "2026-10-01T12:00:00Z", discarded: false, synced: true, favorite: true, camera: "back", durationMs: 3200, width: 1080, height: 1920, category: "broll", contentId: ID, tags: [], capitulo: null },
      { id: "p1", segmentIndex: null, createdAt: "2026-10-01T13:00:00Z", discarded: false, synced: false, favorite: false, camera: "back", durationMs: 8000, width: 1080, height: 1920, category: "main_video", contentId: null, tags: ["mixer"], capitulo: "Close do produto" },
    ].filter((t) => !categoria || (categoria === "broll" ? t.category === "broll" : categoria === "prova" ? Boolean(t.capitulo) : t.category !== "broll")),
    creatorRequests: async (cid) => requests.filter((r) => !cid || r.contentId === cid),
    answerRequest: async (rid, resposta) => {
      const r = requests.find((x) => x.id === rid);
      if (r) r.resposta = resposta;
      return Boolean(r);
    },
    takes: async () => [
      { id: "t1", segmentIndex: 0, createdAt: "a", discarded: false, synced: true, favorite: false, camera: "front", durationMs: 600, width: 1080, height: 1920 },
      { id: "t2", segmentIndex: 0, createdAt: "b", discarded: true, synced: true, favorite: false, camera: "front", durationMs: 4000, width: 1080, height: 1920 },
      { id: "t3", segmentIndex: 1, createdAt: "c", discarded: false, synced: false, favorite: true, camera: "back", durationMs: null, width: 1920, height: 1080 },
    ],
    saveEditProposal: async (contentId, edit, motivo) => void proposals.push({ contentId, edit, motivo }),
    ownMusic: async () => [{ id: "77777777-7777-4777-8777-777777777777", titulo: "Trilha do Loucura de Amor", comercial: false, storageKey: "ws/music/a.mp3" }],
    recordingStatus: async () => ({ takes: [{ segmentIndex: 0, synced: true }, { segmentIndex: 1, synced: false }], renders: [{ status: "failed", error: "parte 3 faltando", createdAt: "x", variant: "completo", warnings: [] }] }),
    planDays: async (start, days) => Array.from({ length: days }, (_, i) => ({ date: i === 0 ? start : `dia+${i}`, created: i > 0, items: i === 0 && own ? [own] : [] })),
    pillarCounts: async () => ({ familia: 3 }),
    recentTopics: async () => [
      { topic: "treinar sem vontade", contentItemId: "a" }, { topic: "Treinar sem vontade", contentItemId: "b" },
      { topic: "chegar aos 40 sem ter tudo resolvido", contentItemId: "c" },
    ],
    saveImprovement: async (i) => { improvements.push(i); return "m1"; },
    improvements: async () => improvements.map((m) => ({ id: "m1", titulo: m.titulo, prioridade: "alta", status: "nova", issueNumber: null, createdAt: "x" })),
    updateProfile: async (pr, pl) => { state.profile = pr; state.pillars = pl; },
    realCases: async () => state.cases,
    saveRealCase: async (c) => { const id = c.id ?? `00000000-0000-4000-8000-00000000000${state.cases.length + 1}`; state.cases = [...state.cases.filter((x) => x.id !== id), { ...c, id }]; return id; },
    proofs: async () => state.proofs,
    saveProof: async (pf) => { state.proofs = [...state.proofs.filter((x) => x.descricao !== pf.descricao), pf]; },
  };
  return { store, saved, improvements, state, scenes, metrics, proposals };
}

/** link do perfil pessoal; o mesmo dono também tem a empresa */
function fakeCtx() {
  const pessoal = fakeStore();
  const empresa = fakeStore({ profile: CONTROLPOT_PROFILE, content: { ...thought, id: "55555555-5555-4555-8555-555555555555" } });
  const created: NewProfile[] = [];
  const ctx: McpContext = {
    defaultProfileId: PESSOAL,
    profiles: async () => [{ id: PESSOAL, name: "RodrigoSerra.me", kind: "pessoal", signature: "RodrigoSerra.me" }, { id: EMPRESA, name: "ControlPot", kind: "empresa", signature: "ControlPot" }],
    store: async (id) => (id === PESSOAL ? pessoal.store : id === EMPRESA ? empresa.store : null),
    createProfile: async (np) => { created.push(np); return "66666666-6666-4666-8666-666666666666"; },
  };
  return { ctx, pessoal, empresa, created };
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

  it("assunto bloqueado por tema ('Aos 40') e erro diz qual conteúdo, campo e trecho", async () => {
    const { ctx, pessoal } = fakeCtx();
    const r = textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, topic: "Aos 40" } }));
    expect(r).toContain('assunto: "aos 40" parece com "chegar aos 40 sem ter tudo resolvido"');
    expect(pessoal.saved).toHaveLength(0);
  });

  it("direção completa: salva quando está certa, aponta o erro quando a música não existe", async () => {
    const { ctx, pessoal } = fakeCtx();
    const direcao = {
      takes: [{ ordem: 1, nome: "Gancho", fala_exata: draft.hook_options[0], duracao_segundos: 3, enquadramento: "close", olhar: "na lente" }, { ordem: 2, nome: "Mensagem", fala_exata: draft.script, duracao_segundos: draft.duration_seconds }],
      musica: { id: "mixkit-839", volume: 0.25 },
      legendas_na_tela: [{ texto: "Vida real 40+", inicio: 0, fim: 2.5 }],
    };
    const bad = await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, direcao: { ...direcao, musica: { id: "hit-do-momento" } } } });
    expect(textOf(bad)).toContain('direcao.musica.id "hit-do-momento" não existe');
    expect(pessoal.saved).toHaveLength(0);
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, direcao } }))).toContain("enviado para o Post.ai");
    expect(pessoal.saved[0]!.draft.direcao?.takes[0]).toMatchObject({ nome: "Gancho", enquadramento: "close", luz: "" });
    expect(textOf(await call(ctx, "instrucoes_do_roteiro", { content_id: ID }))).toContain("DIREÇÃO COMPLETA");
  });

  it("listar_musicas filtra por clima; ler_status_gravacao mostra o que falta e a montagem", async () => {
    const { ctx } = fakeCtx();
    const m = textOf(await call(ctx, "listar_musicas", { clima: "Família (acústico)" }));
    expect(m).toContain('id mixkit-839 · "Tears of Joy" — Michael Ramir C. · clima familia (Família (acústico)) · 124 BPM');
    expect(m).not.toContain("mixkit-22 ");
    const fast = textOf(await call(ctx, "listar_musicas", { clima: "familia", bpm: 120 }));
    expect(fast).toContain("mixkit-839");
    expect(fast).not.toContain("mixkit-963"); // 96 BPM, fora de 120 ± 10
    expect(textOf(await call(ctx, "listar_musicas", { clima: "reflexao" }))).toContain("Skyline\" — Eugenio Mininni · clima reflexao (Reflexão (piano)) · sem batida definida");
    const st = textOf(await call(ctx, "ler_status_gravacao", { content_id: ID }));
    expect(st).toMatch(/1\. .*: gravado e enviado/);
    expect(st).toMatch(/2\. .*: gravado, ainda subindo/);
    expect(st).toContain("falta gravar");
    expect(st).toContain("montagem falhou: parte 3 faltando");
  });

  it("perfil dinâmico: entrevista, criar (pilares somando 100) e atualizar só o que veio", async () => {
    const { ctx, created, pessoal } = fakeCtx();
    expect(textOf(await call(ctx, "entrevista_de_perfil"))).toContain("ENTREVISTA PARA CRIAR UM PERFIL");
    const base = {
      nome: "Clube do Natural", tipo: "empresa", posicionamento: "Produtos naturais para quem quer comer melhor sem complicar.", voz: ["simples e acolhedor"], assinatura: "Clube do Natural",
      publico: "mães 30–45 que cozinham em casa", ofertas: ["assinatura mensal de cestas"], dores: ["não sabe o que é natural de verdade"], ctas: ["Me chama no direct."],
      nao_prometer: ["emagrecimento garantido"], pilares: [{ nome: "Educação", meta: 60 }, { nome: "Histórias de cliente", meta: 30 }], redes: ["Instagram"], tipo_conta: "comercial",
    };
    expect(textOf(await call(ctx, "criar_perfil", { perfil: base }))).toContain("somam 90%");
    expect(created).toHaveLength(0);
    const ok = textOf(await call(ctx, "criar_perfil", { perfil: { ...base, pilares: [{ nome: "Educação", meta: 70 }, { nome: "Histórias de cliente", meta: 30 }] } }));
    expect(ok).toContain("Perfil \"Clube do Natural\" criado");
    const np = created[0]!;
    expect(np.pillars.map((p) => p.slug)).toEqual(["educacao", "historias-de-cliente"]);
    expect(np.profile.business).toMatchObject({ pains: ["não sabe o que é natural de verdade"], pendingClaims: ["emagrecimento garantido"], noPrice: true });
    expect(np.profile.extras).toMatchObject({ audience: "mães 30–45 que cozinham em casa", networks: ["Instagram"], accountType: "comercial" });
    expect(np.routine.some((b) => b.format === "broll")).toBe(true);

    await call(ctx, "atualizar_perfil", { campos: { voz: ["direto", "sem guru"], metas: "1.000 seguidores até dezembro" } });
    expect(pessoal.state.profile.voiceRules).toEqual(["direto", "sem guru"]);
    expect(pessoal.state.profile.closingPhrase).toBe("E se der certo!");
    expect(pessoal.state.profile.extras?.goals).toBe("1.000 seguidores até dezembro");
    expect(pessoal.state.pillars).toBeNull();
  });

  it("histórias de cliente: só com caso real autorizado; provas com status", async () => {
    const story = fakeStore({ profile: CONTROLPOT_PROFILE, content: { ...thought, pillarSlug: "historias" } });
    const ctx: McpContext = { defaultProfileId: EMPRESA, profiles: async () => [], store: async () => story.store, createProfile: async () => "x" };
    const roteiro = { ...draft, hook_options: ["O que mudou na lanchonete do Zé", "Eu duvidei disso", "Você já passou por isso?"] };
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro }))).toContain("não tem caso real autorizado");
    expect(textOf(await call(ctx, "cadastrar_caso_real", { cliente_segmento: "lanchonete de bairro", problema: "milk-shake aguado", resultado: "textura igual todo dia" }))).toContain("SEM autorização");
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro }))).toContain("não tem caso real autorizado");
    const caseId = "00000000-0000-4000-8000-000000000001";
    expect(textOf(await call(ctx, "cadastrar_caso_real", { id: caseId, cliente_segmento: "lanchonete de bairro", problema: "milk-shake aguado", resultado: "textura igual todo dia", autorizacao: "dono autorizou por WhatsApp em 02/10" }))).toContain("liberado");
    expect(textOf(await call(ctx, "instrucoes_do_roteiro", { content_id: ID }))).toContain(`[${caseId}] lanchonete de bairro`);
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro }))).not.toContain("caso real");
    await call(ctx, "atualizar_prova", { descricao: "close da caneca cônica", status: "filmada" });
    const list = textOf(await call(ctx, "listar_casos_reais"));
    expect(list).toContain("close da caneca cônica: já filmada");
    expect(list).toContain("máquina batendo por 20 segundos: falta filmar");
  });

  it("cena de apoio da empresa: salvar_cenas com takes; roteiro falado não serve para ela", async () => {
    const broll = fakeStore({ profile: CONTROLPOT_PROFILE, content: { ...thought, format: "broll", title: "Prova visual / B-roll do produto" } });
    const ctx: McpContext = { defaultProfileId: EMPRESA, profiles: async () => [], store: async () => broll.store, createProfile: async () => "x" };
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: draft }))).toContain("use salvar_cenas");
    expect(isError(await call(ctx, "salvar_cenas", { content_id: ID, takes: [] }))).toBe(true);
    expect(textOf(await call(ctx, "salvar_cenas", { content_id: ID, takes: [{ ordem: 1, nome: "Mixer batendo", duracao_segundos: 4, broll: "mais de 4.000 máquinas" }] }))).toContain("sem prova");
    const ok = await call(ctx, "salvar_cenas", { content_id: ID, takes: [{ ordem: 1, nome: "Close da textura", duracao_segundos: 4, enquadramento: "macro no copo", luz: "lateral" }] });
    expect(textOf(ok)).toContain("1 take(s)");
    expect(broll.scenes[0]!.takes[0]).toMatchObject({ nome: "Close da textura", fala_exata: "" });
  });

  it("música própria aparece em listar_musicas e vale na direção (empresa só com licença comercial)", async () => {
    const { ctx } = fakeCtx();
    expect(textOf(await call(ctx, "listar_musicas"))).toContain('id own:77777777-7777-4777-8777-777777777777 · "Trilha do Loucura de Amor" · música própria');
    const direcao = { takes: [{ ordem: 1, nome: "A", fala_exata: draft.script, duracao_segundos: draft.duration_seconds }], musica: { id: "own:77777777-7777-4777-8777-777777777777", volume: 0.3 } };
    expect(textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, direcao } }))).toContain("enviado para o Post.ai");
    expect(textOf(await call(ctx, "listar_musicas", { profile_id: EMPRESA }))).not.toContain("Loucura de Amor");
  });

  it("propor_edicao: valida, guarda a proposta (sem montar) e listar_musicas mostra as favoritas primeiro", async () => {
    const { ctx, pessoal } = fakeCtx();
    const fam = textOf(await call(ctx, "listar_musicas", { clima: "familia" }));
    expect(fam.split("\n")[0]).toContain("mixkit-963");
    expect(fam).toContain("♥ favorita do criador");
    const bad = await call(ctx, "propor_edicao", { content_id: ID, autocut: "rapido", volume: 1, motivo: "teste" });
    expect(isError(bad)).toBe(true);
    expect(textOf(bad)).toContain("autocut:");
    expect(textOf(bad)).toContain("volume:");
    expect(pessoal.proposals).toHaveLength(0);
    const ok = textOf(await call(ctx, "propor_edicao", { content_id: ID, autocut: "tiktok", musica: "mixkit-963", volume: 0.3, inicio_musica_s: 10, motivo: "Fala curta e animada: ritmo rápido na batida." }));
    expect(ok).toContain("MONTAR ASSIM");
    expect(pessoal.proposals[0]).toMatchObject({ contentId: ID, edit: { autocut: "tiktok", music: "mixkit-963", musicVolume: 0.3, musicStartS: 10 } });
  });

  it("buscar_midias: o diretor acha B-roll e provas já gravados antes de pedir de novo", async () => {
    const { ctx } = fakeCtx();
    const all = textOf(await call(ctx, "buscar_midias"));
    expect(all).toContain("2 mídia(s) no acervo");
    expect(all).toMatch(/take b1 · broll · .* · 3\.2s · 1080x1920 · ★ · na nuvem · de "Pensamento do Dia"/);
    expect(all).toMatch(/take p1 · main_video \(Close do produto\) .* ainda no celular · mixer/);
    expect(textOf(await call(ctx, "buscar_midias", { categoria: "broll" }))).not.toContain("take p1");
  });

  it("pedidos do criador: o diretor lê e responde", async () => {
    const { ctx } = fakeCtx();
    const list = textOf(await call(ctx, "pedidos_do_criador", { content_id: ID }));
    expect(list).toContain('pedido r1');
    expect(list).toContain('"quero mais rápido" · SEM RESPOSTA');
    expect(isError(await call(ctx, "responder_pedido", { pedido_id: "nao-existe", resposta: "ok, fiz" }))).toBe(true);
    expect(textOf(await call(ctx, "responder_pedido", { pedido_id: "r1", resposta: "Propus o AutoCut TikTok: cortes mais curtos." }))).toContain("painel do Diretor");
    expect(textOf(await call(ctx, "pedidos_do_criador"))).toContain("respondido: Propus o AutoCut TikTok");
  });

  it("listar_takes: por parte, qual a montagem usa, descartados e checagem técnica", async () => {
    const { ctx } = fakeCtx();
    const t = textOf(await call(ctx, "listar_takes", { content_id: ID }));
    expect(t).toMatch(/Parte 1 — [^:]+:\n {2}- take 1 \(id t1\) · USADO NA MONTAGEM · 0\.6s · 1080x1920 · câmera frontal\n {4}atenção: curto demais/);
    expect(t).toContain("take 2 (id t2) · DESCARTADO");
    expect(t).toMatch(/take 1 \(id t3\) · USADO NA MONTAGEM · duração \? · 1920x1080 · câmera traseira · ♥\n {4}atenção: ainda não subiu para a nuvem; gravado na horizontal/);
    expect(t).toContain("não mede qualidade da fala nem viralidade");
  });

  it("métricas: o assistente registra números reais (sem inventar) e o desempenho mostra o top 3", async () => {
    const { ctx, pessoal } = fakeCtx();
    expect(textOf(await call(ctx, "registrar_metricas", { content_id: ID }))).toContain("Informe pelo menos visualizacoes");
    expect(textOf(await call(ctx, "registrar_metricas", { content_id: ID, visualizacoes: 10, retencao: 140 }))).toContain("0 a 100");
    expect(textOf(await call(ctx, "registrar_metricas", { content_id: ID, visualizacoes: 3200, compartilhamentos: 40, retencao: 55.5, seguidores_ganhos: 12, fonte: "Metricool" }))).toContain("fonte Metricool");
    expect(pessoal.metrics[0]!.m).toMatchObject({ views: 3200, shares: 40, completionRate: 55.5, followersGained: 12, source: "Metricool", likes: 0 });
    const perf = textOf(await call(ctx, "desempenho_dos_posts"));
    expect(perf).toContain('gancho "Eu quase desisti hoje" · música Karma');
    expect(perf).toContain("retenção 42%");
    expect(perf).toContain("O QUE ESTÁ FUNCIONANDO");
    expect(perf).toMatch(/Horários \(Brasília\):\n {2}1\. 19h — 2\.000 visualizações/);
  });

  it("fila do assistente: ler_roteiro mostra o pendente e o que a direção aplica; o dia marca 'aguardando abertura'", async () => {
    const direcao = { takes: [{ ordem: 1, nome: "Gancho", fala_exata: "Ninguém te conta isso.", duracao_segundos: 3 }], publicacao_por_rede: [{ rede: "instagram", horario: "19:30" }], legendas_na_tela: [{ texto: "Vida real", inicio: 0, fim: 2, estilo: "amarelo" }] };
    const parsed = (await import("@postai/domain")).parseDraft({ ...draft, direcao });
    if (!parsed.ok) throw new Error(parsed.errors.join());
    const st = fakeStore({ pending: parsed.draft, content: { ...thought, pendingDraft: true } });
    const ctx: McpContext = { defaultProfileId: PESSOAL, profiles: async () => [], store: async () => st.store, createProfile: async () => "x" };
    const lido = JSON.parse(textOf(await call(ctx, "ler_roteiro", { content_id: ID })));
    expect(lido.draft).toBeNull();
    expect(lido.pendente.draft.title).toBe(draft.title);
    const ap = lido.aplicacao as { campo: string; aplicado: boolean }[];
    expect(ap.find((a) => a.campo === "takes (fala_exata)")!.aplicado).toBe(true);
    expect(ap.find((a) => a.campo === "publicacao_por_rede")!.aplicado).toBe(false);
    expect(ap.find((a) => a.campo === "legendas_na_tela[].estilo")!.aplicado).toBe(false);
    expect(textOf(await call(ctx, "conteudos_do_dia"))).toContain("roteiro do assistente aguardando abertura no app");
    expect(textOf(await call(ctx, "ler_status_gravacao", { content_id: ID }))).toContain("ainda não aberto no app");
  });

  it("validador: todos os erros de uma vez com o caminho; limites documentados; '20 segundos' passa", async () => {
    const { ctx } = fakeCtx();
    const many = textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, hook_options: ["um dois três quatro cinco seis sete oito nove dez onze doze treze", "b c", "d e"], direcao: { takes: [{ ordem: 1, nome: "A", fala_exata: "x y z", duracao_segundos: 3 }], musica: { id: "nao-existe" }, legendas_na_tela: [{ texto: "t", inicio: 4, fim: 1 }] } } }));
    expect(many).toMatch(/Ajuste tudo isto e salve de novo \(3 pontos\)/);
    expect(many).toContain("gancho 1 tem 13 palavras");
    expect(many).toContain('direcao.musica.id "nao-existe"');
    expect(many).toContain("direcao.legendas_na_tela[0]: fim precisa ser depois do início");
    const bad = textOf(await call(ctx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, direcao: { takes: [{ ordem: 1, nome: "A", duracao_segundos: 3 }], legendas_na_tela: [{ texto: "t", inicio: 0, fim: 1, estilo: "x".repeat(61) }] } } }));
    expect(bad).toContain("direcao.legendas_na_tela.0.estilo");
    const inst = textOf(await call(ctx, "instrucoes_do_roteiro", { content_id: ID }));
    expect(inst).toContain("direcao.legendas_na_tela[].estilo: string (0–60 caracteres)");
    expect(inst).toContain("direcao.musica.volume: number (0.05 a 0.6)");
    // empresa: "20 segundos" não é "20 anos de mercado"
    const empresa = fakeStore({ profile: CONTROLPOT_PROFILE });
    const ectx: McpContext = { defaultProfileId: EMPRESA, profiles: async () => [], store: async () => empresa.store, createProfile: async () => "x" };
    const r = textOf(await call(ectx, "salvar_roteiro", { content_id: ID, roteiro: { ...draft, script: `${draft.script} Bate por 20 segundos e fica cremoso.` } }));
    expect(r).not.toContain("alegação sem prova");
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
