// Exportação de MP4 100% no navegador via ffmpeg.wasm — NÃO usa MediaRecorder
// (que falha em vídeo longo / aba em background). Captura frames + renderiza o
// áudio offline e monta o MP4 (H.264 + AAC) com ffmpeg.
import type { Story, ExportSettings } from './types';
import { buildTimeline, drawFrame, preloadImages } from './chatEngine';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const FORMAT_DIMS: Record<string, { W: number; H: number }> = {
  '1080x1920': { W: 1080, H: 1920 },
  '720x1280': { W: 720, H: 1280 },
  '2160x3840': { W: 2160, H: 3840 },
};

let _ffmpeg: FFmpeg | null = null;
async function getFfmpeg(onLog?: (m: string) => void): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  const ff = new FFmpeg();
  if (onLog) ff.on('log', ({ message }) => onLog(message));
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  _ffmpeg = ff;
  return ff;
}

function joinBuffers(ctx: BaseAudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (!buffers.length) return null;
  const channels = buffers[0].numberOfChannels;
  const rate = buffers[0].sampleRate;
  const total = buffers.reduce((a, b) => a + b.length, 0);
  const out = ctx.createBuffer(channels, total, rate);
  for (let c = 0; c < channels; c++) {
    const data = out.getChannelData(c);
    let off = 0;
    for (const b of buffers) { data.set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), off); off += b.length; }
  }
  return out;
}

function audioBufferToWav(buf: AudioBuffer): Uint8Array {
  const numCh = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate;
  const ab = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(ab);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); view.setUint32(4, 36 + len * numCh * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true); wr(36, 'data');
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) {
    const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return new Uint8Array(ab);
}

// renderiza o áudio (narrador OU vozes por msg) offline → AudioBuffer mixado.
// Compartilhado entre o exportador ffmpeg (→ WAV) e o WebCodecs (→ AAC).
export async function renderMixedAudio(
  story: Story, settings: ExportSettings, audioBuffers: Map<string, AudioBuffer>,
  narratorBuffers: AudioBuffer[], durationSec: number,
): Promise<AudioBuffer | null> {
  const narratorOn = !!(settings.withNarrator && narratorBuffers.length);
  const hasMsgAudio = audioBuffers.size > 0;
  if (!narratorOn && !hasMsgAudio) return null; // sem áudio → vídeo mudo
  const rate = 44100;
  const oac = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    2, Math.max(1, Math.ceil(durationSec * rate)), rate);
  const gainVal = settings.narrationVolume ?? 1;
  if (narratorOn) {
    const one = joinBuffers(oac, narratorBuffers);
    if (one) { const s = oac.createBufferSource(); s.buffer = one; const g = oac.createGain(); g.gain.value = gainVal; s.connect(g).connect(oac.destination); s.start(0.25); }
  } else {
    const tl = buildTimeline(story, settings);
    for (const it of tl.items) {
      const b = audioBuffers.get(it.msg.id); if (!b) continue;
      const s = oac.createBufferSource(); s.buffer = b; const g = oac.createGain(); g.gain.value = gainVal;
      s.connect(g).connect(oac.destination); s.start(Math.min(durationSec - 0.01, it.speakStart));
    }
  }
  return oac.startRendering();
}

// renderiza o áudio offline → WAV (usado pelo ffmpeg)
async function renderWav(
  story: Story, settings: ExportSettings, audioBuffers: Map<string, AudioBuffer>,
  narratorBuffers: AudioBuffer[], durationSec: number,
): Promise<Uint8Array | null> {
  const rendered = await renderMixedAudio(story, settings, audioBuffers, narratorBuffers, durationSec);
  return rendered ? audioBufferToWav(rendered) : null;
}

export async function exportMp4(
  story: Story, settings: ExportSettings, audioBuffers: Map<string, AudioBuffer>,
  opts: { narratorBuffers?: AudioBuffer[]; onProgress?: (p: number) => void; onStage?: (s: string) => void } = {},
): Promise<Blob> {
  const { W, H } = FORMAT_DIMS[settings.format] || FORMAT_DIMS['1080x1920'];
  const fps = 20;
  const narratorBuffers = opts.narratorBuffers || [];
  const narratorOn = !!(settings.withNarrator && narratorBuffers.length);
  const timeline = buildTimeline(story, settings);
  const narratorTotal = narratorOn ? narratorBuffers.reduce((a, b) => a + b.duration, 0) : 0;
  const duration = Math.min(150, Math.max(timeline.duration, narratorOn ? narratorTotal + 0.8 : 0));
  const totalFrames = Math.max(1, Math.ceil(duration * fps));

  opts.onStage?.('Carregando o motor de vídeo (1ª vez baixa ~25MB)…');
  const ff = await getFfmpeg();
  await preloadImages(story).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const drawData = { story, timeline, settings, W, H } as any;

  // 1) captura frames como JPEG e grava no FS do ffmpeg
  opts.onStage?.('Desenhando os quadros…');
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    ctx.clearRect(0, 0, W, H);
    try { drawFrame(ctx, t, drawData); } catch { /* noop */ }
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.82));
    if (blob) await ff.writeFile(`f${String(i).padStart(5, '0')}.jpg`, new Uint8Array(await blob.arrayBuffer()));
    opts.onProgress?.((i / totalFrames) * 0.7);
  }

  // 2) áudio renderizado offline → WAV
  opts.onStage?.('Renderizando o áudio…');
  const wav = await renderWav(story, settings, audioBuffers, narratorBuffers, duration).catch(() => null);
  const args = ['-framerate', String(fps), '-i', 'f%05d.jpg'];
  if (wav) { await ff.writeFile('a.wav', wav); args.push('-i', 'a.wav'); }
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(fps));
  if (wav) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push('out.mp4');

  // 3) monta o MP4
  opts.onStage?.('Montando o MP4…');
  ff.on('progress', ({ progress }) => opts.onProgress?.(0.7 + Math.min(0.29, Math.max(0, progress) * 0.29)));
  await ff.exec(args);
  const data = await ff.readFile('out.mp4');
  // limpa o FS
  for (let i = 0; i < totalFrames; i++) { try { await ff.deleteFile(`f${String(i).padStart(5, '0')}.jpg`); } catch {} }
  try { await ff.deleteFile('a.wav'); } catch {}
  try { await ff.deleteFile('out.mp4'); } catch {}
  opts.onProgress?.(1);
  const bytes = data as Uint8Array;
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
