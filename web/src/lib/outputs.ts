// Non-video exports: roteiro (script), legenda SRT, thumbnail.
import type { Story, ExportSettings } from './types';
import { buildTimeline, drawFrame } from './chatEngine';
import { THEMES } from './themes';

export function buildScript(story: Story): string {
  const lines: string[] = [];
  lines.push(`# ${story.title}`, '', `GANCHO: ${story.hook}`, '');
  lines.push('## Conversa');
  for (const m of story.messages) {
    const c = story.characters.find((c) => c.id === m.sender);
    lines.push(`[${m.time}] ${c?.name || m.sender}: ${m.text}`);
  }
  lines.push('', '## Narração', story.narration, '');
  lines.push('## Legenda', story.caption, '');
  lines.push('## Hashtags', story.hashtags.join(' '), '');
  lines.push('## Gancho Parte 2', story.part2_hook, '');
  lines.push('---', 'História fictícia para entretenimento.');
  return lines.join('\n');
}

export function buildSRT(story: Story, settings: ExportSettings): string {
  const { items } = buildTimeline(story, settings);
  return items
    .filter((it) => it.msg.text && it.msg.type !== 'system')
    .map((it, i) => {
      return `${i + 1}\n${srtTime(it.speakStart)} --> ${srtTime(it.speakEnd)}\n${it.msg.text}\n`;
    })
    .join('\n');
}

function srtTime(s: number): string {
  const ms = Math.floor((s % 1) * 1000);
  const total = Math.floor(s);
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`;
}

// Render a vertical thumbnail: chat snapshot + big viral headline.
export function buildThumbnail(story: Story, settings: ExportSettings, headline?: string): string {
  const W = 720, H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const timeline = buildTimeline(story, settings);
  // draw a frame near the climax (~75%)
  const t = timeline.duration * 0.7;
  drawFrame(ctx, t, { story, timeline, settings, W, H });

  // headline band
  const text = (headline || story.hook || story.title || 'OLHA O FINAL').toUpperCase();
  const theme = THEMES[story.theme] || THEMES.verde;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H * 0.62, W, H * 0.18);
  ctx.fillStyle = '#FFE600';
  ctx.font = `bold 64px system-ui`;
  ctx.textAlign = 'center';
  wrapDraw(ctx, text, W / 2, H * 0.7, W * 0.86, 66);
  // red arrow accent
  ctx.fillStyle = '#FF2D55';
  ctx.beginPath();
  ctx.moveTo(W - 120, H * 0.55);
  ctx.lineTo(W - 60, H * 0.55);
  ctx.lineTo(W - 90, H * 0.6);
  ctx.fill();
  return canvas.toDataURL('image/png');
}

function wrapDraw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

export function downloadText(text: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
