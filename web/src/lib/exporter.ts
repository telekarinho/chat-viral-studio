// Renders the Story to a WebM in the browser (Canvas + MediaRecorder), mixing
// the narration audio at the right timestamps, then ships it to the backend to
// transcode to MP4. Works fully client-side up to the MP4 step.

import type { Story, ExportSettings } from './types';
import { buildTimeline, drawFrame, type DrawCtx } from './chatEngine';
import { api } from './api';

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
  opts: { transcode?: boolean; onProgress?: (p: number) => void } = {},
): Promise<ExportResult> {
  const { W, H } = FORMAT_DIMS[settings.format] || FORMAT_DIMS['1080x1920'];
  const fps = 30;
  const timeline = buildTimeline(story, settings);
  const durationMs = Math.ceil(timeline.duration * 1000);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const drawData: DrawCtx = { story, timeline, settings, W, H };

  // ── audio graph ──
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  // schedule each message's narration at its speakStart
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
  // optional background music (looped, low volume) — uses a soft synth pad if no file
  if (settings.withMusic) addAmbientPad(audioCtx, dest, settings.musicVolume ?? 0.15, timeline.duration);

  // ── combine streams ──
  const videoStream = canvas.captureStream(fps);
  const mixed = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mime = pickMime();
  const recorder = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  recorder.start();

  // ── drive the animation in real time ──
  const start = performance.now();
  await new Promise<void>((resolve) => {
    function frame(now: number) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      drawFrame(ctx, t, drawData);
      opts.onProgress?.(Math.min(1, t / timeline.duration));
      if (t >= timeline.duration) return resolve();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await stopped;
  await audioCtx.close().catch(() => {});
  const webm = new Blob(chunks, { type: mime });

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

function pickMime(): string {
  const prefs = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of prefs) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return 'video/webm';
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
