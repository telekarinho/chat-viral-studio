export interface TeleprompterState {
  phase: "idle" | "countdown" | "running" | "paused" | "finished";
  fontSize: number;
  speed: number; // 1..10
  mirrored: boolean;
  offset: number; // px scrolled
  countdownMs: number;
  countdownSeconds: number;
}

export type TeleprompterAction =
  | { type: "start" }
  | { type: "tick"; dtMs: number; maxOffset: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart" }
  | { type: "advance"; px: number; maxOffset: number }
  | { type: "setFontSize"; value: number }
  | { type: "setSpeed"; value: number }
  | { type: "toggleMirror" }
  | { type: "setCountdown"; seconds: number };

export const TELEPROMPTER_LIMITS = { fontMin: 18, fontMax: 64, speedMin: 1, speedMax: 10, countdownMax: 10 };

export const initialTeleprompter: TeleprompterState = { phase: "idle", fontSize: 30, speed: 3, mirrored: false, offset: 0, countdownMs: 0, countdownSeconds: 3 };

/** px per second: speed 1 ≈ slow reader, 10 ≈ fast. */
export function pxPerSecond(speed: number, fontSize: number): number {
  return speed * fontSize * 0.35;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function teleprompterReducer(s: TeleprompterState, a: TeleprompterAction): TeleprompterState {
  switch (a.type) {
    case "start":
      if (s.phase === "running" || s.phase === "countdown") return s;
      return s.countdownSeconds > 0 ? { ...s, phase: "countdown", countdownMs: s.countdownSeconds * 1000 } : { ...s, phase: "running" };
    case "tick": {
      if (s.phase === "countdown") {
        const left = s.countdownMs - a.dtMs;
        return left > 0 ? { ...s, countdownMs: left } : { ...s, phase: "running", countdownMs: 0 };
      }
      if (s.phase !== "running") return s;
      const offset = s.offset + (pxPerSecond(s.speed, s.fontSize) * a.dtMs) / 1000;
      return offset >= a.maxOffset ? { ...s, offset: Math.max(0, a.maxOffset), phase: "finished" } : { ...s, offset };
    }
    case "pause":
      return s.phase === "running" || s.phase === "countdown" ? { ...s, phase: "paused", countdownMs: 0 } : s;
    case "resume":
      return s.phase === "paused" ? { ...s, phase: "running" } : s;
    case "restart":
      return { ...s, phase: "idle", offset: 0, countdownMs: 0 };
    case "advance": {
      const offset = clamp(s.offset + a.px, 0, Math.max(0, a.maxOffset));
      return { ...s, offset, phase: s.phase === "finished" && offset < a.maxOffset ? "paused" : s.phase };
    }
    case "setFontSize":
      return { ...s, fontSize: clamp(Math.round(a.value), TELEPROMPTER_LIMITS.fontMin, TELEPROMPTER_LIMITS.fontMax) };
    case "setSpeed":
      return { ...s, speed: clamp(Math.round(a.value), TELEPROMPTER_LIMITS.speedMin, TELEPROMPTER_LIMITS.speedMax) };
    case "toggleMirror":
      return { ...s, mirrored: !s.mirrored };
    case "setCountdown":
      return { ...s, countdownSeconds: clamp(Math.round(a.seconds), 0, TELEPROMPTER_LIMITS.countdownMax) };
  }
}
