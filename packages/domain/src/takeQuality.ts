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
