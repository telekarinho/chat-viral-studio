import { PLATFORMS, PROMPT_VERSION, type ContentDraft, type Platform } from "./contract";

export interface CreatorProfile {
  displayName: string;
  handle: string;
  positioning: string;
  signature: string;
  closingPhrase: string;
  voiceRules: string[];
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

export const DURATION_RANGE: Record<"thought" | "main_video", [number, number]> = {
  thought: [5, 15],
  main_video: [45, 120],
};

export interface PromptInput {
  profile: CreatorProfile;
  pillarName: string;
  format: "thought" | "main_video";
  eventText: string | null;
  recentSummaries: string[];
  avoid: string;
}

export function buildPrompt(input: PromptInput): { system: string; user: string; promptVersion: string } {
  const [min, max] = DURATION_RANGE[input.format];
  const system = [
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
    "Responda somente no JSON do schema.",
  ].join("\n");
  const user = [
    `Formato: ${input.format === "thought" ? "Pensamento do Dia" : "Vídeo principal"} (${min}–${max}s).`,
    `Pilar editorial: ${input.pillarName}.`,
    input.eventText ? `Acontecimento real de hoje contado pelo criador (transforme em conteúdo, preserve os fatos): "${input.eventText}"` : "Sem acontecimento específico: parta de uma situação comum e concreta do dia dele.",
    input.format === "main_video" ? "Inclua em 'versions' variações de 15s, 30s e 60s quando fizer sentido." : "Em 'versions' inclua no máximo uma variação de até 15s.",
    input.recentSummaries.length ? `Conteúdos recentes (não repita assunto, frase, metáfora, gancho, CTA nem estrutura):\n${input.recentSummaries.map((s) => `- ${s}`).join("\n")}` : "",
    input.avoid,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, user, promptVersion: PROMPT_VERSION };
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
