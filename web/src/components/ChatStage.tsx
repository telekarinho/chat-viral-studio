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

// Guia de "zona segura" do TikTok/Reels — só no preview (nunca é exportado).
// Faixas vermelhas = áreas cobertas pela UI do app (topo, base, coluna de botões).
function drawGuide(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const s = W / 1080;
  const topY = H * 0.09;     // status bar / topo do app
  const botY = H * 0.80;     // legenda + botão "mais" + música
  const rightX = W * 0.88;   // coluna de botões (curtir/comentar/salvar)
  ctx.save();
  ctx.fillStyle = 'rgba(255,45,45,0.10)';
  ctx.fillRect(0, 0, W, topY);
  ctx.fillRect(0, botY, W, H - botY);
  ctx.fillRect(rightX, topY, W - rightX, botY - topY);
  ctx.strokeStyle = 'rgba(255,95,95,0.95)';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.setLineDash([12 * s, 9 * s]);
  ctx.beginPath();
  ctx.moveTo(0, topY); ctx.lineTo(W, topY);
  ctx.moveTo(0, botY); ctx.lineTo(W, botY);
  ctx.moveTo(rightX, topY); ctx.lineTo(rightX, botY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,170,170,0.95)';
  ctx.font = `${20 * s}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('⚠ topo cortado', W / 2, topY - 9 * s);
  ctx.fillText('⚠ base cortada (botões / legenda)', W / 2, botY + 30 * s);
  ctx.fillText('botões', rightX + (W - rightX) / 2, topY + 26 * s);
  ctx.restore();
}

// Live animated preview rendered with the SAME drawFrame used by the exporter.
export function ChatStage({ story, settings, className, autoPlay = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const startRef = useRef<number>(0);
  const pausedAt = useRef<number>(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [t, setT] = useState(0);
  const [guide, setGuide] = useState(false);  // guia de zona segura (só no preview, desligado por padrão)

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
      if (guide) drawGuide(ctx, W, H);
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
      if (guide) drawGuide(ctx, W, H);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, story, settings, guide]);

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
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button className="btn-ghost" onClick={toggle}>{playing ? '⏸ Pausar' : '▶ Reproduzir'}</button>
        <button className="btn-ghost" onClick={restart}>↺ Reiniciar</button>
        <button className={`btn-ghost ${guide ? 'text-brand' : 'text-white/50'}`} onClick={() => setGuide((g) => !g)}
          title="Mostra onde a interface do TikTok cobre o vídeo. Não aparece no vídeo exportado.">
          📐 Zona segura {guide ? 'on' : 'off'}
        </button>
        <span className="text-sm text-white/50">{t.toFixed(1)}s / {timeline.duration.toFixed(1)}s</span>
      </div>
      {guide && <p className="mt-1 text-center text-xs text-white/40">As faixas vermelhas mostram onde o TikTok cobre o vídeo — mantenha o conteúdo fora delas. (Só no preview, não sai no arquivo.)</p>}
    </div>
  );
}
