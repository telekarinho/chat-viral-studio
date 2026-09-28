import type { ScriptSegment, SegmentRole } from "./segments";

/**
 * Automatic edit decision list: which take goes where, which camera move each part gets and
 * when each caption appears. Pure data — the FFmpeg renderer (apps/worker) just executes it.
 */
export type EffectKind = "punch_in" | "slow_zoom_in" | "zoom_out_reveal" | "push_in" | "hold" | "zoom_out_end";

export interface ClipEffect {
  kind: EffectKind;
  fromScale: number;
  toScale: number;
  /** ms over which the move happens (then holds) */
  moveMs: number;
}

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface EditClip {
  segmentIndex: number;
  role: SegmentRole;
  takeId: string;
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  durationMs: number;
  effect: ClipEffect;
  captions: CaptionCue[]; // relative to clip start (after trim)
}

export type CaptionStyle = "manuscrito" | "limpo" | "nenhuma";

export interface EditPlan {
  version: "edit-v1";
  width: 1080;
  height: 1920;
  fps: 30;
  captionStyle: CaptionStyle;
  /** light skin retouch on the final (never on the original): "leve" ≈ TikTok/WhatsApp beauty, subtle */
  retouch: "off" | "leve";
  signature: string;
  clips: EditClip[];
  totalMs: number;
}

export interface PlanInput {
  segments: readonly ScriptSegment[];
  /** chosen (latest) take per segment index */
  takes: ReadonlyArray<{ segmentIndex: number; takeId: string; durationMs: number }>;
  captionStyle?: CaptionStyle;
  retouch?: "off" | "leve";
  signature: string;
}

// tap on the record button is audible/visible at both ends of each part
export const TRIM_HEAD_MS = 250;
export const TRIM_TAIL_MS = 200;
const MIN_CLIP_MS = 600;
export const MAX_CAPTION_CHARS = 22;

const BASE_EFFECT: Record<SegmentRole, ClipEffect> = {
  hook: { kind: "punch_in", fromScale: 1.0, toScale: 1.14, moveMs: 450 },
  e: { kind: "slow_zoom_in", fromScale: 1.0, toScale: 1.06, moveMs: 0 },
  mas: { kind: "zoom_out_reveal", fromScale: 1.14, toScale: 1.0, moveMs: 700 },
  por_isso: { kind: "push_in", fromScale: 1.0, toScale: 1.1, moveMs: 0 },
  cta: { kind: "hold", fromScale: 1.04, toScale: 1.04, moveMs: 0 },
  closing: { kind: "zoom_out_end", fromScale: 1.08, toScale: 1.0, moveMs: 0 },
  free: { kind: "slow_zoom_in", fromScale: 1.0, toScale: 1.06, moveMs: 0 },
};

/** Picks the camera move from the part's role and what it says. moveMs 0 = move across the whole clip. */
export function chooseEffect(role: SegmentRole, text: string, position: number, durationMs: number): ClipEffect {
  const base = { ...BASE_EFFECT[role] };
  const t = text.trim();
  const emphatic = /[?!]$/.test(t) || /^(nunca|ninguém|pare|para|escuta|olha)\b/i.test(t);
  if (role === "free") {
    // alternate so consecutive free paragraphs don't all zoom the same way
    return position % 2 === 0 ? base : { kind: "push_in", fromScale: 1.06, toScale: 1.0, moveMs: 0 };
  }
  if (emphatic && (role === "e" || role === "por_isso" || role === "cta")) return { kind: "punch_in", fromScale: 1.0, toScale: 1.12, moveMs: 400 };
  // long takes get a gentler move so it doesn't feel like a zoom machine
  if (durationMs > 20_000 && base.moveMs === 0) return { ...base, toScale: 1 + (base.toScale - 1) * 0.6, fromScale: 1 + (base.fromScale - 1) * 0.6 };
  return base;
}

/** 3–6 words per caption, timed by character share of the clip. */
export function buildCaptions(text: string, durationMs: number, style: CaptionStyle): CaptionCue[] {
  if (style === "nenhuma" || durationMs <= 0) return [];
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    // keep each cue on one line inside 1080px (≈22 chars at caption size)
    if (cur.length > 0 && [...cur, w].join(" ").length > MAX_CAPTION_CHARS) {
      chunks.push(cur.join(" "));
      cur = [];
    }
    cur.push(w);
    const breakHere = cur.length >= 6 || (cur.length >= 3 && /[.,!?;:…]$/.test(w));
    if (breakHere) {
      chunks.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) {
    const tail = cur.join(" ");
    const last = chunks[chunks.length - 1];
    if (cur.length < 3 && last !== undefined && `${last} ${tail}`.length <= MAX_CAPTION_CHARS) chunks[chunks.length - 1] = `${last} ${tail}`;
    else chunks.push(tail);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  let t = 0;
  return chunks.map((c, i) => {
    const len = i === chunks.length - 1 ? durationMs - t : Math.round((c.length / total) * durationMs);
    const cue = { startMs: t, endMs: t + len, text: style === "manuscrito" ? c.toUpperCase() : c };
    t += len;
    return cue;
  });
}

export function buildEditPlan(input: PlanInput): EditPlan {
  const style = input.captionStyle ?? "manuscrito";
  const byIndex = new Map(input.takes.map((t) => [t.segmentIndex, t]));
  const missing = input.segments.filter((s) => !byIndex.has(s.index)).map((s) => s.index + 1);
  if (missing.length) throw new Error(`Faltam partes: ${missing.join(", ")}`);
  const clips: EditClip[] = input.segments.map((seg, position) => {
    const take = byIndex.get(seg.index)!;
    const canTrim = take.durationMs - TRIM_HEAD_MS - TRIM_TAIL_MS >= MIN_CLIP_MS;
    const trimStartMs = canTrim ? TRIM_HEAD_MS : 0;
    const trimEndMs = canTrim ? TRIM_TAIL_MS : 0;
    const durationMs = take.durationMs - trimStartMs - trimEndMs;
    return {
      segmentIndex: seg.index,
      role: seg.role,
      takeId: take.takeId,
      sourceDurationMs: take.durationMs,
      trimStartMs,
      trimEndMs,
      durationMs,
      effect: chooseEffect(seg.role, seg.text, position, durationMs),
      captions: buildCaptions(seg.text, durationMs, style),
    };
  });
  return { version: "edit-v1", width: 1080, height: 1920, fps: 30, captionStyle: style, retouch: input.retouch ?? "leve", signature: input.signature, clips, totalMs: clips.reduce((a, c) => a + c.durationMs, 0) };
}
