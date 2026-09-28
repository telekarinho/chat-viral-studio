import type { ContentDraft } from "./ai/contract";

export const SEGMENT_ROLES = ["hook", "e", "mas", "por_isso", "cta", "closing", "free"] as const;
export type SegmentRole = (typeof SEGMENT_ROLES)[number];

export interface ScriptSegment {
  index: number; // 0-based
  role: SegmentRole;
  label: string;
  text: string;
}

export const SEGMENT_LABEL: Record<SegmentRole, string> = {
  hook: "Gancho",
  e: "E — a situação",
  mas: "MAS — a virada",
  por_isso: "POR ISSO — o aprendizado",
  cta: "Chamada",
  closing: "Fechamento",
  free: "Trecho",
};

const MIN_WORDS = 3;

/**
 * Splits a script into recordable parts so the creator records piece by piece.
 * Generated scripts use the structure (gancho → E → MAS → POR ISSO → CTA + fechamento);
 * scripts edited by the user are split by paragraph.
 */
export function buildSegments(draft: ContentDraft, opts: { selectedHook: number; userEdited: boolean; closingPhrase: string }): ScriptSegment[] {
  const hook = draft.hook_options[opts.selectedHook] ?? draft.hook_options[0] ?? "";
  const closing = opts.closingPhrase.trim();
  let parts: { role: SegmentRole; text: string }[];

  if (draft.format === "thought") {
    const body = stripClosing(draft.script, closing);
    parts = [{ role: "hook", text: body }, { role: "closing", text: closing }];
  } else if (opts.userEdited) {
    parts = paragraphs(stripClosing(draft.script, closing)).map((text) => ({ role: "free" as const, text }));
    parts.push({ role: "closing", text: closing });
  } else {
    parts = [
      { role: "hook", text: hook },
      { role: "e", text: draft.narrative.e },
      { role: "mas", text: draft.narrative.mas },
      { role: "por_isso", text: draft.narrative.por_isso },
      { role: "cta", text: draft.cta },
      { role: "closing", text: closing },
    ];
  }

  const merged: { role: SegmentRole; text: string }[] = [];
  for (const p of parts.filter((p) => p.text.trim())) {
    const prev = merged[merged.length - 1];
    // "E se der certo!" alone is a legit short part; other tiny fragments ride with the next/previous one
    if (prev && p.role !== "closing" && wordCount(prev.text) < MIN_WORDS) prev.text = `${prev.text} ${p.text}`.trim();
    else merged.push({ role: p.role, text: p.text.trim() });
  }
  return merged.map((p, index) => ({ index, role: p.role, label: SEGMENT_LABEL[p.role], text: p.text }));
}

export interface SegmentProgress {
  recorded: number[];
  next: number | null;
  done: boolean;
}

/** Which part to show next: the first one without a take (so a retake doesn't lose the order). */
export function segmentProgress(total: number, recordedIndexes: readonly number[]): SegmentProgress {
  const recorded = [...new Set(recordedIndexes)].filter((i) => i >= 0 && i < total).sort((a, b) => a - b);
  let next: number | null = null;
  for (let i = 0; i < total; i++) {
    if (!recorded.includes(i)) {
      next = i;
      break;
    }
  }
  return { recorded, next, done: total > 0 && recorded.length === total };
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphs(s: string): string[] {
  return s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function stripClosing(script: string, closing: string): string {
  const body = script.trim();
  if (!closing) return body;
  return body.toLowerCase().endsWith(closing.toLowerCase()) ? body.slice(0, body.length - closing.length).trim() : body;
}
