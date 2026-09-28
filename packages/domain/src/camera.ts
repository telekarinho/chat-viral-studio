export type ResolutionPreset = "1080p" | "2k" | "4k";

export interface CameraFormatLike {
  videoWidth: number;
  videoHeight: number;
  maxFps: number;
}

/** Long edge in pixels (recording is 9:16 portrait, sensor formats are landscape). */
export const PRESET_LONG_EDGE: Record<ResolutionPreset, number> = { "1080p": 1920, "2k": 2560, "4k": 3840 };
export const PRESET_LABEL: Record<ResolutionPreset, string> = { "1080p": "1080p", "2k": "2K", "4k": "4K" };

const longEdge = (f: CameraFormatLike) => Math.max(f.videoWidth, f.videoHeight);
const isSixteenNine = (f: CameraFormatLike) => Math.abs(longEdge(f) / Math.min(f.videoWidth, f.videoHeight) - 16 / 9) < 0.02;

/** Presets this device can really record — 2K/4K only appear when a 16:9 format exists. */
export function availablePresets(formats: readonly CameraFormatLike[]): ResolutionPreset[] {
  const presets = (Object.keys(PRESET_LONG_EDGE) as ResolutionPreset[]).filter((p) =>
    formats.some((f) => isSixteenNine(f) && longEdge(f) >= PRESET_LONG_EDGE[p]),
  );
  return presets.length > 0 ? presets : ["1080p"];
}

/** Picks the smallest 16:9 format that satisfies the preset, preferring the requested fps. */
export function pickFormat<T extends CameraFormatLike>(formats: readonly T[], preset: ResolutionPreset, fps: number): T | null {
  const target = PRESET_LONG_EDGE[preset];
  const ok = formats.filter((f) => isSixteenNine(f) && longEdge(f) >= target);
  const pool = ok.length > 0 ? ok : formats.filter(isSixteenNine);
  if (pool.length === 0) return formats[0] ?? null;
  return [...pool].sort((a, b) => {
    const fa = a.maxFps >= fps ? 0 : 1;
    const fb = b.maxFps >= fps ? 0 : 1;
    return fa - fb || Math.abs(longEdge(a) - target) - Math.abs(longEdge(b) - target) || b.maxFps - a.maxFps;
  })[0]!;
}

export function supportedFps(format: CameraFormatLike | null): number[] {
  if (!format) return [30];
  return [24, 30, 60].filter((f) => f <= format.maxFps);
}
