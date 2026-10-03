import type { ContentDraft } from "./ai/contract";
import { spokenTakes, takeInstructions, type SpeechMode } from "./ai/direction";

export const SEGMENT_ROLES = ["hook", "e", "mas", "por_isso", "cta", "closing", "free"] as const;
export type SegmentRole = (typeof SEGMENT_ROLES)[number];

export interface ScriptSegment {
  index: number; // 0-based
  role: SegmentRole;
  label: string;
  text: string;
  /** instruções do diretor para este take (enquadramento, luz, olhar…), quando o roteiro trouxe direção */
  direction?: { label: string; value: string }[];
  /** como o diretor quer a fala (padrão: exata) */
  speechMode?: SpeechMode;
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

/** Sales scripts reuse E/MAS/POR ISSO as dor → objeção → prova. */
export const BUSINESS_SEGMENT_LABEL: Partial<Record<SegmentRole, string>> = { e: "A dor do cliente", mas: "A objeção respondida", por_isso: "A prova" };

const MIN_WORDS = 3;

/**
 * Splits a script into recordable parts so the creator records piece by piece.
 * Generated scripts use the structure (gancho → E → MAS → POR ISSO → CTA + fechamento);
 * scripts edited by the user are split by paragraph.
 */
export function buildSegments(draft: ContentDraft, opts: { selectedHook: number; userEdited: boolean; closingPhrase: string; business?: boolean }): ScriptSegment[] {
  const hook = draft.hook_options[opts.selectedHook] ?? draft.hook_options[0] ?? "";
  const closing = opts.closingPhrase.trim();
  let parts: { role: SegmentRole; text: string; label?: string; direction?: { label: string; value: string }[]; speechMode?: SpeechMode }[];

  const takes = opts.userEdited ? [] : spokenTakes(draft.direcao);
  if (takes.length) {
    // direção do assistente: grava take por take, na ordem; 1º = gancho, último antes do fechamento = chamada
    const hasClosing = closing && takes.some((t) => t.fala_exata.toLowerCase().includes(closing.toLowerCase()));
    parts = takes.map((t, i) => ({
      role: i === 0 ? "hook" : i === takes.length - 1 && takes.length > 2 && !hasClosing ? "cta" : "free",
      text: t.fala_exata,
      label: `Take ${t.ordem} — ${t.nome}`,
      direction: takeInstructions(t),
      ...(t.modo_fala !== "exata" ? { speechMode: t.modo_fala } : {}),
    }));
    if (closing && !hasClosing) parts.push({ role: "closing", text: closing });
  } else if (draft.format === "thought") {
    // gancho = 1ª frase (o que prende); o resto é a mensagem; fechamento sozinho
    const [first, ...rest] = sentences(stripClosing(draft.script, closing));
    parts = [{ role: "hook", text: first ?? "" }, { role: "free", text: rest.join(" "), label: "Mensagem" }, { role: "closing", text: closing }];
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

  const merged: typeof parts = [];
  for (const p of parts.filter((p) => p.text.trim())) {
    const prev = merged[merged.length - 1];
    // "E se der certo!" alone is a legit short part; other tiny fragments ride with the next/previous one
    // takes do diretor são gravados como vieram (cada um tem sua instrução)
    if (!takes.length && prev && p.role !== "closing" && wordCount(prev.text) < MIN_WORDS) prev.text = `${prev.text} ${p.text}`.trim();
    else merged.push({ ...p, text: p.text.trim() });
  }
  return merged.map((p, index) => ({
    index, role: p.role, label: p.label ?? ((opts.business && BUSINESS_SEGMENT_LABEL[p.role]) || SEGMENT_LABEL[p.role]), text: p.text,
    ...(p.direction?.length ? { direction: p.direction } : {}),
    ...(p.speechMode ? { speechMode: p.speechMode } : {}),
  }));
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

/** Frases terminadas em . ! ? ou reticências (o que sobrar sem pontuação vira a última frase). */
function sentences(s: string): string[] {
  const flat = s.replace(/\s+/g, " ").trim();
  return (flat.match(/[^.!?…]+(?:[.!?…]+["”']?|$)/g) ?? []).map((x) => x.trim()).filter(Boolean);
}

function paragraphs(s: string): string[] {
  return s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function stripClosing(script: string, closing: string): string {
  const body = script.trim();
  if (!closing) return body;
  return body.toLowerCase().endsWith(closing.toLowerCase()) ? body.slice(0, body.length - closing.length).trim() : body;
}

/** A take recorded in one go (not by parts) is edited as a single "free" segment covering the whole script. */
export function wholeTakeSegment(draft: ContentDraft): ScriptSegment {
  return { index: 0, role: "free", label: "Take completo", text: draft.script.replace(/\s+/g, " ").trim() };
}
