'use client';
import { useEffect, useRef, useState } from 'react';
import type { Story, ExportSettings } from '@/lib/types';
import { buildTimeline, drawFrame, type DrawCtx } from '@/lib/chatEngine';
import { startCamera, stopCamera, getCameraEl } from '@/lib/camera';

interface Props {
  story: Story;
  settings: ExportSettings;
  className?: string;
  autoPlay?: boolean;
}

// Live animated preview rendered with the SAME drawFrame used by the exporter.
export function ChatStage({ story, settings, className, autoPlay = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const startRef = useRef<number>(0);
  const pausedAt = useRef<number>(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [t, setT] = useState(0);

  const W = 540, H = 960; // preview resolution (9:16, half of 1080x1920)
  const timeline = buildTimeline(story, settings);
  const drawData: DrawCtx = { story, timeline, settings, W, H };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function loop(now: number) {
      if (!startRef.current) startRef.current = now - pausedAt.current * 1000;
      const time = (now - startRef.current) / 1000;
      drawData.cameraVideo = settings.withCamera ? getCameraEl() : null;
      ctx.clearRect(0, 0, W, H);
      drawFrame(ctx, time, drawData);
      setT(time);
      if (time >= timeline.duration) {
        setPlaying(false);
        pausedAt.current = 0;
        startRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    if (playing) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      // draw a static frame at current time
      drawData.cameraVideo = settings.withCamera ? getCameraEl() : null;
      ctx.clearRect(0, 0, W, H);
      drawFrame(ctx, pausedAt.current, drawData);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, story, settings]);

  // start/stop the shared webcam when "mostrar meu rosto" toggles
  useEffect(() => {
    let cancelled = false;
    if (settings.withCamera) {
      startCamera().catch((e) => { if (!cancelled) alert('Não consegui acessar a câmera: ' + e.message); });
    } else {
      stopCamera();
    }
    return () => { cancelled = true; };
  }, [settings.withCamera]);

  // stop the camera when leaving the preview entirely
  useEffect(() => () => stopCamera(), []);

  const toggle = () => {
    if (playing) {
      pausedAt.current = t;
      startRef.current = 0;
      setPlaying(false);
    } else {
      if (t >= timeline.duration) pausedAt.current = 0;
      startRef.current = 0;
      setPlaying(true);
    }
  };

  const restart = () => { pausedAt.current = 0; startRef.current = 0; setT(0); setPlaying(true); };

  return (
    <div className={className}>
      <div className="relative mx-auto w-fit overflow-hidden rounded-[2rem] border-4 border-black/70 shadow-2xl">
        <canvas ref={canvasRef} width={W} height={H}
          className="block h-[70vh] max-h-[640px] w-auto bg-black" onClick={toggle} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button className="btn-ghost" onClick={toggle}>{playing ? '⏸ Pausar' : '▶ Reproduzir'}</button>
        <button className="btn-ghost" onClick={restart}>↺ Reiniciar</button>
        <span className="text-sm text-white/50">{t.toFixed(1)}s / {timeline.duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}
