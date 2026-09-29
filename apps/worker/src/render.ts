import type { EditClip, EditPlan } from "@postai/domain";

export interface RenderInput {
  plan: EditPlan;
  /** local path of each clip's original, in plan.clips order */
  inputs: string[];
  /** which inputs have an audio stream (ffprobe) */
  hasAudio: boolean[];
  fontFile: string;
  output: string;
  /** legendas do vídeo inteiro (buildAss) + pasta das fontes (Caveat Brush, Anton) */
  assFile?: string | null;
  fontsDir?: string | null;
  /** faixa de música já baixada e conferida (sha256) */
  musicFile?: string | null;
}

const SIGNATURE_MS = 2000;
const MUSIC_FADE_IN_S = 0.8;
const MUSIC_FADE_OUT_S = 1.5;

/** Caminho dentro de um valor de filtro entre aspas simples (dois-pontos do Windows escapados). */
export function filterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

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

/**
 * "Retoque leve": edge-preserving skin smoothing (softens pores/fine lines, keeps eyes/beard sharp),
 * light denoise and a small lift in light/color. Deliberately subtle — no face reshaping.
 */
export function retouchFilters(mode: EditPlan["retouch"] | undefined): string[] {
  if (mode === "off") return [];
  return ["hqdn3d=1.5:1.5:4:4", "bilateral=sigmaS=3:sigmaR=0.06:planes=1", "eq=brightness=0.02:contrast=1.03:saturation=1.06", "unsharp=5:5:0.3:5:5:0"];
}

/** zoompan expression: moves from→to over moveMs (0 = whole clip), then holds. */
export function zoomExpr(clip: EditClip, fps: number): string {
  const { fromScale: a, toScale: b, moveMs } = clip.effect;
  if (a === b) return a.toFixed(4);
  const frames = Math.max(1, Math.round(((moveMs > 0 ? Math.min(moveMs, clip.durationMs) : clip.durationMs) / 1000) * fps));
  return `${a.toFixed(4)}+(${(b - a).toFixed(4)})*min(on/${frames}\\,1)`;
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
      ...retouchFilters(plan.retouch),
      `zoompan=z='${zoomExpr(clip, plan.fps)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${plan.fps}`,
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
  parts.push(`${concatIn.join("")}concat=n=${plan.clips.length}:v=1:a=1[vcat][ac]`);
  // legendas sincronizadas com a fala (ASS/libass) sobre o vídeo já montado — tempos globais
  if (r.assFile && plan.captionStyle !== "nenhuma") {
    parts.push(`[vcat]subtitles=filename='${filterPath(r.assFile)}'${r.fontsDir ? `:fontsdir='${filterPath(r.fontsDir)}'` : ""}[vc]`);
  } else {
    parts.push("[vcat]null[vc]");
  }
  parts.push(
    `[vc]drawtext=fontfile='${font}':text='${escapeDrawtext(plan.signature)}':fontsize=44:fontcolor=white@0.9:shadowcolor=0x000000@0.6:shadowx=2:shadowy=2` +
      `:x=(w-text_w)/2:y=h*0.86:enable='gte(t\\,${sec(Math.max(0, total - SIGNATURE_MS))})'[vout]`,
  );
  const withMusic = Boolean(r.musicFile && plan.music);
  if (withMusic) {
    // música por baixo da voz: abaixa sozinha quando há fala (sidechain), entra e sai suave
    const T = total / 1000;
    const vol = Math.min(0.6, Math.max(0.05, plan.music!.volume));
    parts.push(
      `[${r.inputs.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${T.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)},` +
        `afade=t=in:d=${MUSIC_FADE_IN_S},afade=t=out:st=${Math.max(0, T - MUSIC_FADE_OUT_S).toFixed(3)}:d=${MUSIC_FADE_OUT_S}[mus]`,
    );
    parts.push("[ac]asplit=2[voice][key]");
    parts.push("[mus][key]sidechaincompress=threshold=0.02:ratio=12:attack=10:release=450[duck]");
    parts.push("[voice][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]");
  } else {
    parts.push("[ac]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]");
  }

  return [
    "-y", "-hide_banner", "-loglevel", "error",
    ...r.inputs.flatMap((p) => ["-i", p]),
    ...(withMusic ? ["-stream_loop", "-1", "-i", r.musicFile!] : []),
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(plan.fps),
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    r.output,
  ];
}
