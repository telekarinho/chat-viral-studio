import type { SpokenWord } from "./captions";

/**
 * Corte automático de erros de gravação, a partir das palavras faladas (tempo real da transcrição):
 * silêncio no começo/fim, pausas longas, falso começo (frase repetida em seguida) e muletas ("ahn", "hum").
 * Nada é apagado do original: o resultado é só a lista de trechos que entram no vídeo final.
 */
export interface KeepRange {
  startMs: number;
  endMs: number;
}

export interface CutReport {
  keep: KeepRange[];
  /** palavras com o tempo já remapeado para a linha do tempo depois dos cortes */
  words: SpokenWord[];
  removedMs: number;
  pauses: number;
  repeats: number;
  fillers: number;
}

const LEAD_MS = 150;
const TAIL_MS = 280;
const MAX_PAUSE_MS = 800; // pausa maior que isso é encurtada
const PAUSE_LEFT_MS = 320; // quanto de respiro fica
const MIN_RANGE_MS = 250;
const FILLERS = new Set(["ahn", "ahm", "hum", "hmm", "hm", "uh", "uhm", "eh", "ehh", "aah", "ee", "eee", "eeh"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Índices de palavras a descartar por falso começo: "hoje eu quero… hoje eu quero falar" → fica a 2ª. */
export function repeatedStarts(words: readonly SpokenWord[]): Set<number> {
  const n = words.map((w) => norm(w.text));
  const drop = new Set<number>();
  let i = 0;
  while (i < n.length) {
    let matched = 0;
    for (let len = Math.min(8, Math.floor((n.length - i) / 2)); len >= 2; len--) {
      let same = true;
      for (let k = 0; k < len; k++) {
        if (!n[i + k] || n[i + k] !== n[i + len + k]) { same = false; break; }
      }
      // 2 palavras só contam se forem "de verdade" (evita cortar "não, não" / "muito muito")
      if (same && (len >= 3 || n.slice(i, i + len).join("").length >= 8)) { matched = len; break; }
    }
    if (matched) {
      for (let k = 0; k < matched; k++) drop.add(i + k);
      i += matched;
    } else i++;
  }
  return drop;
}

export function planCuts(words: readonly SpokenWord[], clipDurationMs: number): CutReport {
  const clean = words.filter((w) => w.endMs > w.startMs && w.startMs < clipDurationMs).map((w) => ({ ...w, endMs: Math.min(w.endMs, clipDurationMs) }));
  if (clean.length === 0) return { keep: [{ startMs: 0, endMs: clipDurationMs }], words: [], removedMs: 0, pauses: 0, repeats: 0, fillers: 0 };

  const repeats = repeatedStarts(clean);
  const fillerIdx = new Set<number>();
  clean.forEach((w, i) => { if (FILLERS.has(norm(w.text))) fillerIdx.add(i); });
  const kept = clean.filter((_, i) => !repeats.has(i) && !fillerIdx.has(i));
  if (kept.length === 0) return { keep: [{ startMs: 0, endMs: clipDurationMs }], words: [...clean], removedMs: 0, pauses: 0, repeats: 0, fillers: 0 };

  // blocos de fala contínua; entre blocos sobra no máximo PAUSE_LEFT_MS
  const keep: KeepRange[] = [];
  let pauses = 0;
  let cur: KeepRange = { startMs: Math.max(0, kept[0]!.startMs - LEAD_MS), endMs: kept[0]!.endMs };
  let prevIdx = clean.indexOf(kept[0]!);
  for (let k = 1; k < kept.length; k++) {
    const w = kept[k]!;
    const idx = clean.indexOf(w);
    const skipped = idx - prevIdx > 1; // havia palavra descartada no meio
    const gap = w.startMs - cur.endMs;
    if (skipped || gap > MAX_PAUSE_MS) {
      if (!skipped) pauses++;
      const half = Math.min(PAUSE_LEFT_MS / 2, Math.max(0, gap / 2));
      keep.push({ startMs: cur.startMs, endMs: cur.endMs + (skipped ? Math.min(80, Math.max(0, gap / 2)) : half) });
      cur = { startMs: Math.max(cur.endMs, w.startMs - (skipped ? 80 : half)), endMs: w.endMs };
    } else cur.endMs = w.endMs;
    prevIdx = idx;
  }
  keep.push({ startMs: cur.startMs, endMs: Math.min(clipDurationMs, cur.endMs + TAIL_MS) });

  const ranges = keep.filter((r) => r.endMs - r.startMs >= MIN_RANGE_MS);
  const safe = ranges.length ? ranges : [{ startMs: 0, endMs: clipDurationMs }];
  const total = safe.reduce((a, r) => a + (r.endMs - r.startMs), 0);
  return {
    keep: safe, words: remapWords(kept, safe), removedMs: Math.max(0, clipDurationMs - total),
    pauses, repeats: countGroups(repeats), fillers: fillerIdx.size,
  };
}

/** Tempo das palavras na linha do tempo depois dos cortes. */
export function remapWords(words: readonly SpokenWord[], keep: readonly KeepRange[]): SpokenWord[] {
  const out: SpokenWord[] = [];
  let offset = 0;
  for (const r of keep) {
    for (const w of words) {
      const mid = (w.startMs + w.endMs) / 2;
      if (mid < r.startMs || mid >= r.endMs) continue;
      out.push({ text: w.text, startMs: Math.max(0, w.startMs - r.startMs) + offset, endMs: Math.min(r.endMs, w.endMs) - r.startMs + offset });
    }
    offset += r.endMs - r.startMs;
  }
  return out;
}

function countGroups(idx: Set<number>): number {
  let groups = 0;
  for (const i of idx) if (!idx.has(i - 1)) groups++;
  return groups;
}
