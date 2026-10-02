import {
  buildManualPrompt, checkRepetition, describeRepetition, directorIssues, engagementRate, finalizeDraft, fingerprintsFor, mentionsPrice, parseDraft,
  normalizeText, pendingClaimsIn, projectBrief, sharesPer1k,
  type ContentDraft, type CreatorProfile, type EditChoices, type Fingerprint, type PostMetrics, type ProjectInfo,
} from "@postai/domain";

/** Ferramentas do conector (o “diretor de gravações”): perfis, plano, roteiro, desempenho e melhorias. */

export interface McpContent { id: string; format: string; pillarSlug: string; title: string; date: string; hasScript: boolean; project: ProjectInfo | null }
export interface McpPost { id: string; title: string; pillarSlug: string; format: string; date: string; postedAt: string | null; postedTo: string[]; metrics: PostMetrics | null }
export interface McpStrategy {
  pillars: { slug: string; name: string; targetPercent: number }[];
  routine: { weekday: number; startTime: string; title: string; format: string }[];
}
export interface McpScript { draft: ContentDraft | null; edit: EditChoices | null; metrics: PostMetrics | null; postedAt: string | null; pendingFromAssistant: boolean }
export interface McpImprovement { id: string; titulo: string; prioridade: string; status: string; issueNumber: number | null; createdAt: string }
export interface McpProfile { id: string; name: string; kind: "pessoal" | "empresa"; signature: string }

/** Tudo restrito a UM perfil (workspace) já conferido. */
export interface McpStore {
  contentsOn(date: string): Promise<McpContent[]>;
  content(id: string): Promise<McpContent | null>;
  profile(): Promise<CreatorProfile>;
  pillarName(slug: string): Promise<string>;
  recentFingerprints(): Promise<Fingerprint[]>;
  recentSummaries(): Promise<string[]>;
  saveDraft(contentId: string, draft: ContentDraft): Promise<void>;
  strategy(): Promise<McpStrategy>;
  /** posts recentes com quando/onde foram postados e os números anotados */
  posts(limit: number): Promise<McpPost[]>;
  readScript(contentId: string): Promise<McpScript>;
  /** cria o plano dos dias que ainda não têm (o app usa o mesmo plano ao abrir o dia) */
  planDays(startDate: string, days: number): Promise<{ date: string; created: boolean; items: McpContent[] }[]>;
  /** pilares com roteiro nos últimos N dias (contagem por slug) */
  pillarCounts(days: number): Promise<Record<string, number>>;
  /** assuntos (topic) dos roteiros dos últimos N dias e de qual conteúdo */
  recentTopics(days: number): Promise<{ topic: string; contentItemId: string | null }[]>;
  saveImprovement(i: { titulo: string; descricao: string; prioridade: string }): Promise<string>;
  improvements(): Promise<McpImprovement[]>;
}

/** Os perfis de quem é dono do link; cada chamada escolhe um (padrão: o perfil em que o link foi criado). */
export interface McpContext {
  defaultProfileId: string;
  profiles(): Promise<McpProfile[]>;
  /** null = perfil não existe ou a pessoa não pode escrever nele */
  store(profileId: string): Promise<McpStore | null>;
}

export const FORMAT_LABEL: Record<string, string> = { thought: "Pensamento do Dia", main_video: "Vídeo principal", story: "Story", broll: "Cena de apoio" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PLAN_DAYS = 14;
const PILLAR_WINDOW_DAYS = 30;
const TOPIC_WINDOW_DAYS = 14;
const MIN_POSTS_FOR_CONCLUSIONS = 5;
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const PROFILE_ARG = { profile_id: { type: "string", description: "id do perfil (listar_perfis). Sem ele: o perfil em que o link foi criado." } };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: { ...PROFILE_ARG, ...properties }, required, additionalProperties: false });
const RO = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };

export const MCP_TOOLS = [
  { name: "listar_perfis", title: "Perfis", description: "Lista os perfis do criador (pessoal, empresas…) com id, nome, tipo e assinatura. Use o id em profile_id nas outras ferramentas.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO },
  { name: "perfil_e_estrategia", title: "Perfil e estratégia", description: "Voz, posicionamento, fechamento, assinatura, temas com meta, rotina da semana e, se for empresa, produto, dores, objeções, provas e chamadas.", inputSchema: obj({}), annotations: RO },
  { name: "desempenho_dos_posts", title: "Desempenho dos posts", description: "Posts recentes: tema, formato, dia/hora e redes, visualizações, curtidas, comentários, compartilhamentos, salvamentos, engajamento e envios a cada mil.", inputSchema: obj({ limite: { type: "number", description: "quantos posts (padrão 30, máx. 100)" } }), annotations: RO },
  { name: "criar_plano", title: "Planejar dias", description: "Cria o plano (missões e conteúdos) a partir de uma data, para até 14 dias, seguindo a rotina e as metas dos temas. Dias já planejados ficam como estão.", inputSchema: obj({ data_inicio: { type: "string", description: "AAAA-MM-DD (padrão: hoje)" }, dias: { type: "number", description: "1 a 14 (padrão 7)" } }), annotations: WRITE },
  { name: "conteudos_do_dia", title: "Conteúdos do dia", description: "Conteúdos de uma data (padrão: hoje, Brasília) com id, formato, tema e se já tem roteiro. Datas futuras sem plano: use criar_plano antes.", inputSchema: obj({ data: { type: "string", description: "AAAA-MM-DD (opcional)" } }), annotations: RO },
  { name: "ler_roteiro", title: "Ler roteiro salvo", description: "Devolve o roteiro já salvo de um conteúdo (JSON completo), as escolhas de edição/música, os números e se há um roteiro do assistente esperando o app abrir.", inputSchema: obj({ content_id: { type: "string" } }, ["content_id"]), annotations: RO },
  { name: "instrucoes_do_roteiro", title: "Regras para o roteiro", description: "Regras do perfil (voz, formatos que viralizam, fechamento, o que não repetir), temas abaixo da meta nos últimos 30 dias, assuntos bloqueados por 14 dias e o JSON exato.", inputSchema: obj({ content_id: { type: "string", description: "id de conteudos_do_dia" }, acontecimento: { type: "string", description: "o que aconteceu hoje (opcional)" } }, ["content_id"]), annotations: RO },
  { name: "salvar_roteiro", title: "Salvar roteiro no app", description: "Valida (contrato, gancho ≤ 12 palavras, texto de tela 2–5 palavras, duração coerente, sem repetir, sem preço/alegação sem prova no comercial) e envia ao app. Se falhar, devolve o que corrigir.", inputSchema: obj({ content_id: { type: "string" }, roteiro: { type: "object", description: "o JSON completo do roteiro" } }, ["content_id", "roteiro"]), annotations: WRITE },
  { name: "registrar_melhoria", title: "Registrar melhoria", description: "Manda uma sugestão de melhoria do app/conector para o backlog do desenvolvedor, com contexto e critério de aceite. Use para toda recomendação de mudança no sistema.", inputSchema: obj({ titulo: { type: "string" }, descricao: { type: "string", description: "o problema, a proposta e o critério de aceite" }, prioridade: { type: "string", enum: ["baixa", "media", "alta"] } }, ["titulo", "descricao"]), annotations: WRITE },
  { name: "listar_melhorias", title: "Melhorias pedidas", description: "Melhorias já registradas e o andamento (nova, no backlog, feita, recusada).", inputSchema: obj({}), annotations: RO },
] as const;

type Json = Record<string, unknown>;
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
export const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

/** Hoje em Brasília (o plano do dia do criador é no horário local dele). */
export function todayBrasilia(now = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ISO → "qua 2026-10-01 19:30" no horário de Brasília. */
const brt = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString();
  return `${WEEKDAY[new Date(d.slice(0, 10)).getUTCDay()]} ${d.slice(0, 10)} ${d.slice(11, 16)}`;
};

async function describeStrategy(store: McpStore): Promise<string> {
  const [p, s] = await Promise.all([store.profile(), store.strategy()]);
  const lines = [
    `Perfil: ${p.displayName} (${p.kind === "empresa" ? "empresa" : "pessoal"}) · assinatura ${p.signature}`,
    `Posicionamento: ${p.positioning}`,
    `Voz: ${p.voiceRules.join("; ")}`,
    p.closingPhrase ? `Fechamento obrigatório: "${p.closingPhrase}"` : "",
    `Temas e meta: ${s.pillars.map((x) => `${x.name} ${x.targetPercent}%`).join(" · ")}`,
    `Rotina (horário de Brasília): ${s.routine.map((r) => `${WEEKDAY[r.weekday]} ${r.startTime} ${r.title} (${FORMAT_LABEL[r.format] ?? r.format})`).join(" · ") || "sem rotina"}`,
  ];
  const b = p.kind === "empresa" ? p.business : undefined;
  if (b) {
    lines.push(
      `Produto: ${b.product} · cliente: ${b.audience}`,
      `Dores: ${b.pains.join("; ")}`,
      `Objeções: ${b.objections.map((o) => `${o.objection} → ${o.answer}`).join("; ")}`,
      `Provas para filmar: ${b.proofs.join("; ")}`,
      `Diferenciais comprovados: ${b.differentiators.join("; ")}`,
      b.pendingClaims?.length ? `NÃO afirmar (sem prova): ${b.pendingClaims.join("; ")}` : "",
      `Chamadas: ${b.ctas.join("; ")}`,
      b.noPrice ? "Nunca falar preço." : "",
    );
  }
  return lines.filter(Boolean).join("\n");
}

async function describePosts(store: McpStore, limit: number): Promise<string> {
  const posts = await store.posts(limit);
  if (!posts.length) return "Ainda não há posts registrados. O app anota a hora ao tocar em POSTAR e os números em “Como foi este post?”.";
  const rows = await Promise.all(posts.map(async (x) => {
    const m = x.metrics;
    const nums = m
      ? `${m.views} visualizações · ${m.likes} curtidas · ${m.comments} comentários · ${m.shares} compartilhamentos · ${m.saves} salvamentos · engajamento ${(engagementRate(m) * 100).toFixed(1)}% · ${sharesPer1k(m).toFixed(1)} envios/mil`
      : "sem números anotados";
    const when = x.postedAt ? `postado ${brt(x.postedAt)}${x.postedTo.length ? ` em ${x.postedTo.join(", ")}` : ""}` : `planejado para ${x.date} (hora de postagem não registrada)`;
    return `- "${x.title}" · ${await store.pillarName(x.pillarSlug)} · ${FORMAT_LABEL[x.format] ?? x.format} · ${when} · ${nums}`;
  }));
  const withNumbers = posts.filter((x) => x.metrics).length;
  const warn = withNumbers < MIN_POSTS_FOR_CONCLUSIONS ? "\nAtenção: poucos posts com números — conclusões sobre horário e tema ainda são fracas." : "";
  return `${posts.length} posts (${withNumbers} com números):\n${rows.join("\n")}${warn}`;
}

/** Meta × realizado por tema nos últimos 30 dias, do mais atrasado ao mais adiantado. */
export async function pillarDeficit(store: McpStore): Promise<string> {
  const [{ pillars }, counts] = await Promise.all([store.strategy(), store.pillarCounts(PILLAR_WINDOW_DAYS)]);
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  if (!pillars.length) return "";
  const rows = pillars.map((p) => {
    const done = total ? Math.round(((counts[p.slug] ?? 0) / total) * 100) : 0;
    return { name: p.name, target: p.targetPercent, done, gap: p.targetPercent - done };
  }).sort((a, b) => b.gap - a.gap);
  return `Temas nos últimos ${PILLAR_WINDOW_DAYS} dias (meta × feito, ${total} roteiro(s)) — priorize os primeiros:\n${rows.map((r) => `- ${r.name}: meta ${r.target}% · feito ${r.done}%${r.gap > 0 ? ` (faltam ${r.gap} pontos)` : ""}`).join("\n")}`;
}

/** Assuntos dos últimos 14 dias agrupados (com contagem): não repetir. */
export async function blockedTopics(store: McpStore): Promise<string> {
  const topics = await store.recentTopics(TOPIC_WINDOW_DAYS);
  if (!topics.length) return "";
  const counts = new Map<string, number>();
  for (const { topic } of topics) {
    const k = topic.trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}${n > 1 ? ` (${n}x)` : ""}`);
  return `Assuntos BLOQUEADOS (usados nos últimos ${TOPIC_WINDOW_DAYS} dias — escolha outro):\n${list.join("\n")}`;
}

function clampDays(v: unknown): number {
  return typeof v === "number" && v >= 1 ? Math.min(MAX_PLAN_DAYS, Math.floor(v)) : 7;
}

/** Ferramentas que trabalham dentro de um perfil já escolhido. */
export async function callProfileTool(store: McpStore, name: string, args: Json, now: Date): Promise<ToolResult> {
  if (name === "perfil_e_estrategia") return text(await describeStrategy(store));
  if (name === "desempenho_dos_posts") {
    const n = typeof args.limite === "number" && args.limite > 0 ? Math.min(100, Math.floor(args.limite)) : 30;
    return text(await describePosts(store, n));
  }
  if (name === "criar_plano") {
    const start = typeof args.data_inicio === "string" && DATE.test(args.data_inicio) ? args.data_inicio : todayBrasilia(now);
    const days = await store.planDays(start, clampDays(args.dias));
    const lines = await Promise.all(days.map(async (d) => {
      const items = await Promise.all(d.items.map(async (c) => `  · id ${c.id} · ${FORMAT_LABEL[c.format] ?? c.format} · ${await store.pillarName(c.pillarSlug)}${c.hasScript ? " · já tem roteiro" : ""}`));
      return `${d.date}${d.created ? " (plano criado agora)" : ""}:\n${items.join("\n") || "  · sem gravação de roteiro neste dia"}`;
    }));
    return text(`Plano:\n${lines.join("\n")}\nUse instrucoes_do_roteiro e salvar_roteiro em cada id. O app mostra estes mesmos conteúdos no dia.`);
  }
  if (name === "conteudos_do_dia") {
    const date = typeof args.data === "string" && DATE.test(args.data) ? args.data : todayBrasilia(now);
    const items = await store.contentsOn(date);
    if (!items.length) return text(`Nada planejado para ${date}. Use criar_plano com data_inicio ${date} (ou o criador abre o Post.ai no dia).`);
    const lines = await Promise.all(items.map(async (c) =>
      `- id ${c.id} · ${FORMAT_LABEL[c.format] ?? c.format} · tema: ${await store.pillarName(c.pillarSlug)} · ${c.hasScript ? "já tem roteiro (use ler_roteiro; salvar substitui)" : "sem roteiro"}`));
    return text(`Conteúdos de ${date}:\n${lines.join("\n")}`);
  }
  if (name === "registrar_melhoria") {
    const titulo = String(args.titulo ?? "").trim().slice(0, 140);
    const descricao = String(args.descricao ?? "").trim().slice(0, 4000);
    const prioridade = ["baixa", "media", "alta"].includes(String(args.prioridade)) ? String(args.prioridade) : "media";
    if (titulo.length < 3 || descricao.length < 3) return text("Dê um título e uma descrição (problema, proposta e critério de aceite).", true);
    const id = await store.saveImprovement({ titulo, descricao, prioridade });
    return text(`Melhoria registrada (id ${id}). Ela entra no backlog do desenvolvedor; acompanhe com listar_melhorias.`);
  }
  if (name === "listar_melhorias") {
    const list = await store.improvements();
    if (!list.length) return text("Nenhuma melhoria registrada ainda.");
    return text(list.map((m) => `- [${m.status}] ${m.titulo} (prioridade ${m.prioridade}${m.issueNumber ? ` · item #${m.issueNumber}` : ""})`).join("\n"));
  }

  const id = typeof args.content_id === "string" ? args.content_id : "";
  const content = id ? await store.content(id) : null;
  if (!content) return text("Conteúdo não encontrado neste perfil. Use um id de conteudos_do_dia ou criar_plano.", true);

  if (name === "ler_roteiro") {
    const s = await store.readScript(content.id);
    return text(JSON.stringify({ content_id: content.id, data: content.date, formato: content.format, tema: await store.pillarName(content.pillarSlug), ...s }, null, 2));
  }
  if (content.format !== "thought" && content.format !== "main_video") return text("Este conteúdo não usa roteiro falado (é cena de apoio/story).", true);

  if (name === "instrucoes_do_roteiro") {
    const [profile, pillarName, recentSummaries, deficit, blocked] = await Promise.all([
      store.profile(), store.pillarName(content.pillarSlug), store.recentSummaries(), pillarDeficit(store), blockedTopics(store),
    ]);
    const eventText = typeof args.acontecimento === "string" && args.acontecimento.trim() ? args.acontecimento.trim().slice(0, 1500) : null;
    const prompt = buildManualPrompt({ profile, pillarName, format: content.format, eventText, brief: content.project ? projectBrief(content.project) : null, recentSummaries, avoid: "" });
    return text([prompt, deficit, blocked, "Regras do diretor: gancho ≤ 12 palavras; screen_text 2–5 palavras; duration_seconds ≈ palavras do script ÷ 2,5."].filter(Boolean).join("\n\n"));
  }

  if (name === "salvar_roteiro") {
    const profile = await store.profile();
    const parsed = parseDraft({ ...(args.roteiro as Json), format: content.format });
    if (!parsed.ok) return text(`O roteiro não passou na validação. Corrija e salve de novo:\n- ${parsed.errors.join("\n- ")}`, true);
    const draft = finalizeDraft(parsed.draft, profile);
    const rules = directorIssues(draft);
    if (rules.length) return text(`Ajuste e salve de novo:\n- ${rules.join("\n- ")}`, true);
    const biz = profile.kind === "empresa" ? profile.business : undefined;
    if (biz?.noPrice && mentionsPrice(draft)) return text("O roteiro fala preço/valor. Neste perfil de empresa preço não aparece no vídeo: reescreva sem preço.", true);
    const unproven = biz ? pendingClaimsIn(`${draft.script} ${draft.cta}`, biz.pendingClaims ?? []) : [];
    if (unproven.length) return text(`O roteiro afirma algo ainda sem prova: ${unproven.join("; ")}. Reescreva sem isso.`, true);
    // memória de repetição + assuntos bloqueados (14 dias), sem contar o próprio conteúdo (reescrever é permitido)
    const [fps, topics] = await Promise.all([store.recentFingerprints(), store.recentTopics(TOPIC_WINDOW_DAYS)]);
    const recent: Fingerprint[] = [...fps, ...topics.map((t) => ({ type: "topic" as const, value: normalizeText(t.topic), contentItemId: t.contentItemId }))]
      .filter((f) => f.contentItemId !== content.id);
    const report = checkRepetition(fingerprintsFor(draft), recent);
    if (report.repeated) {
      const ids = [...new Set(report.hits.map((h) => h.previousContentId).filter((x): x is string => Boolean(x)))];
      const olds = new Map((await Promise.all(ids.map((i) => store.content(i)))).filter((c): c is McpContent => Boolean(c)).map((c) => [c.id, c]));
      const label = (i: string) => {
        const c = olds.get(i);
        return c ? `"${c.title}" · ${FORMAT_LABEL[c.format] ?? c.format} de ${c.date} · id ${c.id}` : undefined;
      };
      return text(`Parece repetir conteúdo recente. Mude isto e salve de novo:\n- ${describeRepetition(report, label).join("\n- ")}`, true);
    }
    await store.saveDraft(content.id, draft);
    return text(`Roteiro "${draft.title}" enviado para o Post.ai. Ele aparece no app ao abrir este conteúdo.`);
  }
  return text(`Ferramenta desconhecida: ${name}`, true);
}

/** Escolhe o perfil da chamada e executa. listar_perfis não precisa de perfil. */
export async function callTool(ctx: McpContext, name: string, args: Json, now: Date): Promise<ToolResult> {
  if (name === "listar_perfis") {
    const list = await ctx.profiles();
    return text(list.map((p) => `- id ${p.id} · ${p.name} · ${p.kind}${p.id === ctx.defaultProfileId ? " (padrão deste link)" : ""} · assinatura ${p.signature}`).join("\n") || "Nenhum perfil.");
  }
  const profileId = typeof args.profile_id === "string" && args.profile_id ? args.profile_id : ctx.defaultProfileId;
  const store = await ctx.store(profileId);
  if (!store) return text("Perfil não encontrado para este link. Use um id de listar_perfis.", true);
  return callProfileTool(store, name, args, now);
}
