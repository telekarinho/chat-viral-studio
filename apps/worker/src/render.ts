import type { EditClip, EditPlan } from "@postai/domain";

export interface RenderInput {
  plan: EditPlan;
  /** local path of each clip's original, in plan.clips order */
  inputs: string[];
  /** which inputs have an audio stream (ffprobe) */
  hasAudio: boolean[];
  fontFile: string;
  output: string;
}

const CAPTION_COLOR = "0xF3E6CF"; // creme, preset "Manuscrito" (docs/CAPTION_STYLES.md)
const SIGNATURE_MS = 2000;

/** drawtext text escaping inside a single-quoted filtergraph value. */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

const sec = (ms: number) => (ms / 1000).toFixed(3);

/** zoompan expression: moves from→to over moveMs (0 = whole clip), then holds. */
export function zoomExpr(clip: EditClip, fps: number): string {
  const { fromScale: a, toScale: b, moveMs } = clip.effect;
  if (a === b) return a.toFixed(4);
  const frames = Math.max(1, Math.round(((moveMs > 0 ? Math.min(moveMs, clip.durationMs) : clip.durationMs) / 1000) * fps));
  return `${a.toFixed(4)}+(${(b - a).toFixed(4)})*min(on/${frames}\\,1)`;
}

function captionFilters(clip: EditClip, font: string, style: EditPlan["captionStyle"]): string[] {
  if (style === "nenhuma") return [];
  const size = style === "manuscrito" ? 64 : 54;
  return clip.captions.map(
    (c) =>
      `drawtext=fontfile='${font}':text='${escapeDrawtext(c.text)}':fontsize=${size}:fontcolor=${CAPTION_COLOR}:shadowcolor=0x000000@0.55:shadowx=2:shadowy=2` +
      `:x=(w-text_w)/2:y=h*0.62:enable='between(t\\,${sec(c.startMs)}\\,${sec(c.endMs)})'`,
  );
}

/** Builds the full ffmpeg argv for one final 9:16 export. Deterministic: same plan + inputs = same command. */
export function ffmpegArgs(r: RenderInput): string[] {
  const { plan } = r;
  if (r.inputs.length !== plan.clips.length) throw new Error("inputs e clips com tamanhos diferentes");
  const font = r.fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const W = plan.width;
  const H = plan.height;
  const parts: string[] = [];
  const concatIn: string[] = [];

  plan.clips.forEach((clip, i) => {
    const start = sec(clip.trimStartMs);
    const end = sec(clip.trimStartMs + clip.durationMs);
    const v = [
      `trim=start=${start}:end=${end}`,
      "setpts=PTS-STARTPTS",
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `fps=${plan.fps}`,
      `zoompan=z='${zoomExpr(clip, plan.fps)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${plan.fps}`,
      ...captionFilters(clip, font, plan.captionStyle),
      "setsar=1",
    ];
    parts.push(`[${i}:v]${v.join(",")}[v${i}]`);
    if (r.hasAudio[i]) {
      parts.push(`[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
    } else {
      parts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${sec(clip.durationMs)}[a${i}]`);
    }
    concatIn.push(`[v${i}][a${i}]`);
  });

  const total = plan.totalMs;
  parts.push(`${concatIn.join("")}concat=n=${plan.clips.length}:v=1:a=1[vc][ac]`);
  parts.push(
    `[vc]drawtext=fontfile='${font}':text='${escapeDrawtext(plan.signature)}':fontsize=44:fontcolor=white@0.9:shadowcolor=0x000000@0.6:shadowx=2:shadowy=2` +
      `:x=(w-text_w)/2:y=h*0.86:enable='gte(t\\,${sec(Math.max(0, total - SIGNATURE_MS))})'[vout]`,
  );
  parts.push("[ac]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]");

  return [
    "-y", "-hide_banner", "-loglevel", "error",
    ...r.inputs.flatMap((p) => ["-i", p]),
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(plan.fps),
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    r.output,
  ];
}
