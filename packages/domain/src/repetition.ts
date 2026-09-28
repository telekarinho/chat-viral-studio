import type { ContentDraft } from "./ai/contract";

export const FINGERPRINT_TYPES = ["topic", "phrase", "metaphor", "hook", "cta", "structure"] as const;
export type FingerprintType = (typeof FINGERPRINT_TYPES)[number];

export interface Fingerprint {
  type: FingerprintType;
  value: string; // normalized text (or structure slug)
  contentItemId?: string | null;
  createdAt?: string;
}

export interface RepetitionHit {
  type: FingerprintType;
  candidate: string;
  previous: string;
  similarity: number;
}

export interface RepetitionReport {
  repeated: boolean;
  hits: RepetitionHit[];
}

export interface RepetitionConfig {
  thresholds: Record<Exclude<FingerprintType, "structure" | "cta">, number>;
  /** CTA is short and naturally repeats; flag only when the same CTA shows up this many times. */
  ctaMaxRepeats: number;
  /** structure is flagged when it appears this many times in the window (excessive use). */
  structureMaxInWindow: number;
  structureWindow: number;
}

export const DEFAULT_REPETITION_CONFIG: RepetitionConfig = {
  thresholds: { topic: 0.5, phrase: 0.45, metaphor: 0.5, hook: 0.5 },
  ctaMaxRepeats: 2,
  structureMaxInWindow: 3,
  structureWindow: 5,
};

const STOPWORDS = new Set(
  "a o as os um uma uns umas de da do das dos em na no nas nos por para pra pro com sem e ou que se me te nos voce voces eu ele ela eles elas isso isto esse essa este esta aquilo mais menos muito muita ja nao sim so ao aos à às é era ser foi vai vou ter tem tinha sua seu suas seus minha meu minhas meus tua teu como quando onde porque pq mas entao então hoje".split(
    " ",
  ).map((w) => stripAccents(w)),
);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeText(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(w: string): string {
  // tiny PT stemmer: plural and common verbal/adjective endings, enough to match "escolhas"~"escolha"
  return w.length > 4 ? w.replace(/(mente|coes|cao|oes|ais|eis|res|es|as|os|s)$/u, "") : w;
}

export function contentTokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Similarity 0..1: max of token-set Jaccard and bigram Jaccard (catches reordered and verbatim phrases). */
export function similarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const uni = jaccard(new Set(ta), new Set(tb));
  const bi = jaccard(bigrams(ta), bigrams(tb));
  // containment helps short hooks reused inside longer text
  const small = ta.length <= tb.length ? ta : tb;
  const big = new Set(ta.length <= tb.length ? tb : ta);
  const containment = small.length >= 3 ? small.filter((w) => big.has(w)).length / small.length : 0;
  return round(Math.max(uni, bi, containment * 0.9));
}

function bigrams(tokens: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) s.add(`${tokens[i]} ${tokens[i + 1]}`);
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function fingerprintsFor(draft: ContentDraft): Fingerprint[] {
  const fps: Fingerprint[] = [
    { type: "topic", value: normalizeText(draft.topic) },
    { type: "phrase", value: normalizeText(draft.key_phrase) },
    { type: "cta", value: normalizeText(draft.cta) },
    { type: "structure", value: draft.structure },
  ];
  if (draft.metaphor.trim()) fps.push({ type: "metaphor", value: normalizeText(draft.metaphor) });
  for (const h of draft.hook_options) fps.push({ type: "hook", value: normalizeText(h) });
  return fps.filter((f) => f.value.length > 0);
}

/**
 * Compares candidate fingerprints with recent workspace memory (most recent first).
 */
export function checkRepetition(candidate: readonly Fingerprint[], recent: readonly Fingerprint[], config: RepetitionConfig = DEFAULT_REPETITION_CONFIG): RepetitionReport {
  const hits: RepetitionHit[] = [];
  for (const c of candidate) {
    if (c.type === "structure") {
      const window = uniqueByItem(recent.filter((r) => r.type === "structure")).slice(0, config.structureWindow);
      const count = window.filter((r) => r.value === c.value).length;
      if (count + 1 > config.structureMaxInWindow) hits.push({ type: "structure", candidate: c.value, previous: c.value, similarity: round((count + 1) / (window.length + 1)) });
      continue;
    }
    if (c.type === "cta") {
      const same = recent.filter((r) => r.type === "cta" && similarity(r.value, c.value) >= 0.8);
      if (same.length >= config.ctaMaxRepeats) hits.push({ type: "cta", candidate: c.value, previous: same[0]!.value, similarity: 1 });
      continue;
    }
    const threshold = config.thresholds[c.type];
    // hooks and phrases also compare against each other: a used phrase recycled as a hook is still repetition
    const comparable: FingerprintType[] = c.type === "hook" || c.type === "phrase" ? ["hook", "phrase"] : [c.type];
    let best: RepetitionHit | null = null;
    for (const r of recent) {
      if (!comparable.includes(r.type)) continue;
      const sim = similarity(c.value, r.value);
      if (sim >= threshold && (!best || sim > best.similarity)) best = { type: c.type, candidate: c.value, previous: r.value, similarity: sim };
    }
    if (best) hits.push(best);
  }
  return { repeated: hits.length > 0, hits };
}

function uniqueByItem(fps: Fingerprint[]): Fingerprint[] {
  const seen = new Set<string>();
  return fps.filter((f, i) => {
    const key = f.contentItemId ?? `#${i}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TYPE_LABEL: Record<FingerprintType, string> = {
  topic: "assunto",
  phrase: "frase",
  metaphor: "metáfora",
  hook: "gancho",
  cta: "CTA",
  structure: "estrutura",
};

/** Short, non-judgmental explanation for the UI. */
export function describeAvoidance(report: RepetitionReport): string[] {
  const types = [...new Set(report.hits.map((h) => h.type))];
  return types.map((t) => `Evitei repetir ${TYPE_LABEL[t]} usado recentemente.`);
}

/** Instructions appended to the prompt when a candidate was rejected. */
export function avoidanceInstructions(report: RepetitionReport): string {
  if (!report.repeated) return "";
  const lines = report.hits.map((h) => `- ${TYPE_LABEL[h.type]} parecido com algo recente: "${h.previous}"`);
  return `O rascunho anterior repetiu conteúdo recente. Crie OUTRO ângulo, sem reaproveitar:\n${lines.join("\n")}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
