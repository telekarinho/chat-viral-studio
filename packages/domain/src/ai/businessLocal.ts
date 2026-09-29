import type { ContentDraft, NarrativeStructure } from "./contract";
import type { BusinessStrategy } from "../profiles";

interface PillarShape {
  structure: NarrativeStructure;
  hooks: (s: BusinessStrategy, pain: string) => [string, string, string];
  mas: (s: BusinessStrategy, obj: { objection: string; answer: string }) => string;
  porIsso: (s: BusinessStrategy, proof: string, diff: string) => string;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Hook formulas from the sales brain (dor financeira, curiosidade, comparação, autoridade, erro).
const SHAPES: Record<string, PillarShape> = {
  educacao: {
    structure: "conselho",
    hooks: () => ["Quase todo mundo erra nisso aqui.", "O problema pode não ser a sua receita.", "Presta atenção nesse detalhe."],
    mas: (_s, o) => `Aí vem a dúvida: "${o.objection}". ${o.answer}`,
    porIsso: (_s, proof, diff) => `Olha a diferença na prática: ${proof}. É por isso que ${diff} faz diferença.`,
  },
  autoridade: {
    structure: "confissao",
    hooks: (s) => [`Depois de ${s.differentiators[0] ?? "anos de mercado"}, aprendi uma coisa.`, "Já vimos esse erro centenas de vezes.", "Não é teoria, é experiência de fábrica."],
    mas: (_s, o) => `Muita gente me pergunta: "${o.objection}". ${o.answer}`,
    porIsso: (_s, proof, diff) => `Isso aqui não é promessa: ${proof}. ${cap(diff)}.`,
  },
  demonstracao: {
    structure: "observacao",
    hooks: () => ["Olha isso...", "Não precisa acreditar em mim.", "Você compraria esse resultado?"],
    mas: (_s, o) => `"${o.objection}" Então veja funcionando. ${o.answer}`,
    porIsso: (_s, proof, diff) => `Repara: ${proof}. ${cap(diff)}.`,
  },
  bastidores: {
    structure: "observacao",
    hooks: () => ["Pouca gente vê essa parte.", "Antes de chegar até você, passa por aqui.", "Todo equipamento passa por isso."],
    mas: (_s, o) => `Quem pergunta "${o.objection}" precisa ver isso. ${o.answer}`,
    porIsso: (_s, proof, diff) => `É aqui que nasce a confiança: ${proof}. ${cap(diff)}.`,
  },
  comparativo: {
    structure: "contraste",
    hooks: () => ["Parece igual... mas não é.", "Qual dos dois você compraria?", "Compare você mesmo."],
    mas: (_s, o) => `"${o.objection}" A diferença aparece no resultado. ${o.answer}`,
    porIsso: (_s, proof, diff) => `Lado a lado fica claro: ${proof}. ${cap(diff)}.`,
  },
  historias: {
    structure: "historia",
    hooks: () => ["Um cliente nos procurou por causa disso.", "Recebemos essa dúvida quase todo dia.", "Foi aí que entendemos o problema."],
    mas: (_s, o) => `Ele tinha medo: "${o.objection}". ${o.answer}`,
    porIsso: (_s, proof, diff) => `Hoje a operação dele é outra: ${proof}. ${cap(diff)}.`,
  },
  oferta: {
    structure: "pergunta",
    hooks: () => ["Se você estava esperando o momento certo...", "Isso é pra quem vai abrir ou trocar agora.", "Antes de comprar qualquer uma, vê isso."],
    mas: (_s, o) => `Se a sua dúvida é "${o.objection}": ${o.answer}`,
    porIsso: (_s, proof, diff) => `Veja por você: ${proof}. ${cap(diff)}. A condição você vê direto com a equipe.`,
  },
};

/** Offline sales script for a business profile: one pain + one objection + one proof, never price. */
export function businessDraft(s: BusinessStrategy, pillarSlug: string, pillarName: string, format: "thought" | "main_video", variant: number, eventText: string | null): ContentDraft {
  const shape = SHAPES[pillarSlug] ?? SHAPES.educacao!;
  const pick = <T,>(xs: readonly T[], k: number): T => xs[((k % xs.length) + xs.length) % xs.length]!;
  const pain = pick(s.pains, variant);
  const obj = pick(s.objections, variant + Math.floor(variant / s.pains.length));
  const proof = pick(s.proofs, variant);
  const diff = pick(s.differentiators, variant);
  const cta = pick(s.ctas, variant);
  const desire = pick(s.desires, variant);
  const hooks = shape.hooks(s, pain);
  const e = eventText?.trim() ? `Hoje aconteceu isso aqui: ${eventText.trim()}` : `Se você ${s.audience}, talvez conheça isso: ${pain}.`;
  const mas = shape.mas(s, obj);
  const porIsso = shape.porIsso(s, proof, diff);
  const keyPhrase = `${cap(pain)}? ${obj.answer}`;
  const isThought = format === "thought";
  const script = isThought ? `${hooks[0]}\n\n${obj.answer}` : [hooks[0], e, mas, porIsso, cta].join("\n\n");
  const tag = `#${s.brand.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() || "empresa"}`;
  return {
    title: `${pillarName.split(" (")[0]}: ${obj.objection}`.slice(0, 120),
    pillar: pillarName,
    format,
    duration_seconds: isThought ? 12 : 45,
    structure: shape.structure,
    topic: `${pain} — objeção: ${obj.objection}`.slice(0, 200),
    key_phrase: keyPhrase.slice(0, 300),
    metaphor: "",
    hook_options: hooks,
    narrative: { e, mas, por_isso: porIsso },
    script,
    screen_text: cap(desire).split(" ").slice(0, 5).join(" ").slice(0, 120),
    cta,
    caption: {
      instagram: `${hooks[0]}\n\n${obj.answer}\n\n${cta}`,
      tiktok: `${hooks[0]} ${cta}`,
      facebook: `${e}\n\n${mas}\n\n${porIsso}\n\n${cta}`,
      youtube_shorts: `${hooks[0]}\n\n${obj.answer}`,
    },
    hashtags: [tag, "#empreendedorismo", "#negocios"],
    recording_suggestions: [proof, pick(s.proofs, variant + 1)].map((scene) => ({ scene, duration_seconds: 3, location_hint: "prova visual — vira B-roll na montagem" })),
    versions: isThought ? [] : [{ duration_seconds: 15, script: `${hooks[0]}\n\n${obj.answer}` }, { duration_seconds: 30, script: `${hooks[0]}\n\n${mas}\n\n${cta}` }],
  };
}

export function businessVariants(s: BusinessStrategy): number {
  return Math.max(1, s.pains.length * s.objections.length);
}
