import type { ContentDraft } from "./ai/contract";
import { RODRIGO_PROFILE, type CreatorProfile } from "./ai/prompt";
import { RODRIGO_PILLARS, type Pillar } from "./pillars";
import { rodrigoRoutine, type RoutineBlock } from "./planner";

/** One account, several profiles (the person, the company, a product line) — each one is a workspace. */
export type ProfileKind = "pessoal" | "empresa";

export interface ObjectionAnswer {
  objection: string;
  answer: string;
}

/** Sales brain of a business profile: every video removes ONE doubt that keeps the customer from buying. */
export interface BusinessStrategy {
  brand: string;
  product: string;
  audience: string;
  pains: string[];
  desires: string[];
  objections: ObjectionAnswer[];
  /** Visual proofs to film (become B-roll and recording suggestions). */
  proofs: string[];
  /** Only claims with proof on file (they may be said as facts). */
  differentiators: string[];
  /** Claims still waiting for proof/approval: never stated as fact in a video. */
  pendingClaims?: string[];
  ctas: string[];
  /** Never say price/value in the video — price is for the sales conversation. */
  noPrice: boolean;
}

export const BUSINESS_PILLARS: readonly Pillar[] = [
  { slug: "educacao", name: "Educação (erros e como escolher)", targetPercent: 30 },
  { slug: "autoridade", name: "Autoridade (experiência e fábrica)", targetPercent: 20 },
  { slug: "demonstracao", name: "Demonstração (produto em uso)", targetPercent: 15 },
  { slug: "bastidores", name: "Bastidores", targetPercent: 10 },
  { slug: "comparativo", name: "Comparativo (parece igual, não é)", targetPercent: 10 },
  { slug: "historias", name: "Histórias de cliente", targetPercent: 10 },
  { slug: "oferta", name: "Oferta (sem falar preço)", targetPercent: 5 },
];

export const CONTROLPOT_STRATEGY: BusinessStrategy = {
  brand: "ControlPot",
  product: "mixer profissional de milk-shake",
  audience: "tem açaiteria, sorveteria, cafeteria ou franquia",
  pains: [
    "o milk-shake sai aguado em alguns dias",
    "cada funcionário faz o milk-shake de um jeito",
    "a máquina perde potência bem no horário de pico",
    "a máquina quebra e a operação para",
    "a assistência demora e não acha peça",
    "o cliente prova uma vez e não volta",
  ],
  desires: [
    "milk-shake cremoso igual todo dia",
    "atender rápido no pico sem dor de cabeça",
    "equipamento profissional que passa confiança",
    "suporte quando precisar",
  ],
  objections: [
    { objection: "Está caro", answer: "Barato que para no pico sai caro: cada hora parada é venda perdida e cliente que não volta." },
    { objection: "Outra marca é mais barata", answer: "Compara o resultado no copo e quanto tempo ela aguenta trabalhando todo dia, não só a etiqueta." },
    { objection: "E se quebrar?", answer: "Tem assistência técnica própria e peça de reposição, então a operação não fica parada esperando." },
    { objection: "Posso bater direto no copo?", answer: "Pode: dá para bater direto no copo plástico, sem sujar outra caneca." },
    { objection: "Qual a diferença pra uma comum?", answer: "Não precisa acreditar em mim: olha a textura no copo, lado a lado." },
  ],
  proofs: [
    "close na textura cremosa escorrendo no copo inclinado",
    "máquina batendo por 20 segundos",
    "close da caneca cônica",
    "funcionário preparando no balcão",
    "comparação lado a lado: aguado x cremoso",
    "linha de produção e teste de qualidade",
    "assistência técnica trabalhando",
  ],
  // claims with a number or a third-party name need proof before they go on video (briefing MMIX, item 2)
  differentiators: [
    "fabricação própria em Londrina/PR",
    "assistência técnica própria",
  ],
  pendingClaims: [
    "mais de 20 anos de mercado",
    "mais de 4.000 máquinas em operação",
    "caneca cônica exclusiva e o resultado dela na textura",
    "atende grandes redes e franquias",
  ],
  ctas: [
    "Fala com um especialista e vê qual modelo combina com a sua operação.",
    "Conheça a linha completa e tira sua dúvida com a nossa equipe.",
    "Me conta nos comentários: como é o milk-shake aí na sua operação?",
    "Solicita um orçamento e compara na prática.",
  ],
  noPrice: true,
};

export const CONTROLPOT_PROFILE: CreatorProfile = {
  displayName: "ControlPot",
  handle: "ControlPot",
  positioning: "Mixers profissionais para quem vive de milk-shake: resultado igual todo dia e operação que não para.",
  signature: "ControlPot",
  closingPhrase: "",
  voiceRules: [
    "fala de empresário para empresário, direto e prático",
    "uma objeção por vídeo, nunca várias",
    "mostra prova, não promete",
    "nunca fala preço nem valor",
    "sem exagero e sem termos genéricos de propaganda",
  ],
  kind: "empresa",
  business: CONTROLPOT_STRATEGY,
};

/** Business hours: short sales pieces during the day; the personal profile keeps morning/evening. */
const BUSINESS_WEEKDAY_BLOCKS: ReadonlyArray<Omit<RoutineBlock, "id" | "weekday">> = [
  { startTime: "11:00", title: "Vídeo de venda (produto)", contentHint: "gancho, prova e chamada — 30–60s", optional: false, format: "main_video" },
  { startTime: "14:30", title: "Prova visual / B-roll do produto", contentHint: "textura, máquina em uso, bastidor", optional: false, format: "broll" },
];

export function businessRoutine(newId: () => string): RoutineBlock[] {
  const blocks: RoutineBlock[] = [];
  for (let weekday = 1; weekday <= 5; weekday++) for (const b of BUSINESS_WEEKDAY_BLOCKS) blocks.push({ ...b, id: newId(), weekday });
  return blocks;
}

export interface ProfileTemplate {
  id: "pessoal-rodrigo" | "empresa-controlpot" | "empresa-nova";
  label: string;
  description: string;
  name: string;
  profile: CreatorProfile;
  pillars: Pillar[];
  routine: (newId: () => string) => RoutineBlock[];
}

export const PROFILE_TEMPLATES: readonly ProfileTemplate[] = [
  {
    id: "pessoal-rodrigo", label: "Pessoal — RodrigoSerra.me", description: "Reflexão, vida real, academia e família. Fecha com \"E se der certo!\".",
    name: "RodrigoSerra.me", profile: { ...RODRIGO_PROFILE, kind: "pessoal" }, pillars: RODRIGO_PILLARS.map((p) => ({ ...p })), routine: rodrigoRoutine,
  },
  {
    id: "empresa-controlpot", label: "Empresa — ControlPot", description: "Vídeos que vendem mixer para empresário: dor, objeção, prova e chamada. Nunca fala preço.",
    name: "ControlPot", profile: CONTROLPOT_PROFILE, pillars: BUSINESS_PILLARS.map((p) => ({ ...p })), routine: businessRoutine,
  },
  {
    id: "empresa-nova", label: "Outra empresa / produto", description: "Mesma estratégia de venda; depois você troca produto, dores e objeções.",
    name: "Minha empresa",
    profile: {
      ...CONTROLPOT_PROFILE, displayName: "Minha empresa", handle: "Minha empresa", signature: "Minha empresa", positioning: "Produto que resolve um problema real do meu cliente.",
      business: {
        brand: "Minha empresa", product: "meu produto", audience: "precisa resolver esse problema",
        pains: ["perde tempo com um processo que dá errado", "gasta duas vezes porque comprou o errado"],
        desires: ["resultado igual todo dia", "comprar uma vez e ficar tranquilo"],
        objections: [{ objection: "Está caro", answer: "O barato que dá problema sai mais caro no fim do mês." }, { objection: "E se der problema?", answer: "A gente dá suporte e resolve rápido." }],
        proofs: ["produto em uso", "close no resultado", "cliente usando"],
        differentiators: ["atendimento de verdade"],
        ctas: ["Me chama e tira sua dúvida.", "Conta nos comentários como é aí com você."],
        noPrice: true,
      },
    },
    pillars: BUSINESS_PILLARS.map((p) => ({ ...p })), routine: businessRoutine,
  },
];

export const isBusiness = (p: Pick<CreatorProfile, "kind" | "business">): p is CreatorProfile & { business: BusinessStrategy } => p.kind === "empresa" && Boolean(p.business);

const PRICE = /R\$\s*\d|\b\d+(?:[.,]\d+)?\s*reais\b|\bpre[çc]os?\b|\bparcela(?:s|do|mento)?\b|\bs[óo] \d|\b\d+\s*%\s*(?:off|de desconto)|\bdesconto de \d|\bcusta(?:m)? (?:s[óo] |apenas |a partir de )?\d/i;

/** Hard rule of business profiles: no price or value anywhere the viewer sees or hears. */
export function mentionsPrice(d: Pick<ContentDraft, "script" | "hook_options" | "cta" | "screen_text" | "caption" | "versions">): boolean {
  const texts = [d.script, d.cta, d.screen_text, ...d.hook_options, ...Object.values(d.caption), ...d.versions.map((v) => v.script)];
  return texts.some((t) => PRICE.test(t));
}
