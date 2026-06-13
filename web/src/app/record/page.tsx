'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStudio } from '@/store/useStudioStore';
import { buildTimeline, drawFrame } from '@/lib/chatEngine';
import { downloadBlob } from '@/lib/exporter';
import { api } from '@/lib/api';

export default function RecordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white/50">Carregando…</div>}>
      <RecordInner />
    </Suspense>
  );
}

type Phase = 'idle' | 'count' | 'recording' | 'paused' | 'done';

function RecordInner() {
  const sp = useSearchParams();
  const reaction = sp.get('mode') === 'reaction';
  const { story, settings } = useStudio();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef<number>();
  const camStreamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);

  const [useCam, setUseCam] = useState(!reaction ? false : true);
  const [promptSpeed, setPromptSpeed] = useState(40); // px/s
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(3);
  const [result, setResult] = useState<{ webm: Blob; mp4Url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const W = 1080, H = 1920;

  // setup camera/mic
  async function ensureMedia() {
    if (camStreamRef.current) return camStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: useCam ? { facingMode: 'user', width: 720, height: 720 } : false,
      audio: true,
    });
    camStreamRef.current = stream;
    if (camVideoRef.current && useCam) {
      camVideoRef.current.srcObject = stream;
      await camVideoRef.current.play().catch(() => {});
    }
    return stream;
  }

  useEffect(() => () => stopAll(), []); // cleanup on unmount

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
  }

  async function start() {
    if (!story) return;
    setError(null);
    try {
      const stream = await ensureMedia();
      // countdown
      setPhase('count');
      for (let c = 3; c >= 1; c--) { setCount(c); await wait(700); }

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const timeline = buildTimeline(story, settings);

      // compose canvas video + mic audio
      const canvasStream = canvas.captureStream(30);
      const mixed = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...stream.getAudioTracks(),
      ]);
      const rec = new MediaRecorder(mixed, { mimeType: pickMime(), videoBitsPerSecond: 8_000_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const webm = new Blob(chunksRef.current, { type: rec.mimeType });
        let mp4Url: string | undefined;
        try { mp4Url = (await api.render(webm, settings.format)).url; } catch {}
        setResult({ webm, mp4Url });
        setPhase('done');
      };
      recorderRef.current = rec;

      startTimeRef.current = performance.now();
      elapsedRef.current = 0;
      rec.start();
      setPhase('recording');

      const cam = camVideoRef.current;
      function loop(now: number) {
        const t = elapsedRef.current + (now - startTimeRef.current) / 1000;
        ctx.clearRect(0, 0, W, H);
        drawFrame(ctx, t, { story: story!, timeline, settings, W, H });
        // draw camera overlay
        if (useCam && cam && cam.readyState >= 2) drawCam(ctx, cam, W, H, reaction);
        // auto-scroll teleprompter
        if (promptRef.current) promptRef.current.scrollTop = t * promptSpeed;
        rafRef.current = requestAnimationFrame(loop);
      }
      rafRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      setError('Não foi possível acessar câmera/microfone: ' + e.message);
      setPhase('idle');
    }
  }

  function pause() {
    recorderRef.current?.pause();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    elapsedRef.current += (performance.now() - startTimeRef.current) / 1000;
    setPhase('paused');
  }
  function resume() {
    recorderRef.current?.resume();
    startTimeRef.current = performance.now();
    setPhase('recording');
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const timeline = buildTimeline(story!, settings);
    const cam = camVideoRef.current;
    function loop(now: number) {
      const t = elapsedRef.current + (now - startTimeRef.current) / 1000;
      ctx.clearRect(0, 0, W, H);
      drawFrame(ctx, t, { story: story!, timeline, settings, W, H });
      if (useCam && cam && cam.readyState >= 2) drawCam(ctx, cam, W, H, reaction);
      if (promptRef.current) promptRef.current.scrollTop = t * promptSpeed;
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
  }
  function finish() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    recorderRef.current?.stop();
  }
  function retake() {
    setResult(null); setPhase('idle'); elapsedRef.current = 0;
  }

  if (!story) {
    return <div className="py-20 text-center text-white/60">Crie ou abra um projeto primeiro.</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{reaction ? '🤳 Modo Reação' : '🎙️ Modo Eu Narrando'}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* live composite canvas */}
        <div className="relative mx-auto">
          <div className="relative overflow-hidden rounded-[2rem] border-4 border-black/70 shadow-2xl">
            <canvas ref={canvasRef} width={W} height={H} className="block h-[70vh] max-h-[640px] w-auto bg-black" />
            {phase === 'count' && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-8xl font-extrabold">{count}</div>
            )}
            <video ref={camVideoRef} muted playsInline className="hidden" />
          </div>
        </div>

        {/* controls + teleprompter */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={useCam} disabled={phase === 'recording'}
                onChange={(e) => setUseCam(e.target.checked)} className="accent-[#7C3AED]" /> Usar câmera
            </label>
            <label className="block text-sm text-white/70">Velocidade do teleprompter: {promptSpeed}px/s
              <input type="range" min={10} max={120} value={promptSpeed} onChange={(e) => setPromptSpeed(+e.target.value)} className="w-full accent-[#7C3AED]" />
            </label>
            <div className="flex flex-wrap gap-2">
              {(phase === 'idle' || phase === 'done') && <button className="btn-primary" onClick={start}>● Gravar</button>}
              {phase === 'recording' && <button className="btn-ghost" onClick={pause}>⏸ Pausar</button>}
              {phase === 'paused' && <button className="btn-primary" onClick={resume}>▶ Continuar</button>}
              {(phase === 'recording' || phase === 'paused') && <button className="btn-ghost text-red-300" onClick={finish}>⏹ Finalizar</button>}
              {phase === 'done' && <button className="btn-ghost" onClick={retake}>↺ Refazer</button>}
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>

          {/* teleprompter */}
          <div className="card">
            <span className="label">Teleprompter</span>
            <div ref={promptRef} className="h-64 overflow-hidden rounded-xl bg-black/40 p-4 text-2xl font-semibold leading-relaxed text-white/90">
              <div className="pb-64 pt-20 text-center">
                {(story.narration || story.messages.map((m) => m.text).join('  ·  '))
                  .split(/(?<=[.!?])\s+/).map((line, i) => (
                    <p key={i} className="mb-4">{line}</p>
                  ))}
              </div>
            </div>
          </div>

          {result && (
            <div className="card space-y-2">
              <p className="font-semibold text-emerald-400">✓ Tomada gravada!</p>
              {result.mp4Url
                ? <><video src={result.mp4Url} controls className="mx-auto max-h-[40vh] rounded-xl" /><a className="btn-primary w-full" href={result.mp4Url} download>⬇️ Baixar MP4</a></>
                : <button className="btn-primary w-full" onClick={() => downloadBlob(result.webm, 'narracao.webm')}>⬇️ Baixar WebM</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function drawCam(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number, reaction: boolean) {
  if (reaction) {
    // camera occupies top third, full width
    const h = H * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, h);
    ctx.clip();
    coverDraw(ctx, video, 0, 0, W, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, h);
  } else {
    // small bubble top-right
    const r = W * 0.16, cx = W - r - 40, cy = r + 180;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    coverDraw(ctx, video, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#25D366';
    ctx.stroke();
  }
}

// object-fit: cover for video into a rect
function coverDraw(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number) {
  const vr = v.videoWidth / v.videoHeight, dr = dw / dh;
  let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
  if (vr > dr) { sw = sh * dr; sx = (v.videoWidth - sw) / 2; }
  else { sh = sw / dr; sy = (v.videoHeight - sh) / 2; }
  ctx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh);
}

function pickMime() {
  const prefs = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of prefs) if (MediaRecorder.isTypeSupported(m)) return m;
  return 'video/webm';
}
function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
