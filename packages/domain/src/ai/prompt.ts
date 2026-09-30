import { PLATFORMS, PROMPT_VERSION, type ContentDraft, type Platform } from "./contract";
import type { BusinessStrategy, ProfileKind } from "../profiles";
import type { WatermarkCorner } from "../watermark";

export interface CreatorProfile {
  displayName: string;
  handle: string;
  positioning: string;
  signature: string;
  closingPhrase: string;
  voiceRules: string[];
  kind?: ProfileKind;
  business?: BusinessStrategy;
  /** canto da assinatura no vídeo (padrão: em cima, à direita) */
  watermark?: WatermarkCorner;
}

export const RODRIGO_PROFILE: CreatorProfile = {
  displayName: "Rodrigo Serra",
  handle: "RodrigoSerra.me",
  positioning: "Vida real, evolução pessoal e reflexões de um homem 40+.",
  signature: "RodrigoSerra.me",
  closingPhrase: "E se der certo!",
  voiceRules: [
    "humano, próximo, simples, direto e esperançoso",
    "fala com UMA pessoa, nunca com uma plateia",
    "nunca soa como guru ou coach genérico",
    "evita jargão motivacional (ex.: 'saia da zona de conforto', 'mindset', 'você é incrível')",
    "exemplos concretos do dia a dia, não abstrações",
  ],
};

/** Formatos de vídeo curto que mais retêm e são compartilhados (sempre-verdes: não dependem da tendência do dia). */
export const VIRAL_FORMATS = [
  "“ninguém te conta que…” (revela algo que todo mundo vive e ninguém fala)",
  "“eu costumava… hoje eu…” (antes e depois pessoal)",
  "“o erro que eu cometi com…” (confissão com aprendizado)",
  "pergunta direta que o espectador responde na cabeça (“quando foi a última vez que você…?”)",
  "contraste: o que todo mundo pensa × o que acontece de verdade",
  "cena concreta do dia (lugar, hora, frase ouvida) que vira lição",
  "lista curta de 3 (“3 coisas que…”), só no vídeo principal",
] as const;

export const DURATION_RANGE: Record<"thought" | "main_video", [number, number]> = {
  thought: [5, 15],
  main_video: [45, 120],
};

/** Sales videos are shorter than personal reflections (VSL curta). */
export const BUSINESS_MAIN_RANGE: [number, number] = [30, 90];

export interface PromptInput {
  profile: CreatorProfile;
  pillarName: string;
  format: "thought" | "main_video";
  eventText: string | null;
  brief?: string | null;
  recentSummaries: string[];
  avoid: string;
}

export function buildPrompt(input: PromptInput): { system: string; user: string; promptVersion: string } {
  const b = input.profile.kind === "empresa" ? input.profile.business : undefined;
  const [min, max] = b && input.format === "main_video" ? BUSINESS_MAIN_RANGE : DURATION_RANGE[input.format];
  const system = b ? businessSystem(input.profile, b) : [
    `Você é o roteirista pessoal de ${input.profile.displayName} (${input.profile.handle}). Posicionamento: ${input.profile.positioning}`,
    `Voz: ${input.profile.voiceRules.join("; ")}.`,
    "Escreva em português do Brasil, como fala, frases curtas, sem emojis no roteiro.",
    "Estrutura narrativa obrigatória: E (situação real) -> MAS (tensão/virada) -> POR ISSO (aprendizado/ação).",
    `O roteiro TERMINA exatamente com a frase de fechamento: "${input.profile.closingPhrase}" — não altere essa frase.`,
    `As legendas terminam com a assinatura ${input.profile.signature}.`,
    "Nunca prometa viralização, resultado garantido ou números de alcance.",
    "Dê 3 ganchos diferentes entre si (formas diferentes: pergunta, confissão, contraste...).",
    "Regras de retenção para vídeo curto (Reels/TikTok/Shorts):",
    "- o gancho prende nos 2 primeiros segundos: até 12 palavras, concreto, abre uma lacuna de curiosidade ou quebra uma expectativa;",
    "- uma única ideia por vídeo, com um detalhe específico e real (lugar, hora, objeto, frase ouvida) em vez de abstração;",
    "- tensão no MAS: algo que o espectador também vive e não admite;",
    "- o POR ISSO entrega uma virada prática que dá vontade de salvar ou mandar para alguém;",
    "- o CTA pede uma resposta simples nos comentários ligada ao tema (nada de 'curte e compartilha');",
    "- screen_text: 2 a 5 palavras que resumem o vídeo sem repetir o gancho;",
    "- legendas por plataforma adaptadas (TikTok curta e direta; Instagram com respiro; YouTube Shorts com título forte);",
    "Formato que viraliza (escolha UM que combine com o tema e use de verdade, sem forçar):",
    ...VIRAL_FORMATS.map((f) => `- ${f};`),
    "Coerência (o texto é lido em voz alta, parte por parte, e precisa fazer sentido para quem nunca viu o perfil):",
    "- uma ideia só, do começo ao fim; cada frase continua a anterior (nada de frases soltas de efeito, colcha de retalhos ou provérbio genérico);",
    "- o gancho promete algo e o final entrega exatamente isso; o tema do dia (pilar) é o assunto, não um detalhe;",
    "- nada de metáfora confusa nem palavra difícil; se uma frase não dá para entender de primeira, reescreva;",
    "- antes de responder, leia o roteiro inteiro em voz alta mentalmente: se algum trecho não se liga ao resto, corte.",
    "Responda somente no JSON do schema.",
  ].join("\n");
  const user = [
    b ? `Pilar de venda: ${input.pillarName}. Antes de escrever, decida (coerentes entre si): público, nível de consciência, UMA dor, UMA objeção, UM desejo, UMA prova visual, UMA emoção e a ação esperada. Sem isso, não escreva.` : "",
    `Formato: ${input.format === "thought" ? "Pensamento do Dia" : "Vídeo principal"} (${min}–${max}s).`,
    b ? "" : `Pilar editorial: ${input.pillarName}.`,
    input.eventText ? `${b ? "Situação real da empresa hoje" : "Acontecimento real de hoje contado pelo criador"} (transforme em conteúdo, preserve os fatos): "${input.eventText}"` : b ? "Sem acontecimento específico: parta de uma dor real do cliente." : "Sem acontecimento específico: parta de uma situação comum e concreta do dia dele.",
    input.brief ? `Briefing do projeto (siga à risca; dados do equipamento só os daqui): ${input.brief}` : "",
    input.format === "main_video"
      ? "Inclua em 'versions' variações de 15s, 30s e 60s quando fizer sentido."
      : "Pensamento do Dia: 3 a 5 frases curtas no 'script'. A 1ª frase É o gancho (até 12 palavras; é gravada sozinha como 'Gancho'); as do meio desenvolvem UMA ideia; a última antes do fechamento é a virada que dá vontade de mandar para alguém. Em 'versions' inclua no máximo uma variação de até 15s.",
    input.recentSummaries.length ? `Conteúdos recentes (não repita assunto, frase, metáfora, gancho, CTA nem estrutura):\n${input.recentSummaries.map((s) => `- ${s}`).join("\n")}` : "",
    input.avoid,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user, promptVersion: PROMPT_VERSION };
}

function businessSystem(profile: CreatorProfile, b: BusinessStrategy): string {
  const list = (xs: readonly string[]) => xs.map((x) => `- ${x}`).join("\n");
  return [
    `Você é o roteirista de vídeos de venda da ${b.brand} (${b.product}). Posicionamento: ${profile.positioning}`,
    `Quem compra é empresário: alguém que ${b.audience}. Não é consumidor final.`,
    `Voz: ${profile.voiceRules.join("; ")}.`,
    "Pergunta central de todo vídeo: o que impede esse empresário de comprar hoje? O vídeo elimina UMA dúvida e mostra UMA prova.",
    "Mapeie a estrutura assim: E = a dor real do cliente (concreta, do dia a dia da operação); MAS = a objeção ou a crença errada, respondida sem enrolar; POR ISSO = a prova visual + o diferencial que resolve.",
    "O tipo de vídeo segue o pilar: Educação = erro comum e como escolher; Autoridade = experiência e fábrica; Demonstração = produto em uso com prova; Bastidores = produção/qualidade; Comparativo = 'parece igual, mas não é'; Histórias = caso real de cliente; Oferta = condição e escassez REAIS, sem inventar.",
    b.noPrice ? "PROIBIDO falar preço, valor, parcela, desconto em número ou 'R$' — nem no roteiro, nem na tela, nem nas legendas. Preço é no atendimento." : "",
    "Nunca invente especificação técnica, número ou depoimento que não esteja abaixo.",
    `Dores reais:\n${list(b.pains)}`,
    `Desejos:\n${list(b.desires)}`,
    `Objeções e respostas (use UMA por vídeo):\n${b.objections.map((o) => `- "${o.objection}" → ${o.answer}`).join("\n")}`,
    `Provas visuais que dá para filmar (use em recording_suggestions):\n${list(b.proofs)}`,
    `Diferenciais comprovados (pode afirmar):\n${list(b.differentiators)}`,
    b.pendingClaims?.length ? `Alegações AINDA SEM PROVA — NÃO afirme nem cite números delas:\n${list(b.pendingClaims)}` : "",
    `CTAs possíveis (adapte, sem pressão):\n${list(b.ctas)}`,
    `As legendas terminam com a assinatura ${profile.signature}.`,
    "Gancho de até 12 palavras que para o scroll (dor financeira, curiosidade, comparação, autoridade ou erro). screen_text de 2 a 5 palavras.",
    "Legendas por plataforma adaptadas; no Facebook/Marketplace pode detalhar o uso do produto (sem preço).",
    "Responda somente no JSON do schema.",
  ].filter(Boolean).join("\n");
}

export const PLATFORM_LIMITS: Record<Platform, number> = { instagram: 2200, tiktok: 2200, facebook: 5000, youtube_shorts: 5000 };

/** Deterministic post-processing: configured closing phrase and signature are never left to the model. */
export function finalizeDraft(draft: ContentDraft, profile: CreatorProfile): ContentDraft {
  const closing = profile.closingPhrase.trim();
  const withClosing = (script: string) => {
    let body = script.trim();
    const idx = body.toLowerCase().lastIndexOf(closing.toLowerCase().replace(/[!.]+$/, ""));
    if (idx >= 0 && body.length - idx <= closing.length + 2) body = body.slice(0, idx).trim();
    return closing ? `${body}\n\n${closing}` : body;
  };
  const tags = draft.hashtags.join(" ");
  const caption = {} as ContentDraft["caption"];
  for (const p of PLATFORMS) {
    let c = draft.caption[p].trim();
    if (!c.includes(profile.signature)) c = `${c}\n\n${profile.signature}`;
    if ((p === "instagram" || p === "tiktok") && !c.includes(draft.hashtags[0] ?? "#")) c = `${c}\n\n${tags}`;
    caption[p] = c.slice(0, PLATFORM_LIMITS[p]);
  }
  return {
    ...draft,
    script: withClosing(draft.script),
    versions: draft.versions.map((v) => ({ ...v, script: withClosing(v.script) })),
    caption,
  };
}

export function summarizeForMemory(d: Pick<ContentDraft, "topic" | "key_phrase" | "metaphor" | "cta" | "structure">): string {
  return [d.topic, `frase: "${d.key_phrase}"`, d.metaphor ? `metáfora: ${d.metaphor}` : "", `CTA: ${d.cta}`, `estrutura: ${d.structure}`].filter(Boolean).join(" | ");
}
