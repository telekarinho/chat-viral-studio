import type { MusicMood } from "./music";
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
  /** palavras com o tempo REAL da fala (transcrição) — ativa o destaque palavra a palavra */
  words?: { text: string; startMs: number; endMs: number }[];
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

/** Transição entre partes (FFmpeg xfade), escolhida sozinha pelo papel da parte seguinte. */
export type TransitionKind = "fade" | "fadefast" | "smoothleft" | "smoothup" | "zoomin";
export interface Transition { kind: TransitionKind; durationMs: number }
export const TRANSITION_MS = 300;

export function chooseTransition(to: SegmentRole, index: number): TransitionKind {
  if (to === "mas") return "zoomin"; // a virada ganha um "empurrão"
  if (to === "closing") return "fade"; // fechamento respira
  if (to === "cta") return "smoothup";
  return index % 2 === 0 ? "smoothleft" : "fadefast";
}

export type Retouch = "off" | "leve" | "forte";
export const RETOUCH_LEVELS: readonly Retouch[] = ["forte", "leve", "off"];

export type CaptionStyle = "manuscrito" | "destaque" | "limpo" | "nenhuma";
export const CAPTION_STYLES: readonly CaptionStyle[] = ["manuscrito", "destaque", "limpo", "nenhuma"];

/** Música de fundo: faixa da biblioteca (music.ts), abaixa sozinha quando há fala. */
export interface PlanMusic {
  trackId: string;
  mood: MusicMood;
  /** volume da música sob a voz, 0–1 (padrão 0.22) */
  volume: number;
}

export interface EditPlan {
  version: "edit-v1";
  width: 1080;
  height: 1920;
  fps: 30;
  captionStyle: CaptionStyle;
  /** embelezamento no FINAL (o original nunca muda): "leve" = natural, "forte" = tipo câmera do iPhone/WhatsApp */
  retouch: Retouch;
  /** tira o tremido de quem grava andando */
  stabilize?: boolean;
  signature: string;
  /** cor do destaque da legenda (#RRGGBB) */
  accentColor?: string;
  music?: PlanMusic | null;
  clips: EditClip[];
  /** transitions[k] liga clips[k] → clips[k+1] (a sobreposição encurta o total) */
  transitions?: Transition[];
  totalMs: number;
}

/** Início de cada parte na linha do tempo final (descontando as sobreposições das transições). */
export function clipStartsMs(plan: Pick<EditPlan, "clips" | "transitions">): number[] {
  const out: number[] = [];
  let t = 0;
  plan.clips.forEach((c, k) => {
    out.push(t);
    t += c.durationMs - (plan.transitions?.[k]?.durationMs ?? 0);
  });
  return out;
}

export interface PlanInput {
  segments: readonly ScriptSegment[];
  /** chosen (latest) take per segment index */
  takes: ReadonlyArray<{ segmentIndex: number; takeId: string; durationMs: number }>;
  captionStyle?: CaptionStyle;
  retouch?: Retouch;
  stabilize?: boolean;
  signature: string;
  accentColor?: string;
  music?: PlanMusic | null;
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
    const cue = { startMs: t, endMs: t + len, text: style === "limpo" ? c : c.toLocaleUpperCase("pt-BR") };
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
  // transições automáticas entre as partes (curtas o bastante para nunca comer a fala)
  const transitions: Transition[] = clips.slice(1).map((c, k) => ({
    kind: chooseTransition(c.role, k),
    durationMs: Math.max(0, Math.min(TRANSITION_MS, Math.floor(Math.min(clips[k]!.durationMs, c.durationMs) / 4))),
  }));
  return {
    version: "edit-v1", width: 1080, height: 1920, fps: 30, captionStyle: style, retouch: input.retouch ?? "leve", stabilize: input.stabilize ?? false, signature: input.signature,
    ...(input.accentColor ? { accentColor: input.accentColor } : {}), music: input.music ?? null, clips, transitions,
    totalMs: clips.reduce((a, c) => a + c.durationMs, 0) - transitions.reduce((a, t) => a + t.durationMs, 0),
  };
}

/** Escolhas do criador para a montagem final (vão em content_items.structured_payload.edit; validadas no servidor). */
export interface EditChoices {
  captionStyle: CaptionStyle;
  /** "auto" = clima do pilar · "none" = sem música · um clima (MusicMood) · ou o id de uma faixa */
  music: string;
  musicVolume?: number;
  retouch?: Retouch;
  stabilize?: boolean;
}

export const DEFAULT_EDIT_CHOICES: EditChoices = { captionStyle: "manuscrito", music: "auto", musicVolume: 0.22, retouch: "forte", stabilize: true };
