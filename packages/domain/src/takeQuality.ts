/** Fala média do criador (palavras por segundo) — mesma conta do diretor para a duração do roteiro. */
const WORDS_PER_S = 2.5;
const MIN_SHORT_DIM = 720;
/** abaixo disto do tempo esperado, a fala provavelmente foi cortada */
const TOO_SHORT = 0.5;
/** acima disto (+ folga), sobrou muita pausa/erro — o AutoCut corta, mas vale saber */
const TOO_LONG = 2.5;
const LONG_SLACK_S = 3;

export interface TakeTech { durationMs: number | null; width: number | null; height: number | null; synced: boolean }

/**
 * Checagem TÉCNICA de um take (não é nota de viralidade): duração × texto da parte, resolução, orientação e envio.
 * Sem análise de áudio/rosto aqui — o que não foi medido não aparece.
 */
export function takeTechNotes(t: TakeTech, text: string): string[] {
  const notes: string[] = [];
  if (!t.synced) notes.push("ainda não subiu para a nuvem");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (t.durationMs !== null && words) {
    const expected = words / WORDS_PER_S;
    const got = t.durationMs / 1000;
    if (got < expected * TOO_SHORT) notes.push(`curto demais (${got.toFixed(1)}s para ~${expected.toFixed(0)}s de texto): pode ter cortado a fala`);
    else if (got > expected * TOO_LONG + LONG_SLACK_S) notes.push(`bem mais longo que o texto (${got.toFixed(0)}s para ~${expected.toFixed(0)}s): muitas pausas ou erros (o AutoCut corta pausas)`);
  }
  if (t.width && t.height) {
    if (Math.min(t.width, t.height) < MIN_SHORT_DIM) notes.push(`resolução baixa (${t.width}x${t.height})`);
    if (t.width > t.height) notes.push("gravado na horizontal: o vídeo final é vertical e corta as laterais");
  }
  return notes;
}

/** marca do take que o criador (ou o diretor) escolheu para a parte; os outros ficam como reserva */
export const CHOSEN_TAG = "escolhido";
export const DISCARDED_TAG = "descartado";

/**
 * Take usado em cada parte (mesma regra no app, na montagem e no conector): o escolhido; sem escolha, o mais
 * recente. Descartados nunca entram (o arquivo continua guardado). `newestFirst` = mais novos primeiro.
 */
export function chosenTakes<T extends { segmentIndex: number | null; tags: readonly string[] | null }>(newestFirst: readonly T[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const t of newestFirst) {
    const tags = t.tags ?? [];
    if (t.segmentIndex === null || tags.includes(DISCARDED_TAG)) continue;
    const cur = out.get(t.segmentIndex);
    if (!cur || (tags.includes(CHOSEN_TAG) && !(cur.tags ?? []).includes(CHOSEN_TAG))) out.set(t.segmentIndex, t);
  }
  return out;
}

/** acima disto (palavras por segundo) a fala fica corrida */
const FAST_WPS = 3.4;

export interface TakeCheck { key: "fala" | "ritmo" | "duracao" | "enquadramento" | "resolucao"; ok: boolean; label: string }

/**
 * Diagnóstico do take para o criador (🟢/🟡), só com o que dá para medir no aparelho: fala × texto, ritmo,
 * duração, orientação e resolução. Áudio e estabilidade não são medidos aqui — não aparecem como "bons".
 */
export function takeChecks(t: Omit<TakeTech, "synced">, text: string): TakeCheck[] {
  const out: TakeCheck[] = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  const got = t.durationMs !== null ? t.durationMs / 1000 : null;
  if (got !== null && words) {
    const expected = words / WORDS_PER_S;
    const short = got < expected * TOO_SHORT;
    out.push({ key: "fala", ok: !short, label: short ? "Curto demais: pode ter cortado a fala" : "Fala completa" });
    if (!short) out.push(words / got > FAST_WPS ? { key: "ritmo", ok: false, label: "Falou um pouco rápido" } : { key: "ritmo", ok: true, label: "Ritmo bom" });
    const long = got > expected * TOO_LONG + LONG_SLACK_S;
    out.push({ key: "duracao", ok: !long, label: long ? `Bem mais longo que o texto (${Math.round(got)}s) — o AutoCut corta as pausas` : `Duração boa (${got.toFixed(1)}s)` });
  } else if (got !== null) out.push({ key: "duracao", ok: got >= 1, label: got >= 1 ? `Duração ${got.toFixed(1)}s` : "Curto demais" });
  if (t.width && t.height) {
    out.push(t.width > t.height ? { key: "enquadramento", ok: false, label: "Gravado na horizontal: o vídeo final corta as laterais" } : { key: "enquadramento", ok: true, label: "Vertical ✓" });
    const low = Math.min(t.width, t.height) < MIN_SHORT_DIM;
    out.push({ key: "resolucao", ok: !low, label: low ? `Resolução baixa (${t.width}x${t.height})` : "Boa resolução" });
  }
  return out;
}

/** Recomendação técnica entre vários takes da mesma parte: o com menos alertas (empate: o mais recente). */
export function recommendTake<T extends Omit<TakeTech, "synced">>(newestFirst: readonly T[], text: string): T | undefined {
  let best: T | undefined;
  let bestWarn = Infinity;
  for (const t of newestFirst) {
    const warn = takeChecks(t, text).filter((c) => !c.ok).length;
    if (warn < bestWarn) { best = t; bestWarn = warn; }
  }
  return best;
}
