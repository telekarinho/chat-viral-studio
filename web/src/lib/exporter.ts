// Renders the Story to a WebM in the browser (Canvas + MediaRecorder), mixing
// the narration audio at the right timestamps, then ships it to the backend to
// transcode to MP4. Works fully client-side up to the MP4 step.

import type { Story, ExportSettings } from './types';
import { buildTimeline, drawFrame, preloadImages, type DrawCtx } from './chatEngine';
import { api } from './api';
import { startCamera, getCameraEl } from './camera';

export interface ExportResult {
  webm: Blob;
  mp4Url?: string;
  durationMs: number;
}

const FORMAT_DIMS: Record<string, { W: number; H: number }> = {
  '1080x1920': { W: 1080, H: 1920 },
  '720x1280': { W: 720, H: 1280 },
  '2160x3840': { W: 2160, H: 3840 },
};

export async function exportVideo(
  story: Story,
  settings: ExportSettings,
  audioBuffers: Map<string, AudioBuffer>,
  opts: { transcode?: boolean; onProgress?: (p: number) => void; narratorBuffers?: AudioBuffer[] } = {},
): Promise<ExportResult> {
  const { W, H } = FORMAT_DIMS[settings.format] || FORMAT_DIMS['1080x1920'];
  const fps = 30;
  const timeline = buildTimeline(story, settings);
  // modo narrador: o vídeo precisa durar o tempo da locução (pode ser maior que o chat)
  const narratorOn = !!(settings.withNarrator && opts.narratorBuffers?.length);
  const narratorTotal = narratorOn ? opts.narratorBuffers!.reduce((a, b) => a + b.duration, 0) : 0;
  const videoDuration = Math.max(timeline.duration, narratorOn ? narratorTotal + 0.8 : 0);
  const durationMs = Math.ceil(videoDuration * 1000);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const drawData: DrawCtx = { story, timeline, settings, W, H };

  // AudioContext criado JÁ (ainda dentro do gesto do clique) e retomado — se nascer
  // "suspended" (por causa dos awaits abaixo), a faixa de áudio fica sem dados e
  // TRAVA o gravador, gerando vídeo vazio. Por isso resume() aqui.
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();

  // ensure the webcam is live before recording, if the reaction overlay is on
  if (settings.withCamera) {
    try { await startCamera(); } catch { /* segue sem câmera se negar permissão */ }
  }
  // pré-carrega fotos anexadas pra aparecerem desde o 1º frame
  await preloadImages(story).catch(() => {});
  await audioCtx.resume().catch(() => {});

  // ── combine streams ──
  // desenha 1 frame antes de capturar (garante que a faixa de vídeo inicialize)
  try { drawFrame(ctx, 0, drawData); } catch { /* noop */ }
  const videoStream = canvas.captureStream(fps);
  // segurança: só inclui a faixa de áudio se o contexto está rodando — uma faixa de
  // áudio "suspensa" trava o muxer e gera vídeo vazio. Pior caso: vídeo sem áudio.
  const audioTracks = audioCtx.state === 'running' ? dest.stream.getAudioTracks() : [];
  const mixed = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks]);

  const mime = pickMime(audioTracks.length > 0);
  const recorder = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onerror = (e: any) => console.warn('MediaRecorder error', e?.error || e);

  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  recorder.start(1000); // timeslice: descarrega dados a cada 1s (não perde tudo se algo falhar)

  // ── áudio: agenda agora, junto do início da gravação (mantém sincronia) ──
  if (narratorOn) {
    // locutor narra tudo: 1 único bloco concatenado, tocado do início
    const one = concatBuffers(audioCtx, opts.narratorBuffers!);
    if (one) {
      const src = audioCtx.createBufferSource();
      src.buffer = one;
      const gain = audioCtx.createGain();
      gain.gain.value = settings.narrationVolume ?? 1;
      src.connect(gain).connect(dest);
      src.start(audioCtx.currentTime + 0.25);
    }
  } else {
    // vozes por mensagem, agendadas no speakStart de cada bolha
    for (const it of timeline.items) {
      const buf = audioBuffers.get(it.msg.id);
      if (!buf) continue;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const gain = audioCtx.createGain();
      gain.gain.value = settings.narrationVolume ?? 1;
      src.connect(gain).connect(dest);
      src.start(audioCtx.currentTime + it.speakStart);
    }
  }
  // optional background music (looped, low volume) — uses a soft synth pad if no file
  if (settings.withMusic) addAmbientPad(audioCtx, dest, settings.musicVolume ?? 0.15, videoDuration);

  // ── drive the animation in real time ──
  const start = performance.now();
  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const t = (now - start) / 1000;
      drawData.cameraVideo = settings.withCamera ? getCameraEl() : null;
      ctx.clearRect(0, 0, W, H);
      try { drawFrame(ctx, t, drawData); } catch (err) { console.warn('frame error', err); }
      opts.onProgress?.(Math.min(1, t / videoDuration));
      if (t >= videoDuration) return resolve();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await stopped;
  await audioCtx.close().catch(() => {});
  const webm = new Blob(chunks, { type: mime });
  if (webm.size < 2000) {
    throw new Error('A renderização saiu vazia. Mantenha esta aba ABERTA e visível durante a exportação (não troque de aba/minimize) e tente de novo.');
  }

  let mp4Url: string | undefined;
  if (opts.transcode !== false) {
    try {
      const r = await api.render(webm, settings.format);
      mp4Url = r.url;
    } catch (e) {
      console.warn('MP4 transcode failed, returning WebM only:', e);
    }
  }
  return { webm, mp4Url, durationMs };
}

function pickMime(hasAudio: boolean): string {
  const prefs = hasAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of prefs) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return 'video/webm';
}

// junta os blocos da narração num único AudioBuffer (1 source só — menos chance de
// glitch/stall no gravador do que dezenas de sources agendados).
function concatBuffers(ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (!buffers.length) return null;
  const channels = Math.max(1, ...buffers.map((b) => b.numberOfChannels));
  const rate = buffers[0].sampleRate;
  const total = buffers.reduce((a, b) => a + b.length, 0);
  const out = ctx.createBuffer(channels, total, rate);
  for (let c = 0; c < channels; c++) {
    const data = out.getChannelData(c);
    let offset = 0;
    for (const b of buffers) {
      const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      data.set(src, offset);
      offset += b.length;
    }
  }
  return out;
}

// Soft ambient pad so "música de fundo" works without shipping audio assets.
function addAmbientPad(ctx: AudioContext, dest: AudioNode, vol: number, dur: number) {
  const gain = ctx.createGain();
  gain.gain.value = vol;
  gain.connect(dest);
  [196, 261.63, 329.63].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.25 / (i + 1);
    osc.connect(g).connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
