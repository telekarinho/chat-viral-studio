import { z } from "zod";
import { businessRoutine, validatePillarTargets, type BusinessStrategy, type CreatorProfile, type Pillar, type RoutineBlock } from "@postai/domain";

/**
 * Perfis dinâmicos (entrevista → criar/atualizar perfil) e dados de prova do perfil comercial
 * (casos reais de cliente e provas filmáveis). Cada perfil é um workspace isolado: voz, histórico e números separados.
 */

const str = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, n = 12) => z.array(str(max)).max(n);

// campos sem valor padrão: o patch (atualizar_perfil) só mexe no que veio
const PROFILE_FIELDS = {
  nome: str(60),
  tipo: z.enum(["pessoal", "empresa"]),
  posicionamento: str(300),
  voz: list(200, 8).min(1),
  assinatura: str(60),
  /** frase fixa do fim (perfil pessoal); vazio = sem fechamento fixo */
  fechamento: z.string().trim().max(80),
  publico: z.string().trim().max(300),
  produto: z.string().trim().max(200),
  ofertas: list(200),
  dores: list(200),
  desejos: list(200),
  objecoes: z.array(z.object({ objecao: str(200), resposta: str(300) })).max(10),
  provas: list(200),
  diferenciais_comprovados: list(200),
  /** o que NÃO prometer/afirmar (vira alegação bloqueada) */
  nao_prometer: list(200),
  ctas: list(200),
  sem_preco: z.boolean(),
  pilares: z.array(z.object({ nome: str(60), meta: z.number().min(0).max(100) })).min(1).max(10),
  metas: z.string().trim().max(300),
  redes: list(40, 6),
  tipo_conta: z.string().trim().max(60),
};
const F = PROFILE_FIELDS;
export const ProfileInputSchema = z.object({
  ...F,
  fechamento: F.fechamento.default(""), publico: F.publico.default(""), produto: F.produto.default(""), ofertas: F.ofertas.default([]), dores: F.dores.default([]),
  desejos: F.desejos.default([]), objecoes: F.objecoes.default([]), provas: F.provas.default([]), diferenciais_comprovados: F.diferenciais_comprovados.default([]),
  nao_prometer: F.nao_prometer.default([]), ctas: F.ctas.default([]), sem_preco: F.sem_preco.default(true), metas: F.metas.default(""), redes: F.redes.default([]), tipo_conta: F.tipo_conta.default(""),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export const ProfilePatchSchema = z.object(F).partial().omit({ tipo: true });
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export interface NewProfile { name: string; profile: CreatorProfile; pillars: Pillar[]; routine: RoutineBlock[] }

export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tema";

export function pillarsFrom(input: { nome: string; meta: number }[]): { pillars: Pillar[]; errors: string[] } {
  const seen = new Set<string>();
  const pillars = input.map((p) => {
    let slug = slugify(p.nome);
    for (let i = 2; seen.has(slug); i++) slug = `${slugify(p.nome)}-${i}`;
    seen.add(slug);
    return { slug, name: p.nome, targetPercent: p.meta };
  });
  return { pillars, errors: validatePillarTargets(pillars) };
}

/** Rotina inicial: empresa = vídeo de venda + prova visual (dias úteis); pessoal = pensamento + vídeo principal. */
function defaultRoutine(kind: "pessoal" | "empresa", newId: () => string): RoutineBlock[] {
  if (kind === "empresa") return businessRoutine(newId);
  const out: RoutineBlock[] = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    out.push({ id: newId(), weekday, startTime: "10:30", title: "Pensamento do Dia", contentHint: "vídeo curto 5–15s", optional: false, format: "thought" });
    out.push({ id: newId(), weekday, startTime: "19:30", title: "Vídeo principal", contentHint: "45s–2m", optional: false, format: "main_video" });
  }
  return out;
}

function businessFrom(i: Pick<ProfileInput, "nome" | "produto" | "publico" | "dores" | "desejos" | "objecoes" | "provas" | "diferenciais_comprovados" | "nao_prometer" | "ctas" | "sem_preco">): BusinessStrategy {
  return {
    brand: i.nome, product: i.produto || i.nome, audience: i.publico, pains: i.dores, desires: i.desejos,
    objections: i.objecoes.map((o) => ({ objection: o.objecao, answer: o.resposta })), proofs: i.provas, differentiators: i.diferenciais_comprovados,
    pendingClaims: i.nao_prometer, ctas: i.ctas, noPrice: i.sem_preco,
  };
}

export function buildNewProfile(i: ProfileInput, newId: () => string): { ok: true; value: NewProfile } | { ok: false; errors: string[] } {
  const { pillars, errors } = pillarsFrom(i.pilares);
  if (i.tipo === "empresa" && (!i.dores.length || !i.ctas.length)) errors.push("empresa: informe pelo menos uma dor do cliente e uma chamada (cta).");
  if (errors.length) return { ok: false, errors };
  const profile: CreatorProfile = {
    displayName: i.nome, handle: i.nome, positioning: i.posicionamento, signature: i.assinatura, closingPhrase: i.fechamento, voiceRules: i.voz, kind: i.tipo,
    ...(i.tipo === "empresa" ? { business: businessFrom(i) } : {}),
    extras: { audience: i.publico, offers: i.ofertas, goals: i.metas, networks: i.redes, accountType: i.tipo_conta },
  };
  return { ok: true, value: { name: i.nome, profile, pillars, routine: defaultRoutine(i.tipo, newId) } };
}

/** Aplica só o que veio no patch sobre o perfil atual (o resto fica como está). */
export function patchProfile(current: CreatorProfile, p: ProfilePatch): CreatorProfile {
  const b = current.business;
  const extras = { ...(current.extras ?? {}) };
  if (p.publico !== undefined) extras.audience = p.publico;
  if (p.ofertas !== undefined) extras.offers = p.ofertas;
  if (p.metas !== undefined) extras.goals = p.metas;
  if (p.redes !== undefined) extras.networks = p.redes;
  if (p.tipo_conta !== undefined) extras.accountType = p.tipo_conta;
  return {
    ...current,
    ...(p.nome !== undefined ? { displayName: p.nome } : {}),
    ...(p.posicionamento !== undefined ? { positioning: p.posicionamento } : {}),
    ...(p.voz !== undefined ? { voiceRules: p.voz } : {}),
    ...(p.assinatura !== undefined ? { signature: p.assinatura } : {}),
    ...(p.fechamento !== undefined ? { closingPhrase: p.fechamento } : {}),
    ...(b ? {
      business: {
        ...b,
        ...(p.produto !== undefined ? { product: p.produto } : {}),
        ...(p.publico !== undefined ? { audience: p.publico } : {}),
        ...(p.dores !== undefined ? { pains: p.dores } : {}),
        ...(p.desejos !== undefined ? { desires: p.desejos } : {}),
        ...(p.objecoes !== undefined ? { objections: p.objecoes.map((o) => ({ objection: o.objecao, answer: o.resposta })) } : {}),
        ...(p.provas !== undefined ? { proofs: p.provas } : {}),
        ...(p.diferenciais_comprovados !== undefined ? { differentiators: p.diferenciais_comprovados } : {}),
        ...(p.nao_prometer !== undefined ? { pendingClaims: p.nao_prometer } : {}),
        ...(p.ctas !== undefined ? { ctas: p.ctas } : {}),
        ...(p.sem_preco !== undefined ? { noPrice: p.sem_preco } : {}),
      },
    } : {}),
    extras,
  };
}

export const RealCaseSchema = z.object({
  id: z.uuid().optional(),
  cliente_segmento: str(160),
  problema: str(1000),
  resultado: str(1000),
  autorizacao: z.string().trim().max(300).default(""),
  midia_disponivel: z.string().trim().max(500).default(""),
});
export type RealCaseInput = z.infer<typeof RealCaseSchema>;
export interface RealCase extends Required<Omit<RealCaseInput, "id">> { id: string }
export interface FilmableProof { descricao: string; status: "falta_filmar" | "filmada" }

export const authorized = (c: RealCase) => c.autorizacao.trim().length > 0;

export function describeCases(cases: readonly RealCase[]): string {
  const ok = cases.filter(authorized);
  if (!ok.length) return "Casos reais de cliente AUTORIZADOS: nenhum — NÃO escreva história/depoimento de cliente (cadastre com cadastrar_caso_real).";
  return `Casos reais de cliente AUTORIZADOS (use só estes, sem aumentar nada):\n${ok.map((c) => `- [${c.id}] ${c.cliente_segmento}: problema "${c.problema}" → resultado "${c.resultado}" · autorização: ${c.autorizacao}${c.midia_disponivel ? ` · mídia: ${c.midia_disponivel}` : ""}`).join("\n")}`;
}

/** Provas do perfil (estratégia) + o status de filmagem registrado. */
export function describeProofs(strategyProofs: readonly string[], registered: readonly FilmableProof[]): string {
  const byText = new Map(registered.map((p) => [p.descricao.toLowerCase(), p.status]));
  const all = [...new Set([...strategyProofs, ...registered.map((p) => p.descricao)])];
  if (!all.length) return "";
  return `Provas filmáveis:\n${all.map((d) => `- ${d}: ${byText.get(d.toLowerCase()) === "filmada" ? "já filmada" : "falta filmar"}`).join("\n")}`;
}

export const PROFILE_INTERVIEW = [
  "ENTREVISTA PARA CRIAR UM PERFIL (pergunte uma coisa por vez, em português simples; não invente respostas):",
  "1. Nome do perfil e se é pessoal ou empresa.",
  "2. Para quem fala (público): quem é, idade, o que faz, o que quer.",
  "3. O que vende/oferece (ofertas) e o produto principal.",
  "4. Dores e desejos do público; objeções que mais ouve e como responde.",
  "5. Provas reais que existem (fotos, vídeos, números com documento) e o que ainda falta filmar.",
  "6. O que NÃO prometer nem afirmar (números sem prova, resultados garantidos, preço…).",
  "7. Voz: como fala (3–5 regras) e palavras que nunca usa; assinatura no vídeo; frase fixa de fechamento (se tiver).",
  "8. Pilares de conteúdo com a % de cada um (somando 100).",
  "9. Metas (seguidores, leads, vendas) e redes onde posta; tipo de conta (pessoal, criador, comercial).",
  "Depois: criar_perfil com tudo. Casos de cliente vão em cadastrar_caso_real (só com autorização).",
].join("\n");

// ---------- ferramentas do conector ----------

type Json = Record<string, unknown>;
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const out = (t: string, isError = false): Result => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
const zodErrors = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);

/** O que estas ferramentas precisam do perfil escolhido (o resto do McpStore fica em mcp-tools). */
export interface ProfileDataStore {
  profile(): Promise<CreatorProfile>;
  updateProfile(profile: CreatorProfile, pillars: Pillar[] | null): Promise<void>;
  realCases(): Promise<RealCase[]>;
  saveRealCase(c: RealCaseInput): Promise<string>;
  proofs(): Promise<FilmableProof[]>;
  saveProof(p: FilmableProof): Promise<void>;
}

const PROFILE_ARG = { profile_id: { type: "string", description: "id do perfil (listar_perfis). Sem ele: o perfil em que o link foi criado." } };
const RO = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };
const anyObj = (description: string, extra: Json = {}, required: string[] = []) => ({ type: "object", description, properties: { ...extra }, required, additionalProperties: true });

export const PROFILE_TOOLS = [
  { name: "entrevista_de_perfil", title: "Entrevista para novo perfil", description: "Roteiro de perguntas para criar um perfil novo (pessoal ou empresa) sem inventar nada. Depois use criar_perfil.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO },
  { name: "criar_perfil", title: "Criar perfil", description: "Cria um perfil novo (workspace isolado: voz, histórico e números separados) com voz, público, ofertas, dores, objeções, provas, o que não prometer, pilares (somando 100), metas, redes e tipo de conta. Aparece no app na troca de perfis.", inputSchema: anyObj("dados do perfil (campos: nome, tipo pessoal|empresa, posicionamento, voz[], assinatura, fechamento, publico, produto, ofertas[], dores[], desejos[], objecoes[{objecao,resposta}], provas[], diferenciais_comprovados[], nao_prometer[], ctas[], sem_preco, pilares[{nome,meta}], metas, redes[], tipo_conta)", { perfil: { type: "object" } }, ["perfil"]), annotations: WRITE },
  { name: "atualizar_perfil", title: "Atualizar perfil", description: "Muda só os campos enviados (mesmos nomes de criar_perfil, exceto tipo). Pilares enviados substituem os atuais e precisam somar 100.", inputSchema: anyObj("", { ...PROFILE_ARG, campos: { type: "object" } }, ["campos"]), annotations: WRITE },
  { name: "cadastrar_caso_real", title: "Cadastrar caso real de cliente", description: "Caso real (cliente/segmento, problema, resultado, autorização, mídia disponível). Só casos com autorização podem virar 'Histórias de cliente'. Com id: atualiza.", inputSchema: anyObj("", { ...PROFILE_ARG, id: { type: "string" }, cliente_segmento: { type: "string" }, problema: { type: "string" }, resultado: { type: "string" }, autorizacao: { type: "string", description: "quem autorizou e como; vazio = sem autorização" }, midia_disponivel: { type: "string" } }, ["cliente_segmento", "problema", "resultado"]), annotations: WRITE },
  { name: "listar_casos_reais", title: "Casos reais e provas", description: "Casos reais cadastrados (com e sem autorização) e as provas filmáveis com status (já filmada / falta filmar).", inputSchema: anyObj("", { ...PROFILE_ARG }), annotations: RO },
  { name: "atualizar_prova", title: "Status de prova filmável", description: "Marca uma prova filmável como 'filmada' ou 'falta_filmar' (cria se não existir).", inputSchema: anyObj("", { ...PROFILE_ARG, descricao: { type: "string" }, status: { type: "string", enum: ["falta_filmar", "filmada"] } }, ["descricao", "status"]), annotations: WRITE },
] as const;

export const PROFILE_TOOL_NAMES: ReadonlySet<string> = new Set(PROFILE_TOOLS.map((t) => t.name));

/** Ferramentas que não dependem de um perfil escolhido. null = não é uma delas. */
export async function callAccountTool(name: string, args: Json, createProfile: (p: NewProfile) => Promise<string>, newId: () => string): Promise<Result | null> {
  if (name === "entrevista_de_perfil") return out(PROFILE_INTERVIEW);
  if (name !== "criar_perfil") return null;
  const parsed = ProfileInputSchema.safeParse(args.perfil ?? args);
  if (!parsed.success) return out(`Faltou ou está errado:\n- ${zodErrors(parsed.error).join("\n- ")}`, true);
  const built = buildNewProfile(parsed.data, newId);
  if (!built.ok) return out(`Ajuste e tente de novo:\n- ${built.errors.join("\n- ")}`, true);
  const id = await createProfile(built.value);
  return out(`Perfil "${built.value.name}" criado (id ${id}). Ele aparece no Post.ai ao abrir o app (troca de perfis). Use profile_id ${id} nas outras ferramentas.`);
}

/** Ferramentas de dados do perfil escolhido. null = não é uma delas. */
export async function callProfileDataTool(store: ProfileDataStore, name: string, args: Json): Promise<Result | null> {
  if (name === "atualizar_perfil") {
    const parsed = ProfilePatchSchema.safeParse(args.campos ?? {});
    if (!parsed.success) return out(`Campos inválidos:\n- ${zodErrors(parsed.error).join("\n- ")}`, true);
    const patch = parsed.data;
    let pillars: Pillar[] | null = null;
    if (patch.pilares) {
      const r = pillarsFrom(patch.pilares);
      if (r.errors.length) return out(`Pilares: ${r.errors.join(" ")}`, true);
      pillars = r.pillars;
    }
    const current = await store.profile();
    await store.updateProfile(patchProfile(current, patch), pillars);
    return out(`Perfil atualizado (${Object.keys(patch).join(", ") || "nada"}). O app recebe ao abrir.`);
  }
  if (name === "cadastrar_caso_real") {
    const parsed = RealCaseSchema.safeParse(args);
    if (!parsed.success) return out(`Caso inválido:\n- ${zodErrors(parsed.error).join("\n- ")}`, true);
    const id = await store.saveRealCase(parsed.data);
    return out(parsed.data.autorizacao ? `Caso real salvo (id ${id}) e liberado para 'Histórias de cliente'.` : `Caso salvo (id ${id}) SEM autorização: não será usado em vídeo até ter autorização (atualize com o mesmo id).`);
  }
  if (name === "listar_casos_reais") {
    const [cases, proofs, profile] = await Promise.all([store.realCases(), store.proofs(), store.profile()]);
    const pending = cases.filter((c) => !authorized(c));
    return out([
      describeCases(cases),
      pending.length ? `Sem autorização (não usar):\n${pending.map((c) => `- [${c.id}] ${c.cliente_segmento}: ${c.problema}`).join("\n")}` : "",
      describeProofs(profile.business?.proofs ?? [], proofs) || "Nenhuma prova filmável cadastrada.",
    ].filter(Boolean).join("\n\n"));
  }
  if (name === "atualizar_prova") {
    const descricao = String(args.descricao ?? "").trim().slice(0, 300);
    const status = args.status === "filmada" ? "filmada" : args.status === "falta_filmar" ? "falta_filmar" : null;
    if (descricao.length < 3 || !status) return out("Informe descricao e status (filmada ou falta_filmar).", true);
    await store.saveProof({ descricao, status });
    return out(`Prova "${descricao}": ${status === "filmada" ? "já filmada" : "falta filmar"}.`);
  }
  return null;
}
