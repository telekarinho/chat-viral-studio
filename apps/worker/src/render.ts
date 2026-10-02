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
  /** cenas de apoio baixadas: takeId → arquivo local (só as usadas em plan.clips[].broll) */
  brollFiles?: Record<string, string>;
}

const BROLL_SKIP_S = 0.15; // pula o toque no botão no começo da cena de apoio

/** Expressão select/aselect com os trechos que ficam (tempo do arquivo original, em segundos). */
export function keepExpr(keep: readonly { startMs: number; endMs: number }[]): string {
  return keep.map((k) => `between(t\\,${sec(k.startMs)}\\,${sec(k.endMs)})`).join("+");
}

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

const BEAUTY: Record<"leve" | "forte", { bil: string; lift: string; mix: string }> = {
  // "Natural": tira o excesso de textura e dá uma leve iluminada
  leve: { bil: "sigmaS=6:sigmaR=0.08", lift: "gamma=1.05:brightness=0.015", mix: "0.85" },
  // "Forte (tipo iPhone/WhatsApp)": pele uniforme, poros/manchas/linhas finas suavizados, sombras do rosto clareadas
  forte: { bil: "sigmaS=12:sigmaR=0.11", lift: "gamma=1.09:brightness=0.028:saturation=0.97", mix: "0.80" },
};
// tom médio de pele (a máscara pega de pele clara a morena; o resto da imagem fica intocado)
const SKIN_KEY = "0xC08A70";

/**
 * Embelezamento com MÁSCARA DE PELE: só a pele é alisada/iluminada — olhos, sobrancelha, barba, cabelo e fundo
 * ficam como estão. Parte da textura original volta por cima (sem cara de plástico). Não mexe em formato do rosto
 * e não satura a boca: usa vibrance (reforça só cores apagadas) em vez de saturation.
 * Retorna segmentos do filtergraph: [in] → [out].
 */
export function beautyGraph(inLabel: string, outLabel: string, mode: EditPlan["retouch"] | undefined): string[] {
  if (!mode || mode === "off") return [`[${inLabel}]null[${outLabel}]`];
  const b = BEAUTY[mode];
  const id = outLabel;
  return [
    `[${inLabel}]split=3[${id}t][${id}o][${id}x]`,
    `[${id}t]hqdn3d=3:3:6:6,bilateral=${b.bil}:planes=1,eq=${b.lift}[${id}s]`,
    `[${id}s][${id}x]blend=all_mode=normal:all_opacity=${b.mix}[${id}m]`,
    `[${id}o]format=yuva444p,chromakey=color=${SKIN_KEY}:similarity=0.13:blend=0.10[${id}k]`,
    `[${id}m][${id}k]overlay=format=auto,vibrance=intensity=0.08,unsharp=5:5:0.3:5:5:0,format=yuv420p[${outLabel}]`,
  ];
}

/** zoompan expression: moves from→to over moveMs (0 = whole clip), then holds. */
export function zoomExpr(clip: EditClip, fps: number): string {
  const { fromScale: a, toScale: b, moveMs } = clip.effect;
  const frames = Math.max(1, Math.round(((moveMs > 0 ? Math.min(moveMs, clip.durationMs) : clip.durationMs) / 1000) * fps));
  const base = a === b ? a.toFixed(4) : `${a.toFixed(4)}+(${(b - a).toFixed(4)})*min(on/${frames}\\,1)`;
  return base + jumpCutPunch(clip, fps);
}

const PUNCH = 0.1;

/**
 * Jump cut de editor: a cada corte dentro da parte (pausa/erro removido) o quadro alterna entre normal e mais
 * perto — esconde o "pulo" e dá ritmo. Usa o número do quadro já colado (on), então casa com os cortes.
 */
export function jumpCutPunch(clip: Pick<EditClip, "keep">, fps: number): string {
  const keep = clip.keep ?? [];
  if (keep.length < 2) return "";
  const terms: string[] = [];
  let at = 0;
  keep.forEach((k, i) => {
    const len = Math.round(((k.endMs - k.startMs) / 1000) * fps);
    if (i % 2 === 1 && len > 0) terms.push(`between(on\\,${at}\\,${at + len - 1})`);
    at += len;
  });
  return terms.length ? `+${PUNCH}*(${terms.join("+")})` : "";
}

/** Builds the full ffmpeg argv for one final 9:16 export. Deterministic: same plan + inputs = same command. */
export function ffmpegArgs(r: RenderInput): string[] {
  const { plan } = r;
  if (r.inputs.length !== plan.clips.length) throw new Error("inputs e clips com tamanhos diferentes");
  const W = plan.width;
  const H = plan.height;
  const parts: string[] = [];
  const concatIn: string[] = [];

  const brollOrder = plan.clips.filter((c) => c.broll && r.brollFiles?.[c.broll.takeId]).map((c) => c.broll!.takeId);
  const brollIndex = (takeId: string) => r.inputs.length + brollOrder.indexOf(takeId);
  // voz limpa (leve): corta ronco de vento/carro, reduz ruído de fundo, dá um pouco de clareza e nivela o volume
  const voice = plan.voiceClean ? ",highpass=f=90,afftdn=nr=10:nf=-28,equalizer=f=3200:t=q:w=1.5:g=2,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=160:makeup=1.5" : "";

  plan.clips.forEach((clip, i) => {
    const start = sec(clip.trimStartMs);
    const end = sec(clip.trimStartMs + clip.durationMs);
    const cut = clip.keep?.length ? clip.keep : null;
    const pre = [
      // corte automático (pausas/erros): só os trechos bons do original, colados
      ...(cut ? [`fps=${plan.fps}`, `select='${keepExpr(cut)}'`, `setpts=N/(${plan.fps}*TB)`] : [`trim=start=${start}:end=${end}`, "setpts=PTS-STARTPTS"]),
      // gravado andando: tira o tremido (as bordas espelhadas somem no zoom do enquadramento)
      ...(plan.stabilize ? ["deshake=rx=32:ry=32:edge=mirror"] : []),
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `fps=${plan.fps}`,
    ];
    parts.push(`[${i}:v]${pre.join(",")}[p${i}]`);
    parts.push(...beautyGraph(`p${i}`, `b${i}`, plan.retouch));
    const broll = clip.broll && r.brollFiles?.[clip.broll.takeId] ? clip.broll : null;
    parts.push(`[b${i}]zoompan=z='${zoomExpr(clip, plan.fps)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${plan.fps},setsar=1,format=yuv420p[${broll ? `z${i}` : `v${i}`}]`);
    if (broll) {
      // cena de apoio por cima da imagem; a voz da parte continua
      const at = sec(broll.atMs);
      parts.push(
        `[${brollIndex(broll.takeId)}:v]trim=start=${BROLL_SKIP_S}:duration=${sec(broll.durationMs)},setpts=PTS-STARTPTS+${at}/TB,` +
          `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${plan.fps},setsar=1,format=yuv420p[br${i}]`,
      );
      parts.push(`[z${i}][br${i}]overlay=enable='between(t\\,${at}\\,${sec(broll.atMs + broll.durationMs)})':eof_action=pass,format=yuv420p[v${i}]`);
    }
    if (r.hasAudio[i]) {
      const a = cut ? `aselect='${keepExpr(cut)}',asetpts=N/SR/TB` : `atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`;
      parts.push(`[${i}:a]${a},aresample=48000,aformat=channel_layouts=stereo${voice}[a${i}]`);
    } else {
      parts.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${sec(clip.durationMs)}[a${i}]`);
    }
    concatIn.push(`[v${i}][a${i}]`);
  });

  const total = plan.totalMs;
  const trans = plan.transitions ?? [];
  if (plan.clips.length > 1 && trans.length === plan.clips.length - 1 && trans.every((t) => t.durationMs > 0)) {
    // transições automáticas: xfade (imagem) + acrossfade (som), encadeadas parte a parte
    let vPrev = "v0";
    let aPrev = "a0";
    let elapsed = plan.clips[0]!.durationMs;
    trans.forEach((t, k) => {
      const i = k + 1;
      const last = i === plan.clips.length - 1;
      const vOut = last ? "vcat" : `vx${i}`;
      const aOut = last ? "ac" : `ax${i}`;
      parts.push(`[${vPrev}][v${i}]xfade=transition=${t.kind}:duration=${sec(t.durationMs)}:offset=${sec(elapsed - t.durationMs)}[${vOut}]`);
      parts.push(`[${aPrev}][a${i}]acrossfade=d=${sec(t.durationMs)}:c1=tri:c2=tri[${aOut}]`);
      elapsed += plan.clips[i]!.durationMs - t.durationMs;
      vPrev = vOut;
      aPrev = aOut;
    });
  } else {
    parts.push(`${concatIn.join("")}concat=n=${plan.clips.length}:v=1:a=1[vcat][ac]`);
  }
  // cor de cinema: um pouco mais de contraste e cor, bordas levemente escuras (o olho vai para o rosto)
  parts.push("[vcat]eq=contrast=1.06:gamma=0.98,vibrance=intensity=0.12,vignette=angle=PI/6[vg]");
  // legendas sincronizadas com a fala, gancho e assinatura do perfil (ASS/libass, fonte manuscrita) — tempos globais
  if (r.assFile) {
    parts.push(`[vg]subtitles=filename='${filterPath(r.assFile)}'${r.fontsDir ? `:fontsdir='${filterPath(r.fontsDir)}'` : ""}[vout]`);
  } else {
    parts.push("[vg]null[vout]");
  }
  const withMusic = Boolean(r.musicFile && plan.music);
  if (withMusic) {
    // música por baixo da voz: abaixa sozinha quando há fala (sidechain), entra e sai suave
    const T = total / 1000;
    const vol = Math.min(0.6, Math.max(0.05, plan.music!.volume));
    parts.push(
      `[${r.inputs.length + brollOrder.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${T.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)},` +
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
    ...brollOrder.flatMap((id) => ["-i", r.brollFiles![id]!]),
    ...(withMusic ? ["-stream_loop", "-1", "-i", r.musicFile!] : []),
    "-filter_complex", parts.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(plan.fps),
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    r.output,
  ];
}
