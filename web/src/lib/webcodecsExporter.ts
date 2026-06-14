// Exportação de MP4 via WebCodecs — usa o encoder H.264 ACELERADO POR HARDWARE
// do navegador (VideoEncoder) + AAC (AudioEncoder), empacotado com mp4-muxer.
// É 10-20× mais rápido que o ffmpeg.wasm (libx264 em software), que vira fallback.
import type { Story, ExportSettings } from './types';
import { buildTimeline, scaleTimeline, drawFrame, preloadImages } from './chatEngine';
import { renderMixedAudio } from './ffmpegExporter';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const FORMAT_DIMS: Record<string, { W: number; H: number }> = {
  '1080x1920': { W: 1080, H: 1920 },
  '720x1280': { W: 720, H: 1280 },
  '2160x3840': { W: 2160, H: 3840 },
};

// candidatos de codec H.264 (do mais capaz pro mais compatível)
const AVC_CODECS = ['avc1.640034', 'avc1.64002a', 'avc1.4d0034', 'avc1.42e01f', 'avc1.42001f'];

// O navegador suporta o caminho rápido (WebCodecs + H.264)?
export async function webCodecsSupported(format = '1080x1920'): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    if (!('VideoEncoder' in window) || !('VideoFrame' in window)) return false;
    const { W, H } = FORMAT_DIMS[format] || FORMAT_DIMS['1080x1920'];
    for (const codec of AVC_CODECS) {
      const r = await (window as any).VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 6_000_000, framerate: 30 });
      if (r?.supported) return true;
    }
    return false;
  } catch { return false; }
}

async function pickCodec(W: number, H: number, fps: number, bitrate: number): Promise<string | null> {
  for (const codec of AVC_CODECS) {
    try {
      const r = await (window as any).VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate, framerate: fps });
      if (r?.supported) return codec;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// espera a fila do encoder esvaziar pra não estourar a memória com vídeo longo
function drain(enc: { encodeQueueSize: number }, max = 8): Promise<void> {
  if (enc.encodeQueueSize <= max) return Promise.resolve();
  return new Promise((res) => {
    const tick = () => { if (enc.encodeQueueSize <= max) res(); else setTimeout(tick, 4); };
    tick();
  });
}

export async function exportMp4WebCodecs(
  story: Story, settings: ExportSettings, audioBuffers: Map<string, AudioBuffer>,
  opts: { narratorBuffers?: AudioBuffer[]; onProgress?: (p: number) => void; onStage?: (s: string) => void } = {},
): Promise<Blob> {
  const { W, H } = FORMAT_DIMS[settings.format] || FORMAT_DIMS['1080x1920'];
  const fps = 30;
  const narratorBuffers = opts.narratorBuffers || [];
  const narratorOn = !!(settings.withNarrator && narratorBuffers.length);
  const narratorTotal = narratorOn ? narratorBuffers.reduce((a, b) => a + b.duration, 0) : 0;
  // modo locutor: o vídeo dura o que a narração dura (que segue a duração-alvo),
  // e as mensagens são espalhadas ao longo dela.
  let timeline = buildTimeline(story, settings);
  if (narratorOn && narratorTotal > 0) timeline = scaleTimeline(timeline, narratorTotal + 0.8);
  const duration = Math.min(150, narratorOn ? narratorTotal + 0.8 : timeline.duration);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  // bitrate proporcional à área (≈ 8 Mbps em 1080×1920)
  const bitrate = Math.round((W * H) / (1080 * 1920) * 8_000_000);

  const codec = await pickCodec(W, H, fps, bitrate);
  if (!codec) throw new Error('WebCodecs/H.264 não suportado neste navegador');

  opts.onStage?.('Preparando…');
  await preloadImages(story).catch(() => {});

  // áudio mixado offline (mesmo render do ffmpeg) → encode AAC se houver
  opts.onStage?.('Renderizando o áudio…');
  const audio = await renderMixedAudio(story, settings, audioBuffers, narratorBuffers, duration).catch(() => null);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: audio ? { codec: 'aac', numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encErr: any = null;
  const videoEncoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => { encErr = e; },
  });
  videoEncoder.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const drawData = { story, timeline, settings, W, H } as any;
  const frameDur = 1e6 / fps; // microssegundos
  const keyInt = fps * 2; // keyframe a cada 2s

  opts.onStage?.('Desenhando e codificando os quadros…');
  for (let i = 0; i < totalFrames; i++) {
    if (encErr) throw encErr;
    const t = i / fps;
    ctx.clearRect(0, 0, W, H);
    try { drawFrame(ctx, t, drawData); } catch { /* noop */ }
    const frame = new (window as any).VideoFrame(canvas, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
    videoEncoder.encode(frame, { keyFrame: i % keyInt === 0 });
    frame.close();
    await drain(videoEncoder);
    if ((i & 7) === 0) opts.onProgress?.((i / totalFrames) * 0.9);
  }
  await videoEncoder.flush();
  if (encErr) throw encErr;

  // áudio → AAC em blocos de ~1s
  if (audio) {
    opts.onStage?.('Codificando o áudio…');
    let audioErr: any = null;
    const audioEncoder = new (window as any).AudioEncoder({
      output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
      error: (e: any) => { audioErr = e; },
    });
    const ch = audio.numberOfChannels, rate = audio.sampleRate;
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: ch, bitrate: 128_000 });
    const chunkFrames = rate; // 1 segundo por chunk
    const planar = new Float32Array(chunkFrames * ch);
    for (let start = 0; start < audio.length; start += chunkFrames) {
      const n = Math.min(chunkFrames, audio.length - start);
      const data = n === chunkFrames ? planar : new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) {
        const src = audio.getChannelData(c);
        data.set(src.subarray(start, start + n), c * n);
      }
      audioEncoder.encode(new (window as any).AudioData({
        format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: ch,
        timestamp: Math.round((start / rate) * 1e6), data: data.slice(0, n * ch),
      }));
      if (audioErr) throw audioErr;
    }
    await audioEncoder.flush();
    if (audioErr) throw audioErr;
  }

  opts.onStage?.('Montando o MP4…');
  muxer.finalize();
  opts.onProgress?.(1);
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: 'video/mp4' });
}
