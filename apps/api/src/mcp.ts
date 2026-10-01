import {
  buildManualPrompt, checkRepetition, describeAvoidance, engagementRate, finalizeDraft, fingerprintsFor, mentionsPrice, parseDraft, pendingClaimsIn, projectBrief, sharesPer1k,
  type ContentDraft, type CreatorProfile, type Fingerprint, type PostMetrics, type ProjectInfo,
} from "@postai/domain";

/**
 * Conector MCP do Post.ai: o criador usa a assinatura dele (Claude, ChatGPT Business…) para escrever
 * o roteiro; o assistente chama estas ferramentas e o roteiro chega no app validado pelo mesmo contrato.
 * Transporte: MCP Streamable HTTP, só respostas JSON (sem stream), sem sessão.
 */

export interface McpContent { id: string; format: string; pillarSlug: string; title: string; date: string; hasScript: boolean; project: ProjectInfo | null }

export interface McpPost { id: string; title: string; pillarSlug: string; format: string; date: string; postedAt: string | null; postedTo: string[]; metrics: PostMetrics | null }
export interface McpStrategy {
  pillars: { slug: string; name: string; targetPercent: number }[];
  routine: { weekday: number; startTime: string; title: string; format: string }[];
}

/** Tudo já restrito ao workspace do link (quem chama não escolhe workspace). */
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
}

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_INFO = { name: "postai", title: "Post.ai", version: "1.0.0" };
const INSTRUCTIONS = [
  "Você é o estrategista de conteúdo do criador no Post.ai (app de vídeos curtos; perfil pessoal ou de empresa/vendas).",
  "Objetivo: fazer a conta crescer com vídeos que prendem nos primeiros segundos e que as pessoas mandam para alguém — sem prometer viralização.",
  "Antes de decidir: chame perfil_e_estrategia e desempenho_dos_posts; se tiver busca na web, pesquise o que está em alta no nicho e na plataforma agora.",
  "Para escrever um roteiro: conteudos_do_dia → instrucoes_do_roteiro (siga À RISCA voz, estrutura, fechamento e o JSON) → salvar_roteiro. Se voltar erro, corrija o apontado e salve de novo.",
  "Melhor horário e sequência: baseie-se nos horários em que os posts com mais visualizações e envios foram postados; diga quando há poucos dados.",
  "Nunca invente números do criador, preço (empresa) nem alegação sem prova. Responda em português do Brasil, simples, sem jargão.",
].join("\n");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_LABEL: Record<string, string> = { thought: "Pensamento do Dia", main_video: "Vídeo principal", story: "Story", broll: "Cena de apoio" };

export const MCP_TOOLS = [
  {
    name: "perfil_e_estrategia",
    title: "Perfil e estratégia",
    description: "Quem é o criador: voz, posicionamento, fechamento, assinatura, temas (pilares) com a meta de cada um, rotina de gravação da semana e, se for empresa, produto, dores, objeções, provas e chamadas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "desempenho_dos_posts",
    title: "Desempenho dos posts",
    description: "Posts recentes: tema, formato, dia/hora e redes em que foram postados, visualizações, curtidas, comentários, compartilhamentos, salvamentos, engajamento e envios a cada mil.",
    inputSchema: { type: "object", properties: { limite: { type: "number", description: "quantos posts (padrão 30, máx. 100)" } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "conteudos_do_dia",
    title: "Conteúdos do dia",
    description: "Lista os conteúdos planejados no Post.ai para uma data (padrão: hoje, horário de Brasília), com id, formato, tema e se já tem roteiro.",
    inputSchema: { type: "object", properties: { data: { type: "string", description: "AAAA-MM-DD (opcional)" } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "instrucoes_do_roteiro",
    title: "Regras para o roteiro",
    description: "Devolve as regras do perfil (voz, estrutura que viraliza, fechamento obrigatório, o que não repetir) e o formato JSON exato para um conteúdo.",
    inputSchema: {
      type: "object",
      properties: {
        content_id: { type: "string", description: "id vindo de conteudos_do_dia" },
        acontecimento: { type: "string", description: "o que aconteceu hoje, se o criador contou (opcional)" },
      },
      required: ["content_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "salvar_roteiro",
    title: "Salvar roteiro no app",
    description: "Valida e envia o roteiro (o JSON pedido em instrucoes_do_roteiro) para o app. Se algo não passar, devolve o que corrigir.",
    inputSchema: {
      type: "object",
      properties: { content_id: { type: "string" }, roteiro: { type: "object", description: "o JSON completo do roteiro" } },
      required: ["content_id", "roteiro"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
] as const;

type Json = Record<string, unknown>;
interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json }
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

/** Hoje em Brasília (o plano do dia do criador é no horário local dele). */
export function todayBrasilia(now = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
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

const MIN_POSTS_FOR_CONCLUSIONS = 5;

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

async function callTool(store: McpStore, name: string, args: Json, now: Date): Promise<ToolResult> {
  if (name === "perfil_e_estrategia") return text(await describeStrategy(store));
  if (name === "desempenho_dos_posts") {
    const n = typeof args.limite === "number" && args.limite > 0 ? Math.min(100, Math.floor(args.limite)) : 30;
    return text(await describePosts(store, n));
  }
  if (name === "conteudos_do_dia") {
    const date = typeof args.data === "string" && DATE.test(args.data) ? args.data : todayBrasilia(now);
    const items = await store.contentsOn(date);
    if (!items.length) return text(`Nada planejado para ${date}. Peça para o criador abrir o Post.ai (o plano do dia é criado no app).`);
    const lines = await Promise.all(items.map(async (c) =>
      `- id ${c.id} · ${FORMAT_LABEL[c.format] ?? c.format} · tema: ${await store.pillarName(c.pillarSlug)} · ${c.hasScript ? "já tem roteiro (salvar substitui)" : "sem roteiro"}`));
    return text(`Conteúdos de ${date}:\n${lines.join("\n")}`);
  }

  const id = typeof args.content_id === "string" ? args.content_id : "";
  const content = id ? await store.content(id) : null;
  if (!content) return text("Conteúdo não encontrado neste perfil. Use um id de conteudos_do_dia.", true);
  if (content.format !== "thought" && content.format !== "main_video") return text("Este conteúdo não usa roteiro falado (é cena de apoio/story).", true);

  if (name === "instrucoes_do_roteiro") {
    const [profile, pillarName, recentSummaries] = await Promise.all([store.profile(), store.pillarName(content.pillarSlug), store.recentSummaries()]);
    const eventText = typeof args.acontecimento === "string" && args.acontecimento.trim() ? args.acontecimento.trim().slice(0, 1500) : null;
    return text(buildManualPrompt({
      profile, pillarName, format: content.format, eventText, brief: content.project ? projectBrief(content.project) : null, recentSummaries, avoid: "",
    }));
  }

  if (name === "salvar_roteiro") {
    const profile = await store.profile();
    const parsed = parseDraft({ ...(args.roteiro as Json), format: content.format });
    if (!parsed.ok) return text(`O roteiro não passou na validação. Corrija e salve de novo:\n- ${parsed.errors.join("\n- ")}`, true);
    const draft = finalizeDraft(parsed.draft, profile);
    const biz = profile.kind === "empresa" ? profile.business : undefined;
    if (biz?.noPrice && mentionsPrice(draft)) return text("O roteiro fala preço/valor. Neste perfil de empresa preço não aparece no vídeo: reescreva sem preço.", true);
    const unproven = biz ? pendingClaimsIn(`${draft.script} ${draft.cta}`, biz.pendingClaims ?? []) : [];
    if (unproven.length) return text(`O roteiro afirma algo ainda sem prova: ${unproven.join("; ")}. Reescreva sem isso.`, true);
    const report = checkRepetition(fingerprintsFor(draft), (await store.recentFingerprints()).filter((f) => f.contentItemId !== content.id));
    if (report.repeated) return text(`Parece repetir conteúdo recente. Mude isto e salve de novo:\n- ${describeAvoidance(report).join("\n- ")}`, true);
    await store.saveDraft(content.id, draft);
    return text(`Roteiro "${draft.title}" enviado para o Post.ai. Ele aparece no app ao abrir este conteúdo.`);
  }
  return text(`Ferramenta desconhecida: ${name}`, true);
}

/** Uma mensagem JSON-RPC → resposta (null para notificação). Erros de ferramenta voltam como resultado, não como erro de protocolo. */
export async function handleMcp(msg: unknown, store: McpStore, now = new Date()): Promise<Json | null> {
  const req = msg as RpcRequest;
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  if (req.id === undefined) return null; // notificação (ex.: notifications/initialized)
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: MCP_TOOLS });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Json;
      try {
        return ok(await callTool(store, name, args, now));
      } catch (e) {
        return ok(text(`Não consegui falar com o Post.ai agora (${e instanceof Error ? e.message : "erro"}). Tente de novo em instantes.`, true));
      }
    }
    default:
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
  }
}
