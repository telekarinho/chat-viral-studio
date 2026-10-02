import type { ContentDraft } from "./contract";

/** Regras do “diretor” (prompt mestre do Rodrigo, seção 4.6). Valem para roteiro vindo do assistente pelo conector. */
export const MAX_HOOK_WORDS = 12;
export const SCREEN_TEXT_WORDS: readonly [number, number] = [2, 5];
/** fala natural em vídeo curto ≈ 2,5 palavras por segundo */
export const WORDS_PER_SECOND = 2.5;
/** tolerância entre a duração declarada e a estimada pelas palavras */
const DURATION_SLACK: readonly [number, number] = [0.6, 1.6];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Problemas que o assistente precisa corrigir antes de salvar (lista vazia = ok). */
export function directorIssues(draft: ContentDraft): string[] {
  const out: string[] = [];
  draft.hook_options.forEach((h, i) => {
    const n = words(h);
    if (n > MAX_HOOK_WORDS) out.push(`gancho ${i + 1} tem ${n} palavras (máximo ${MAX_HOOK_WORDS})`);
  });
  const st = words(draft.screen_text);
  if (st < SCREEN_TEXT_WORDS[0] || st > SCREEN_TEXT_WORDS[1]) out.push(`screen_text tem ${st} palavra(s) (use ${SCREEN_TEXT_WORDS[0]} a ${SCREEN_TEXT_WORDS[1]})`);
  const spoken = words(draft.script);
  const estimated = Math.round(spoken / WORDS_PER_SECOND);
  const [lo, hi] = DURATION_SLACK;
  if (estimated < draft.duration_seconds * lo || estimated > draft.duration_seconds * hi) {
    out.push(`duration_seconds ${draft.duration_seconds}s não bate com o texto (${spoken} palavras ≈ ${estimated}s a ${WORDS_PER_SECOND} palavras/s)`);
  }
  return out;
}
