import {
  AUTOCUT_THEMES, MOOD_LABEL, MUSIC_LIBRARY, buildManualPrompt, contractLimits, directionReport, normalizeMood, buildSegments, checkRepetition, describeRepetition, directionIssues, directorIssues, engagementRate, finalizeDraft, fingerprintsFor, mentionsPrice, parseDraft,
  normalizeText, pendingClaimsIn, projectBrief, rankBy, sharesPer1k, type RankRow, type RankedPost,
  ScenesSchema, describeEditProposal, ownMusicId, parseEditProposal, type EditProposal, type ContentDraft, type CreatorProfile, type OwnMusic, type Scenes, type EditChoices, type Fingerprint, type PostMetrics, type ProjectInfo,
} from "@postai/domain";
import {
  PROFILE_TOOLS, authorized, callAccountTool, callProfileDataTool, describeCases, describeProofs, type NewProfile, type ProfileDataStore,
} from "./mcp-profiles";

/** Pilar de "Histórias de cliente" nos perfis de empresa: exige caso real autorizado. */
const CLIENT_STORY_PILLAR = "historias";

/** Ferramentas do conector (o “diretor de gravações”): perfis, plano, roteiro, desempenho e melhorias. */

export interface McpContent {
  id: string; format: string; pillarSlug: string; title: string; date: string; hasScript: boolean; project: ProjectInfo | null;
  /** roteiro/cenas do assistente enviados e ainda não abertos no app */
  pendingDraft?: boolean;
}
export interface McpPost {
  id: string; title: string; pillarSlug: string; format: string; date: string; postedAt: string | null; postedTo: string[]; metrics: PostMetrics | null;
  /** gancho usado e música usada (para descobrir o que funciona) */
  hook?: string | null; music?: string | null;
}
export interface McpStrategy {
  pillars: { slug: string; name: string; targetPercent: number }[];
  routine: { weekday: number; startTime: string; title: string; format: string }[];
}
export interface McpScript {
  draft: ContentDraft | null; edit: EditChoices | null; metrics: PostMetrics | null; postedAt: string | null; pendingFromAssistant: boolean; scenes?: Scenes | null;
  pending?: { sentAt: string; draft: ContentDraft | null; scenes: Scenes | null } | null;
}
export interface McpImprovement { id: string; titulo: string; prioridade: string; status: string; issueNumber: number | null; createdAt: string }
export interface McpProfile { id: string; name: string; kind: "pessoal" | "empresa"; signature: string }
export interface McpRecording {
  /** takes válidos (não descartados): parte gravada (null = vídeo inteiro de uma vez) e se já subiu */
  takes: { segmentIndex: number | null; synced: boolean }[];
  /** montagens mais recentes primeiro */
  renders: { status: string; error: string | null; createdAt: string; variant: string; warnings: string[] }[];
}

/** Tudo restrito a UM perfil (workspace) já conferido. */
export interface McpStore extends ProfileDataStore {
  contentsOn(date: string): Promise<McpContent[]>;
  content(id: string): Promise<McpContent | null>;
  profile(): Promise<CreatorProfile>;
  pillarName(slug: string): Promise<string>;
  recentFingerprints(): Promise<Fingerprint[]>;
  recentSummaries(): Promise<string[]>;
  saveDraft(contentId: string, draft: ContentDraft): Promise<void>;
  /** cena de apoio dirigida (B-roll): lista de takes que o app mostra para gravar */
  saveScenes(contentId: string, scenes: Scenes): Promise<void>;
  strategy(): Promise<McpStrategy>;
  /** posts recentes com quando/onde foram postados e os números anotados */
  posts(limit: number): Promise<McpPost[]>;
  /** números do post importados pelo assistente (ex.: lidos no Metricool) */
  saveMetrics(contentId: string, metrics: PostMetrics): Promise<void>;
  readScript(contentId: string): Promise<McpScript>;
  recordingStatus(contentId: string): Promise<McpRecording>;
  /** músicas próprias que o criador enviou no app (com a licença declarada) */
  ownMusic(): Promise<OwnMusic[]>;
  /** faixas favoritadas no app por quem é do perfil (ids da biblioteca ou own:<id>) */
  musicFavorites(): Promise<string[]>;
  /** proposta de edição do diretor: o app mostra MONTAR ASSIM / AJUSTAR; nada monta sem o criador */
  saveEditProposal(contentId: string, edit: EditProposal, motivo: string): Promise<void>;
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
  /** cria um perfil novo (workspace) do dono do link; devolve o id */
  createProfile(p: NewProfile): Promise<string>;
}

export const FORMAT_LABEL: Record<string, string> = { thought: "Pensamento do Dia", main_video: "Vídeo principal", story: "Story", broll: "Cena de apoio" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PLAN_DAYS = 14;
const PILLAR_WINDOW_DAYS = 30;
const TOPIC_WINDOW_DAYS = 14;
const MIN_POSTS_FOR_CONCLUSIONS = 5;
const AUTOCUT_IDS = AUTOCUT_THEMES.map((t) => t.id);
const BPM_TOLERANCE = 10;
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Como preencher a direção completa (vai junto do roteiro em salvar_roteiro). */
export const DIRECTION_GUIDE = [
  "DIREÇÃO COMPLETA (campo \"direcao\" no mesmo JSON do roteiro — o app grava, legenda, mixa e exporta só com isto):",
  "- takes[]: {ordem, nome, fala_exata (palavra por palavra; vazio = cena sem fala), ritmo (pausas), duracao_segundos, enquadramento, movimento_camera, local, luz, olhar, emocao, broll, erro_comum}. Cada take com fala vira uma parte gravada, na ordem.",
  "- legendas_na_tela[]: {texto (2–5 palavras), inicio, fim (segundos do vídeo final), posicao: topo|centro|base, estilo}. Substituem o gancho automático na tela. Regra fixa do app: texto na tela SEMPRE acima da cabeça e legenda da fala SEMPRE abaixo do queixo (a posição pedida é ignorada para nunca cobrir o rosto).",
  "- musica: {id (de listar_musicas), clima, bpm (null se não souber), volume 0.05–0.6 relativo à voz (0.22 padrão), entrada, saida (segundos; saida null = até o fim)}. Empresa: só licença comercial.",
  "- edicao: {cortes, transicao, zoom} · capa: {frame (segundo do vídeo), texto curto} · publicacao_por_rede[]: {rede: instagram|tiktok|facebook|youtube_shorts, horario HH:MM, hashtags, primeiro_comentario}",
  "- teste_ab: {ganchos: 2–3 ganchos, metrica}. Os ganchos também vão em hook_options.",
  "- local, luz e enquadramento precisam ser possíveis NO HORÁRIO do conteúdo (rotina) e no lugar real do criador: não peça calçada/luz natural para algo que ele grava à noite em casa. Se não souber onde ele vai gravar, pergunte antes ou dê uma alternativa (\"em casa: perto de uma lâmpada, de frente\"). Instruções de fala (ritmo, emoção, olhar) devem citar trechos da própria fala_exata.",
].join("\n");

const PROFILE_ARG = { profile_id: { type: "string", description: "id do perfil (listar_perfis). Sem ele: o perfil em que o link foi criado." } };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: { ...PROFILE_ARG, ...properties }, required, additionalProperties: false });
const RO = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };

export const MCP_TOOLS = [
  { name: "listar_perfis", title: "Perfis", description: "Lista os perfis do criador (pessoal, empresas…) com id, nome, tipo e assinatura. Use o id em profile_id nas outras ferramentas.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO },
  { name: "perfil_e_estrategia", title: "Perfil e estratégia", description: "Voz, posicionamento, fechamento, assinatura, temas com meta, rotina da semana e, se for empresa, produto, dores, objeções, provas e chamadas.", inputSchema: obj({}), annotations: RO },
  { name: "desempenho_dos_posts", title: "Desempenho dos posts", description: "Posts recentes: tema, formato, dia/hora e redes, gancho e música usados, visualizações, curtidas, comentários, compartilhamentos, salvamentos, engajamento, envios a cada mil, retenção, tempo médio e seguidores; no fim, o top 3 de ganchos, formatos, horários e músicas.", inputSchema: obj({ limite: { type: "number", description: "quantos posts (padrão 30, máx. 100)" } }), annotations: RO },
  { name: "criar_plano", title: "Planejar dias", description: "Cria o plano (missões e conteúdos) a partir de uma data, para até 14 dias, seguindo a rotina e as metas dos temas. Dias já planejados ficam como estão.", inputSchema: obj({ data_inicio: { type: "string", description: "AAAA-MM-DD (padrão: hoje)" }, dias: { type: "number", description: "1 a 14 (padrão 7)" } }), annotations: WRITE },
  { name: "conteudos_do_dia", title: "Conteúdos do dia", description: "Conteúdos de uma data (padrão: hoje, Brasília) com id, formato, tema e se já tem roteiro. Datas futuras sem plano: use criar_plano antes.", inputSchema: obj({ data: { type: "string", description: "AAAA-MM-DD (opcional)" } }), annotations: RO },
  { name: "ler_roteiro", title: "Ler roteiro salvo", description: "Devolve o roteiro já salvo de um conteúdo (JSON completo), as escolhas de edição/música, os números e se há um roteiro do assistente esperando o app abrir.", inputSchema: obj({ content_id: { type: "string" } }, ["content_id"]), annotations: RO },
  { name: "instrucoes_do_roteiro", title: "Regras para o roteiro", description: "Regras do perfil (voz, formatos que viralizam, fechamento, o que não repetir), temas abaixo da meta nos últimos 30 dias, assuntos bloqueados por 14 dias e o JSON exato.", inputSchema: obj({ content_id: { type: "string", description: "id de conteudos_do_dia" }, acontecimento: { type: "string", description: "o que aconteceu hoje (opcional)" } }, ["content_id"]), annotations: RO },
  { name: "salvar_roteiro", title: "Salvar roteiro no app", description: "Valida (contrato, gancho ≤ 12 palavras, texto de tela 2–5 palavras, duração coerente, sem repetir, sem preço/alegação sem prova no comercial) e envia ao app. Se falhar, devolve o que corrigir.", inputSchema: obj({ content_id: { type: "string" }, roteiro: { type: "object", description: "o JSON completo do roteiro" } }, ["content_id", "roteiro"]), annotations: WRITE },
  { name: "salvar_cenas", title: "Salvar cenas de apoio", description: "Para conteúdo de cena de apoio (B-roll / prova visual): a lista de takes com instrução de filmagem. O app mostra cada take para gravar.", inputSchema: obj({ content_id: { type: "string" }, takes: { type: "array", description: "takes {ordem, nome, duracao_segundos, enquadramento, movimento_camera, local, luz, olhar, emocao, broll, erro_comum, fala_exata (opcional)}", items: { type: "object" } }, provas: { type: "array", items: { type: "string" }, description: "provas filmáveis do perfil que esta cena filma (ficam 'filmada' quando a cena for gravada)" } }, ["content_id", "takes"]), annotations: WRITE },
  { name: "registrar_metricas", title: "Registrar números do post", description: "Salva os números REAIS de um post (ex.: lidos no Metricool ou no painel da rede) para o app e o ranking. Nunca invente números.", inputSchema: obj({ content_id: { type: "string" }, visualizacoes: { type: "number" }, curtidas: { type: "number" }, comentarios: { type: "number" }, compartilhamentos: { type: "number" }, salvamentos: { type: "number" }, retencao: { type: "number", description: "% de conclusão/retenção média (0–100)" }, tempo_medio_segundos: { type: "number" }, seguidores_ganhos: { type: "number" }, fonte: { type: "string", description: "ex.: Metricool, Instagram" } }, ["content_id", "visualizacoes"]), annotations: WRITE },
  { name: "listar_musicas", title: "Músicas licenciadas", description: "Faixas da biblioteca licenciada (id, clima, duração, licença). Use o id em direcao.musica.id. Conta de empresa só vê faixas com licença comercial.", inputSchema: obj({ clima: { type: "string", description: `opcional: ${Object.keys(MOOD_LABEL).join(", ")}` }, bpm: { type: "number", description: "opcional (as faixas ainda não têm BPM medido)" } }), annotations: RO },
  { name: "propor_edicao", title: "Propor a edição", description: "Depois de ver o que foi gravado (ler_status_gravacao), propõe a montagem: estilo AutoCut, música, volume e trecho, com o motivo. O criador vê no app e escolhe MONTAR ASSIM (monta) ou AJUSTAR. Nada é montado nem publicado sem ele.", inputSchema: obj({ content_id: { type: "string" }, autocut: { type: "string", enum: [...AUTOCUT_IDS], description: `estilo da montagem (cortes, zoom, transição, ritmo): ${AUTOCUT_THEMES.map((t) => `${t.id} = ${t.label.replace(/^\S+\s/, "")}`).join("; ")}` }, musica: { type: "string", description: "id de listar_musicas, \"auto\", \"none\" ou um clima" }, volume: { type: "number", description: "0.05 a 0.45, relativo à voz (0.22 padrão)" }, inicio_musica_s: { type: "number", description: "segundo da faixa onde a trilha começa (só com faixa específica)" }, motivo: { type: "string", description: "por que esta edição, em 1–2 frases simples" } }, ["content_id", "motivo"]), annotations: WRITE },
  { name: "ler_status_gravacao", title: "Status da gravação", description: "O que já foi gravado (por take/parte), o que falta, se já subiu e como está a montagem do vídeo.", inputSchema: obj({ content_id: { type: "string" } }, ["content_id"]), annotations: RO },
  { name: "registrar_melhoria", title: "Registrar melhoria", description: "Manda uma sugestão de melhoria do app/conector para o backlog do desenvolvedor, com contexto e critério de aceite. Use para toda recomendação de mudança no sistema.", inputSchema: obj({ titulo: { type: "string" }, descricao: { type: "string", description: "o problema, a proposta e o critério de aceite" }, prioridade: { type: "string", enum: ["baixa", "media", "alta"] } }, ["titulo", "descricao"]), annotations: WRITE },
  { name: "listar_melhorias", title: "Melhorias pedidas", description: "Melhorias já registradas e o andamento (nova, no backlog, feita, recusada).", inputSchema: obj({}), annotations: RO },
  ...PROFILE_TOOLS,
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
    p.kind === "empresa"
      ? "Como ler a rotina: Vídeo principal = conteúdo com roteiro (salvar_roteiro); Cena de apoio/prova visual = conteúdo sem fala com lista de takes (salvar_cenas, ligada às provas filmáveis)."
      : "Como ler a rotina: só Pensamento do Dia e Vídeo principal têm roteiro (2 conteúdos por dia). Os demais horários são cenas de apoio de ~3s (café, trabalho, academia…) sem roteiro: o app guarda e usa por cima da fala na montagem do vídeo do dia. Sábado e domingo não têm rotina.",
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
  if (b) {
    const [cases, proofs] = await Promise.all([store.realCases(), store.proofs()]);
    lines.push(describeCases(cases), describeProofs(b.proofs, proofs));
  }
  const x = p.extras;
  if (x) {
    lines.push(
      x.audience ? `Público: ${x.audience}` : "", x.offers?.length ? `Ofertas: ${x.offers.join("; ")}` : "", x.goals ? `Metas: ${x.goals}` : "",
      x.networks?.length ? `Redes: ${x.networks.join(", ")}${x.accountType ? ` (conta ${x.accountType})` : ""}` : "",
    );
  }
  return lines.filter(Boolean).join("\n");
}

async function describePosts(store: McpStore, limit: number): Promise<string> {
  const posts = await store.posts(limit);
  if (!posts.length) return "Ainda não há posts registrados. O app anota a hora ao tocar em POSTAR e os números em “Como foi este post?”.";
  const rows = await Promise.all(posts.map(async (x) => {
    const m = x.metrics;
    const extra = m ? [
      m.completionRate !== undefined ? `retenção ${m.completionRate}%` : "", m.avgWatchSeconds !== undefined ? `tempo médio ${m.avgWatchSeconds}s` : "",
      m.followersGained !== undefined ? `+${m.followersGained} seguidores` : "", m.source ? `fonte: ${m.source}` : "",
    ].filter(Boolean) : [];
    const nums = m
      ? `${m.views} visualizações · ${m.likes} curtidas · ${m.comments} comentários · ${m.shares} compartilhamentos · ${m.saves} salvamentos · engajamento ${(engagementRate(m) * 100).toFixed(1)}% · ${sharesPer1k(m).toFixed(1)} envios/mil${extra.length ? ` · ${extra.join(" · ")}` : ""}`
      : "sem números anotados";
    const when = x.postedAt ? `postado ${brt(x.postedAt)}${x.postedTo.length ? ` em ${x.postedTo.join(", ")}` : ""}` : `planejado para ${x.date} (hora de postagem não registrada)`;
    const used = [x.hook ? `gancho "${x.hook}"` : "", x.music ? `música ${x.music}` : ""].filter(Boolean).join(" · ");
    return `- id ${x.id} · "${x.title}" · ${await store.pillarName(x.pillarSlug)} · ${FORMAT_LABEL[x.format] ?? x.format} · ${when}${used ? ` · ${used}` : ""} · ${nums}`;
  }));
  const withNumbers = posts.filter((x) => x.metrics).length;
  const warn = withNumbers < MIN_POSTS_FOR_CONCLUSIONS ? "\nAtenção: poucos posts com números — conclusões sobre horário e tema ainda são fracas." : "";
  return `${posts.length} posts (${withNumbers} com números):\n${rows.join("\n")}${warn}${describeWinners(posts)}`;
}

/** Top 3 ganchos, formatos, horários e músicas dos posts com números (média de visualizações). */
function describeWinners(posts: readonly McpPost[]): string {
  const ranked: RankedPost[] = posts.filter((p) => p.metrics).map((p) => ({
    hook: p.hook ?? null, format: FORMAT_LABEL[p.format] ?? p.format, music: p.music ?? null, metrics: p.metrics!,
    hour: p.postedAt ? Number(new Date(new Date(p.postedAt).getTime() - 3 * 3600_000).toISOString().slice(11, 13)) : null,
  }));
  if (!ranked.length) return "";
  const block = (title: string, rows: RankRow[]) => (rows.length ? `${title}:\n${rows.map((r, i) => `  ${i + 1}. ${r.key} — ${r.avgViews.toLocaleString("pt-BR")} visualizações em média · ${r.avgSharesPer1k.toFixed(1)} envios/mil${r.avgCompletion !== null ? ` · retenção ${r.avgCompletion.toFixed(0)}%` : ""} (${r.posts} post${r.posts > 1 ? "s" : ""})`).join("\n")}` : "");
  return `\n\nO QUE ESTÁ FUNCIONANDO (top 3, ${ranked.length} posts com números):\n${[
    block("Ganchos", rankBy(ranked, (p) => p.hook)), block("Formatos", rankBy(ranked, (p) => p.format)),
    block("Horários (Brasília)", rankBy(ranked, (p) => (p.hour === null ? null : `${String(p.hour).padStart(2, "0")}h`))), block("Músicas", rankBy(ranked, (p) => p.music)),
  ].filter(Boolean).join("\n")}`;
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

/** " · já tem roteiro" / " · roteiro do assistente aguardando abertura no app" / "" */
function scriptState(c: McpContent): string {
  if (c.pendingDraft) return " · roteiro do assistente aguardando abertura no app (use ler_roteiro; salvar substitui)";
  return c.hasScript ? " · já tem roteiro (use ler_roteiro; salvar substitui)" : "";
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
  if (name === "registrar_metricas") {
    const id = typeof args.content_id === "string" ? args.content_id : "";
    if (!id || !(await store.content(id))) return text("Conteúdo não encontrado neste perfil. Use o id que aparece em desempenho_dos_posts.", true);
    const int = (k: string) => (typeof args[k] === "number" && (args[k] as number) >= 0 ? Math.round(args[k] as number) : null);
    const dec = (k: string) => (typeof args[k] === "number" && (args[k] as number) >= 0 ? (args[k] as number) : undefined);
    const views = int("visualizacoes");
    if (views === null) return text("Informe pelo menos visualizacoes (número). Não invente: use só o que a ferramenta de métricas mostrou.", true);
    const retencao = dec("retencao");
    if (retencao !== undefined && retencao > 100) return text("retencao é em % (0 a 100).", true);
    const m: PostMetrics = {
      views, likes: int("curtidas") ?? 0, comments: int("comentarios") ?? 0, shares: int("compartilhamentos") ?? 0, saves: int("salvamentos") ?? 0, updatedAt: now.toISOString(),
      ...(retencao !== undefined ? { completionRate: retencao } : {}), ...(dec("tempo_medio_segundos") !== undefined ? { avgWatchSeconds: dec("tempo_medio_segundos") } : {}),
      ...(int("seguidores_ganhos") !== null ? { followersGained: int("seguidores_ganhos")! } : {}),
      source: typeof args.fonte === "string" && args.fonte.trim() ? args.fonte.trim().slice(0, 60) : "assistente",
    };
    await store.saveMetrics(id, m);
    return text(`Números salvos para ${id} (${m.views} visualizações, fonte ${m.source}). Aparecem no app em Resultados.`);
  }
  if (name === "criar_plano") {
    const start = typeof args.data_inicio === "string" && DATE.test(args.data_inicio) ? args.data_inicio : todayBrasilia(now);
    const days = await store.planDays(start, clampDays(args.dias));
    const lines = await Promise.all(days.map(async (d) => {
      const items = await Promise.all(d.items.map(async (c) => `  · id ${c.id} · ${FORMAT_LABEL[c.format] ?? c.format} · ${await store.pillarName(c.pillarSlug)}${scriptState(c)}`));
      return `${d.date}${d.created ? " (plano criado agora)" : ""}:\n${items.join("\n") || "  · sem gravação de roteiro neste dia"}`;
    }));
    return text(`Plano:\n${lines.join("\n")}\nUse instrucoes_do_roteiro e salvar_roteiro em cada id. O app mostra estes mesmos conteúdos no dia.`);
  }
  if (name === "conteudos_do_dia") {
    const date = typeof args.data === "string" && DATE.test(args.data) ? args.data : todayBrasilia(now);
    const items = await store.contentsOn(date);
    if (!items.length) return text(`Nada planejado para ${date}. Use criar_plano com data_inicio ${date} (ou o criador abre o Post.ai no dia).`);
    const lines = await Promise.all(items.map(async (c) =>
      `- id ${c.id} · ${FORMAT_LABEL[c.format] ?? c.format} · tema: ${await store.pillarName(c.pillarSlug)} · ${scriptState(c).replace(/^ · /, "") || "sem roteiro"}`));
    return text(`Conteúdos de ${date}:\n${lines.join("\n")}`);
  }
  if (name === "listar_musicas") {
    const business = (await store.profile()).kind === "empresa";
    const mood = typeof args.clima === "string" ? normalizeMood(args.clima) || null : null;
    const bpm = typeof args.bpm === "number" ? args.bpm : null;
    const favs = new Set(await store.musicFavorites());
    const fav = (id: string) => (favs.has(id) ? " · ♥ favorita do criador" : "");
    const list = MUSIC_LIBRARY.filter((t) => (!business || t.license === "comercial") && (!mood || t.mood === mood) && (bpm === null || (t.bpm !== null && Math.abs(t.bpm - bpm) <= BPM_TOLERANCE)));
    // músicas próprias do criador (sem clima/BPM medidos); empresa só vê as com licença comercial declarada
    const own = (await store.ownMusic()).filter((m) => !business || m.comercial);
    const ownRows = mood || bpm !== null ? [] : own.map((m) => `- id ${ownMusicId(m.id)} · "${m.titulo}" · música própria do criador · licença ${m.comercial ? "comercial (declarada)" : "pessoal (declarada)"}${fav(ownMusicId(m.id))}`);
    if (!list.length && !ownRows.length) return text(`Nenhuma faixa com esse filtro${bpm !== null ? ` (BPM ${bpm} ± ${BPM_TOLERANCE})` : ""}.`);
    // favoritas primeiro (o criador já gostou delas)
    const rows = [...list].sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)))
      .map((t) => `- id ${t.id} · "${t.title}" — ${t.artist} · clima ${t.mood} (${MOOD_LABEL[t.mood]}) · ${t.bpm ? `${t.bpm} BPM` : "sem batida definida"} · ${t.durationSec}s · licença ${t.license}${fav(t.id)}`);
    const note = `Use o valor de "clima" (ex.: ${list[0]?.mood ?? "reflexao"}) em direcao.musica.clima. BPM medido no áudio. Tendência ("em alta"): ainda sem fonte de dados — não informada.`;
    return text([...ownRows, ...rows, note].join("\n"));
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
    const { pending, ...s } = await store.readScript(content.id);
    const current = pending?.draft ?? s.draft;
    return text(JSON.stringify({
      content_id: content.id, data: content.date, formato: content.format, tema: await store.pillarName(content.pillarSlug), ...s,
      // o que o assistente enviou e o app ainda não abriu
      pendente: pending ?? null,
      // o que o app e a montagem fazem com a direção deste roteiro (o que não for aplicado vem dito)
      aplicacao: current?.direcao ? directionReport(current.direcao) : null,
    }, null, 2));
  }
  if (name === "ler_status_gravacao") {
    const [rec, script, profile] = await Promise.all([store.recordingStatus(content.id), store.readScript(content.id), store.profile()]);
    const lines: string[] = [];
    const draft = script.draft ?? script.pending?.draft ?? null;
    if (!script.draft && draft) lines.push("(roteiro do assistente ainda não aberto no app — as partes abaixo valem depois que o criador abrir o conteúdo)");
    if (draft) {
      const segs = buildSegments(draft, { selectedHook: 0, userEdited: false, closingPhrase: profile.closingPhrase, business: profile.kind === "empresa" });
      for (const sg of segs) {
        const t = rec.takes.filter((x) => x.segmentIndex === sg.index);
        lines.push(`- ${sg.index + 1}. ${sg.label}: ${!t.length ? "falta gravar" : t.some((x) => x.synced) ? "gravado e enviado" : "gravado, ainda subindo"}`);
      }
    } else lines.push("- ainda sem roteiro");
    const whole = rec.takes.filter((x) => x.segmentIndex === null);
    if (whole.length) lines.push(`- vídeo inteiro de uma vez: ${whole.some((x) => x.synced) ? "enviado" : "ainda subindo"}`);
    const r = rec.renders[0];
    const render = !r ? "ainda não pediu a montagem" : r.status === "done" ? `montado (${r.variant})${r.warnings.length ? ` — avisos: ${r.warnings.join("; ")}` : ""}` : r.status === "failed" ? `montagem falhou: ${r.error ?? "erro"}` : r.status === "rendering" ? "montando agora" : "na fila para montar";
    const posted = script.postedAt ? `\nPostado em ${brt(script.postedAt)}` : "";
    return text(`Gravação de "${content.title}" (${content.date}):\n${lines.join("\n")}\nMontagem: ${render}${posted}`);
  }
  if (name === "salvar_cenas") {
    if (content.format !== "broll") return text("salvar_cenas é só para cena de apoio (B-roll). Para vídeo com fala use salvar_roteiro (com direcao.takes).", true);
    const parsed = ScenesSchema.safeParse(args.takes);
    if (!parsed.success) return text(`Takes inválidos:\n- ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n- ")}`, true);
    const profile = await store.profile();
    const biz = profile.kind === "empresa" ? profile.business : undefined;
    const unproven = biz ? pendingClaimsIn(parsed.data.map((t) => `${t.fala_exata} ${t.broll}`).join(" "), biz.pendingClaims ?? []) : [];
    if (unproven.length) return text(`A cena afirma algo ainda sem prova: ${unproven.join("; ")}.`, true);
    await store.saveScenes(content.id, parsed.data);
    // provas que esta cena filma: ficam ligadas a ela e viram "filmada" quando a cena for gravada e enviada
    const provas = Array.isArray(args.provas) ? args.provas.filter((x): x is string => typeof x === "string" && x.trim().length >= 3).map((x) => x.trim().slice(0, 300)) : [];
    const current = new Map((await store.proofs()).map((p) => [p.descricao.toLowerCase(), p.status]));
    for (const d of provas) await store.saveProof({ descricao: d, status: current.get(d.toLowerCase()) ?? "falta_filmar", contentItemId: content.id });
    return text(`${parsed.data.length} take(s) de "${content.title}" enviados para o Post.ai. Aparecem no app ao abrir esta cena.${provas.length ? ` Provas ligadas: ${provas.join("; ")}.` : ""}`);
  }
  if (name === "propor_edicao") {
    if (content.format !== "thought" && content.format !== "main_video") return text("propor_edicao é para vídeo com fala (Pensamento do Dia ou Vídeo principal).", true);
    const motivo = typeof args.motivo === "string" ? args.motivo.trim().slice(0, 600) : "";
    if (motivo.length < 3) return text("Explique o motivo em 1–2 frases simples (o criador lê no app antes de aceitar).", true);
    const [profile, own] = await Promise.all([store.profile(), store.ownMusic()]);
    const parsed = parseEditProposal(args, { business: profile.kind === "empresa", own });
    if (!parsed.ok) return text(`Ajuste e mande de novo:\n- ${parsed.errors.join("\n- ")}`, true);
    await store.saveEditProposal(content.id, parsed.edit, motivo);
    return text(`Proposta enviada para "${content.title}": ${describeEditProposal(parsed.edit, own)}. O criador vê ao finalizar o vídeo no app e escolhe MONTAR ASSIM ou AJUSTAR — nada é montado sem ele. Acompanhe com ler_status_gravacao.`);
  }
  if (content.format === "broll") return text("Cena de apoio (B-roll, sem roteiro falado): use salvar_cenas com a lista de takes (nome, duracao_segundos, enquadramento, movimento_camera, local, luz, broll, erro_comum).", true);
  if (content.format !== "thought" && content.format !== "main_video") return text("Este conteúdo não usa roteiro falado (é story).", true);

  if (name === "instrucoes_do_roteiro") {
    const [profile, pillarName, recentSummaries, deficit, blocked] = await Promise.all([
      store.profile(), store.pillarName(content.pillarSlug), store.recentSummaries(), pillarDeficit(store), blockedTopics(store),
    ]);
    const eventText = typeof args.acontecimento === "string" && args.acontecimento.trim() ? args.acontecimento.trim().slice(0, 1500) : null;
    const prompt = buildManualPrompt({ profile, pillarName, format: content.format, eventText, brief: content.project ? projectBrief(content.project) : null, recentSummaries, avoid: "" });
    const cases = profile.kind === "empresa" ? describeCases(await store.realCases()) : "";
    const limits = `LIMITES DE CADA CAMPO (o validador confere exatamente isto; erros voltam todos juntos com o caminho do campo):\n${contractLimits().join("\n")}`;
    return text([prompt, deficit, blocked, cases, "Regras do diretor: gancho ≤ 12 palavras; screen_text 2–5 palavras; duration_seconds ≈ palavras do script ÷ 2,5.", DIRECTION_GUIDE, limits].filter(Boolean).join("\n\n"));
  }

  if (name === "salvar_roteiro") {
    const profile = await store.profile();
    const parsed = parseDraft({ ...(args.roteiro as Json), format: content.format });
    if (!parsed.ok) return text(`O roteiro não passou na validação. Corrija e salve de novo:\n- ${parsed.errors.join("\n- ")}`, true);
    const draft = finalizeDraft(parsed.draft, profile);
    // todas as checagens de uma vez: o assistente corrige tudo numa rodada só
    const biz = profile.kind === "empresa" ? profile.business : undefined;
    const problems: string[] = [
      ...directorIssues(draft),
      ...(draft.direcao ? directionIssues(draft.direcao, { durationSeconds: draft.duration_seconds, spoken: true, business: profile.kind === "empresa", ownMusic: await store.ownMusic() }) : []),
    ];
    if (biz?.noPrice && mentionsPrice(draft)) problems.push("preço: o roteiro fala preço/valor — neste perfil de empresa preço não aparece no vídeo.");
    for (const c of biz ? pendingClaimsIn(`${draft.script} ${draft.cta}`, biz.pendingClaims ?? []) : []) problems.push(`alegação sem prova: "${c}" — reescreva sem isso.`);
    // história de cliente só com caso real autorizado (nunca inventar depoimento)
    if (biz && content.pillarSlug === CLIENT_STORY_PILLAR && !(await store.realCases()).some(authorized)) {
      problems.push("histórias de cliente: este perfil não tem caso real autorizado — cadastre com cadastrar_caso_real (com autorização) antes.");
    }
    // memória de repetição + assuntos bloqueados (14 dias, inclusive roteiros enviados e ainda não abertos), sem contar o próprio conteúdo
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
      problems.push(...describeRepetition(report, label).map((x) => `repetição — ${x}`));
    }
    if (problems.length) return text(`Ajuste tudo isto e salve de novo (${problems.length} ${problems.length === 1 ? "ponto" : "pontos"}):\n- ${problems.join("\n- ")}`, true);
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
  const account = await callAccountTool(name, args, (p) => ctx.createProfile(p), () => crypto.randomUUID());
  if (account) return account;
  const profileId = typeof args.profile_id === "string" && args.profile_id ? args.profile_id : ctx.defaultProfileId;
  const store = await ctx.store(profileId);
  if (!store) return text("Perfil não encontrado para este link. Use um id de listar_perfis.", true);
  return (await callProfileDataTool(store, name, args)) ?? callProfileTool(store, name, args, now);
}
