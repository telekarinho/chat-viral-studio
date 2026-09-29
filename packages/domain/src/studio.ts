/**
 * Estúdio real da fábrica (ControlPot): recursos de gravação, modos de produção, tomadas reutilizáveis,
 * curso de milk-shake e as travas de uso comercial. Recursos são PLANEJAMENTO de gravação, não estoque.
 * Produtos/SKU vêm do catálogo MMIX (espelhado); nada de segundo cadastro.
 */

export type ResourceKind = "mixer" | "sorvete_expresso" | "sorvete_balde" | "bancada" | "insumo" | "copo" | "pessoa" | "audio" | "luz" | "enquadramento";

export interface StudioResource {
  id: string;
  kind: ResourceKind;
  label: string;
  /** mixer: produto do catálogo MMIX (id + SKU exatos do equipamento filmado) */
  produtoId?: number | null;
  sku?: string | null;
}

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  mixer: "Mixer na parede", sorvete_expresso: "Sorvete expresso", sorvete_balde: "Sorvete de balde / massa", bancada: "Bancada de preparo",
  insumo: "Ingredientes, caldas e adicionais", copo: "Copos", pessoa: "Apresentador / operador / câmera", audio: "Captação de áudio", luz: "Iluminação", enquadramento: "Enquadramento",
};

export const DEFAULT_STUDIO: readonly StudioResource[] = [
  { id: "sorvete-expresso", kind: "sorvete_expresso", label: "Máquina de sorvete expresso" },
  { id: "sorvete-balde", kind: "sorvete_balde", label: "Sorvete de balde (massa de freezer)" },
  { id: "bancada", kind: "bancada", label: "Bancada de preparo" },
  { id: "insumos", kind: "insumo", label: "Leite, caldas, saborizantes e adicionais" },
  { id: "copos", kind: "copo", label: "Copos de apresentação" },
  { id: "rodrigo", kind: "pessoa", label: "Rodrigo (apresentador)" },
  { id: "lapela", kind: "audio", label: "Microfone de lapela" },
  { id: "led", kind: "luz", label: "Luz de LED / ring light" },
  { id: "vertical", kind: "enquadramento", label: "Vertical 9:16 (redes)" },
  { id: "horizontal", kind: "enquadramento", label: "Horizontal 16:9 (aula)" },
];

/** Tomadas reutilizáveis — gravar uma vez, usar em várias peças sem perder a origem. */
export const SHOT_LIBRARY = {
  visao_fabrica: { label: "Visão geral da fábrica", hint: "plano aberto, mostre a parede de mixers e a bancada", seconds: [4, 8] },
  escolha_mixer: { label: "Escolha do mixer", hint: "aproxime do modelo filmado; mostre a etiqueta do modelo", seconds: [3, 6] },
  ingredientes: { label: "Ingredientes", hint: "tudo na bancada, na ordem de uso", seconds: [3, 6] },
  medida: { label: "Medida", hint: "mostre a quantidade de cada item enquanto fala", seconds: [4, 10] },
  preparo: { label: "Preparo sem cortes", hint: "do copo vazio ao fim da batida, sem cortar", seconds: [20, 60] },
  textura: { label: "Textura final", hint: "incline o copo, close na cremosidade", seconds: [3, 6] },
  copo: { label: "Apresentação do copo", hint: "copo finalizado com cobertura, fundo limpo", seconds: [3, 6] },
  limpeza: { label: "Limpeza", hint: "haste e caneca limpas, passo a passo", seconds: [8, 20] },
  cta: { label: "Chamada (CTA)", hint: "olhando para a câmera, uma chamada só", seconds: [3, 6] },
  fala: { label: "Fala para a câmera", hint: "explicação curta olhando para a lente", seconds: [5, 40] },
} as const;
export type ShotKey = keyof typeof SHOT_LIBRARY;

export type ProductionMode = "demonstracao_mixer" | "comece_balde" | "expresso_x_balde" | "aula" | "marketplace" | "suporte" | "autoridade";
export type IceCreamSource = "expresso" | "balde" | "ambos" | "nenhum";

export interface ModeTemplate {
  label: string;
  objetivo: string;
  pillar: string; // pilar de venda do perfil empresa
  needsSku: boolean;
  source: IceCreamSource;
  shots: ShotKey[];
  /** o que o roteiro NUNCA pode fazer neste modo */
  guard: string[];
  brief: string;
}

export const PRODUCTION_MODES: Record<ProductionMode, ModeTemplate> = {
  demonstracao_mixer: {
    label: "A · Demonstração de mixer", objetivo: "Mostrar o equipamento certo, instalação, preparo real, resultado e como escolher o modelo.", pillar: "demonstracao",
    needsSku: true, source: "expresso", shots: ["escolha_mixer", "ingredientes", "preparo", "textura", "copo", "cta"],
    guard: ["especificação só do cadastro atual do SKU", "sem preço"],
    brief: "Demonstração real na fábrica: mostre o mixer filmado, o preparo sem cortes e o resultado. Explique para que operação esse modelo serve. Especificações só do cadastro do SKU.",
  },
  comece_balde: {
    label: "B · Comece com sorvete de balde", objetivo: "Operação inicial simples: sorvete de massa de freezer + um mixer ControlPot, processo e evolução.", pillar: "educacao",
    needsSku: true, source: "balde", shots: ["ingredientes", "medida", "preparo", "textura", "copo", "cta"],
    guard: ["não prometer investimento, lucro ou retorno em número", "sem preço"],
    brief: "Mostre como começar com sorvete de balde e um mixer: equipamento e insumos necessários, processo, padronização e como a operação pode evoluir. NÃO cite valor de investimento, lucro nem retorno.",
  },
  expresso_x_balde: {
    label: "C · Expresso × balde (didático)", objetivo: "Comparar as duas formas de preparo com receita, quantidade, temperatura, modelo e tempo registrados.", pillar: "comparativo",
    needsSku: true, source: "ambos", shots: ["ingredientes", "medida", "preparo", "textura", "fala"],
    guard: ["não dizer que uma é sempre melhor", "tempo e textura valem para esta demonstração"],
    brief: "Compare expresso e balde lado a lado, como aula: custo, rotina e textura NO CONTEXTO demonstrado. Não diga que uma opção é sempre superior.",
  },
  aula: {
    label: "D · Aula do curso", objetivo: "Roteiro de aula, materiais, plano de tomadas, capítulos, revisão técnica e versão curta de divulgação.", pillar: "educacao",
    needsSku: true, source: "expresso", shots: ["fala", "ingredientes", "medida", "preparo", "textura", "limpeza"],
    guard: ["receita, medida e tempo só os aprovados pelo Rodrigo", "o curso ensina de verdade; a venda nasce da demonstração"],
    brief: "Aula prática do Curso de Milk Shake Profissional ControlPot. Ensine de verdade, passo a passo. Medidas, receita e tempo só se estiverem na ficha aprovada; senão diga 'ajuste pela textura'.",
  },
  marketplace: {
    label: "E · Marketplace", objetivo: "Vídeo do SKU e da variante exatos do anúncio, com demonstração real.", pillar: "demonstracao",
    needsSku: true, source: "expresso", shots: ["escolha_mixer", "preparo", "textura", "copo"],
    guard: ["SKU e variante do anúncio", "conferir regras atuais do canal antes de exportar"],
    brief: "Vídeo para anúncio de marketplace do SKU exato: produto em uso, resultado, sem preço, sem promessa. Curto e objetivo.",
  },
  suporte: {
    label: "F · Suporte", objetivo: "Uso, limpeza, conservação e dúvidas recorrentes, com revisão técnica.", pillar: "educacao",
    needsSku: true, source: "nenhum", shots: ["escolha_mixer", "limpeza", "fala"],
    guard: ["não expor cliente, pedido ou OS", "caso individual só com validação técnica"],
    brief: "Vídeo de suporte geral: como usar, limpar e conservar o mixer. Nada de dados de cliente ou diagnóstico individual.",
  },
  autoridade: {
    label: "G · Autoridade", objetivo: "Fábrica, pessoas, fabricação, testes, assistência e demonstrações reais.", pillar: "autoridade",
    needsSku: false, source: "nenhum", shots: ["visao_fabrica", "fala", "preparo", "cta"],
    guard: ["número de máquinas, tempo de mercado, resultado técnico ou franquia só com prova"],
    brief: "Mostre a fábrica real, as pessoas e os testes. Nenhum número (máquinas, anos, resultados) nem nome de franquia sem prova registrada.",
  },
};

/** Metadados de cada clipe gravado (vão junto do take e da origem de cada peça derivada). */
export interface ClipMeta {
  mode?: ProductionMode;
  projeto?: string;
  aulaId?: string | null;
  produtoId?: number | null;
  sku?: string | null;
  skuNome?: string | null;
  fonteSorvete?: IceCreamSource;
  receita?: string | null;
  capitulo?: string | null;
  shot?: ShotKey | null;
  responsavel?: string | null;
  medidas?: string | null; // anotações feitas durante a filmagem
  tempoPreparoSeg?: number | null; // registrado na demonstração real, nunca promessa
  permissoes?: { imagemPessoas: boolean; marcasTerceiros: boolean };
  review?: ClipReview;
}

export interface ClipReview {
  falaConfere: boolean;
  legendaConfere: boolean;
  equipamentoEhOSku: boolean | null; // null = não conferido
  ingredientesConferem: boolean;
  resultadoOk: boolean;
  ctaOk: boolean;
  revisadoEm: string;
}

export type UseTarget = "aula" | "trecho_publico" | "curto_redes" | "pagina_produto" | "marketplace" | "suporte" | "campanha";

/**
 * Trava de uso comercial. Qualquer motivo aqui BLOQUEIA a peça (não é aviso).
 * O mixer do vídeo diferente do SKU associado bloqueia até corrigir a associação.
 */
export function commercialBlockers(meta: ClipMeta | null | undefined, target: UseTarget, pendingClaimsInScript: readonly string[] = []): string[] {
  const out: string[] = [];
  const m = meta ?? {};
  const mode = m.mode ? PRODUCTION_MODES[m.mode] : null;
  const needsSku = target === "marketplace" || target === "pagina_produto" || (mode?.needsSku ?? false);
  if (needsSku && !m.sku) out.push("Sem SKU associado ao equipamento filmado.");
  if (!m.review) out.push("Vídeo ainda não revisado.");
  else {
    if (needsSku && m.review.equipamentoEhOSku !== true) out.push("O mixer no vídeo não foi confirmado como o SKU associado — corrija a associação.");
    if (!m.review.falaConfere) out.push("A fala não confere com o roteiro aprovado.");
    if (!m.review.ingredientesConferem && m.mode !== "autoridade" && m.mode !== "suporte") out.push("Ingredientes/receita não conferidos.");
    if (!m.review.resultadoOk) out.push("Resultado (textura/copo) não aprovado.");
    if (!m.review.ctaOk && target !== "aula" && target !== "suporte") out.push("CTA não aprovado.");
  }
  if (!m.permissoes?.imagemPessoas) out.push("Sem autorização de imagem das pessoas que aparecem.");
  if (m.permissoes && !m.permissoes.marcasTerceiros) out.push("Marca de terceiro aparece sem direito de uso.");
  for (const c of pendingClaimsInScript) out.push(`Alegação sem prova no roteiro: "${c}".`);
  return out;
}

/** Alegações pendentes (sem prova) citadas num texto — usadas para travar a peça. */
export function pendingClaimsIn(text: string, pendingClaims: readonly string[]): string[] {
  const t = norm(text);
  const hits = pendingClaims.filter((c) => {
    const words = norm(c).split(" ").filter((w) => w.length > 3 || /\d/.test(w));
    const key = words.filter((w) => /\d/.test(w));
    // números (20 anos, 4.000 máquinas) bastam; sem número, exige 2+ palavras e metade da alegação
    if (key.length) return key.some((k) => t.includes(k.replace(/\./g, "")) || t.includes(k));
    const found = words.filter((w) => t.includes(w)).length;
    return found >= 2 && found / words.length >= 0.5;
  });
  return hits;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9. ]/g, " ").replace(/\s+/g, " ").trim();

// ---------- Curso de Milk Shake Profissional ControlPot ----------

export type LessonStatus = "rascunho" | "gravando" | "revisao_tecnica" | "aprovada" | "publicada";

export interface CourseLesson {
  id: string;
  modulo: string;
  ordem: number;
  titulo: string;
  objetivo: string;
  prerequisitos: string;
  /** só valores aprovados pelo Rodrigo; vazio = ainda não definido (nunca inventado) */
  ingredientes: { item: string; quantidade: string }[];
  sku: string | null;
  fonteSorvete: IceCreamSource;
  contentItemId: string | null;
  status: LessonStatus;
  versao: number;
}

/** Estrutura inicial EDITÁVEL, sujeita à aprovação do Rodrigo. Sem número de aulas, preço, receita ou tempo fixos. */
export const COURSE_MODULES: readonly { modulo: string; objetivo: string }[] = [
  { modulo: "Escolha do mixer e posto de trabalho", objetivo: "Escolher o mixer para a operação e montar o posto." },
  { modulo: "Ingredientes, conservação e organização", objetivo: "Organizar e conservar os insumos." },
  { modulo: "Base branca/neutra e sabores", objetivo: "Preparar a base e adicionar sabores." },
  { modulo: "Medidas e sequência de preparo", objetivo: "Padronizar medidas e ordem." },
  { modulo: "Ajuste de leite, caldas e saborizantes", objetivo: "Ajustar a receita pela textura." },
  { modulo: "Batida e avaliação da textura", objetivo: "Bater e avaliar a textura (o tempo é registrado na demonstração, não é regra)." },
  { modulo: "Sabores, coberturas e adicionais", objetivo: "Variar sem perder o padrão." },
  { modulo: "Ficha técnica de cada receita", objetivo: "Padronizar com ficha." },
  { modulo: "Limpeza, conservação e rotina", objetivo: "Rotina de limpeza e cuidado do equipamento." },
  { modulo: "Montagem de cardápio", objetivo: "Montar o cardápio." },
  { modulo: "Custo e formação de preço", objetivo: "Calcular com valores informados e atualizados pelo aluno." },
  { modulo: "Atendimento, apresentação e vendas", objetivo: "Apresentar e vender." },
  { modulo: "Começar com sorvete de balde e evoluir", objetivo: "Caminho do iniciante: balde + um mixer, e como evoluir." },
];

export function initialCourse(newId: () => string): CourseLesson[] {
  return COURSE_MODULES.map((m, i) => ({
    id: newId(), modulo: m.modulo, ordem: i + 1, titulo: m.modulo, objetivo: m.objetivo, prerequisitos: i === 0 ? "" : `Módulo ${i}`,
    ingredientes: [], sku: null, fonteSorvete: i === COURSE_MODULES.length - 1 ? "balde" : "expresso", contentItemId: null, status: "rascunho", versao: 1,
  }));
}

/** A aula só vai para aluno aprovada, com vídeo e sem medidas inventadas. */
export function lessonPublishBlockers(l: CourseLesson, videoReady: boolean): string[] {
  const out: string[] = [];
  if (l.status !== "aprovada") out.push("Aula ainda não aprovada pelo Rodrigo (revisão técnica).");
  if (!videoReady) out.push("Vídeo final ainda não pronto.");
  if (!l.objetivo.trim()) out.push("Aula sem objetivo.");
  if (l.ingredientes.some((i) => !i.quantidade.trim())) out.push("Ingrediente sem quantidade aprovada.");
  return out;
}

/** Projeto de gravação do estúdio (vai em content_items.structured_payload.project). */
export interface ProjectInfo {
  mode: ProductionMode;
  produtoId?: number | null;
  sku?: string | null;
  skuNome?: string | null;
  fonteSorvete: IceCreamSource;
  receita?: string | null;
  aulaId?: string | null;
  aulaTitulo?: string | null;
  derivedTarget?: UseTarget | null;
}

export const USE_TARGET_LABEL: Record<UseTarget, string> = {
  aula: "Aula completa", trecho_publico: "Trecho educativo público", curto_redes: "Vídeo curto (redes)", pagina_produto: "Página do produto",
  marketplace: "Anúncio de marketplace", suporte: "Resposta de suporte", campanha: "Campanha (CTA mixer ou curso)",
};

const FONTE_LABEL: Record<IceCreamSource, string> = { expresso: "sorvete expresso", balde: "sorvete de balde (massa de freezer)", ambos: "sorvete expresso e de balde", nenhum: "sem sorvete" };

/** Briefing para a IA: modo, equipamento exato filmado, fonte de sorvete, receita/aula e as travas do modo. */
export function projectBrief(p: ProjectInfo): string {
  const m = PRODUCTION_MODES[p.mode];
  return [
    `${m.label}. ${m.brief}`,
    p.skuNome || p.sku ? `Equipamento filmado: ${p.skuNome ?? ""}${p.sku ? ` (SKU ${p.sku})` : ""}.` : "",
    `Fonte de sorvete: ${FONTE_LABEL[p.fonteSorvete]}.`,
    p.aulaTitulo ? `Aula do curso: ${p.aulaTitulo}.` : "",
    p.receita ? `Receita/demonstração (valores aprovados): ${p.receita}.` : "Sem receita aprovada: não cite medidas nem tempo exatos, diga 'ajuste pela textura'.",
    p.derivedTarget ? `Formato de saída: ${USE_TARGET_LABEL[p.derivedTarget]}.` : "",
    `Travas: ${m.guard.join("; ")}.`,
  ].filter(Boolean).join(" ");
}
