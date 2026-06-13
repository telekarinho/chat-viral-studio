// Pure canvas renderer for the chat. The SAME drawFrame() powers the live
// preview (requestAnimationFrame) and the export (off-DOM canvas + MediaRecorder),
// so what you see is exactly what you export.

import type { Story, Message, ExportSettings } from './types';
import { THEMES } from './themes';

export interface TimelineItem {
  msg: Message;
  appearAt: number;   // s — when the bubble pops in
  typingAt: number;   // s — when "digitando…" starts (>= appearAt means no typing)
  speakStart: number; // s — when its narration audio should start
  speakEnd: number;   // s
}
export interface Timeline {
  items: TimelineItem[];
  duration: number;   // total seconds (+ tail)
}

const TYPING = 0.9; // seconds of "digitando…" before a received msg

export function buildTimeline(story: Story, settings: ExportSettings): Timeline {
  const speed = settings.messageSpeed || 1;
  let t = 0.6; // small intro
  const items: TimelineItem[] = [];

  for (const msg of story.messages) {
    const incoming = isIncoming(story, msg);
    const delay = Math.max(0.3, (msg.delay || 1) / speed);
    // incoming: "digitando…" no balão; outgoing: tempo p/ "digitar" na barra de input
    const outTyping = clamp(0.5 + (msg.text?.length || 0) * 0.035, 0.6, 2.2);
    const typingDur = msg.type === 'text' ? (incoming ? TYPING : outTyping) / speed : 0;

    const typingAt = t;
    const appearAt = t + typingDur;
    // speaking duration: measured audio, else estimate from text length
    const spoken = msg.audioDuration || estimateRead(msg.text) / speed;
    const speakStart = appearAt + 0.05;
    const speakEnd = speakStart + spoken;

    items.push({ msg, appearAt, typingAt, speakStart, speakEnd });
    t = speakEnd + 0.15; // gap before next
  }

  return { items, duration: t + 1.4 /* tail for the last bubble + seal */ };
}

function isIncoming(story: Story, msg: Message): boolean {
  const c = story.characters.find((c) => c.id === msg.sender);
  return (c?.side ?? 'left') === 'left';
}

function estimateRead(text: string): number {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  return Math.min(6, Math.max(1.1, words / 2.6)); // ~2.6 words/s
}

// ─── Rendering ──────────────────────────────────────────────────

export interface DrawCtx {
  story: Story;
  timeline: Timeline;
  settings: ExportSettings;
  W: number;
  H: number;
  cameraVideo?: CanvasImageSource | null;  // live webcam frame for the reaction overlay
}

export function drawFrame(ctx: CanvasRenderingContext2D, t: number, d: DrawCtx) {
  const { story, timeline, settings, W, H } = d;
  const theme = THEMES[story.theme] || THEMES.verde;
  const s = W / 1080; // scale factor relative to design width

  // background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, W, H, theme.bgPattern, s);

  // dramatic (ken-burns) zoom on the scene — bg stays full-bleed, content scales
  const zoom = settings.dramaticZoom ? 1 + 0.06 * clamp(t / Math.max(timeline.duration, 1), 0, 1) : 1;
  ctx.save();
  if (zoom !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
  }

  const headerH = 150 * s;
  const inputH = 110 * s;
  const padX = 28 * s;
  const top = headerH + 24 * s;
  const bottom = H - inputH - (settings.withCaptions ? 230 * s : 40 * s);
  const areaH = bottom - top;

  // ── lay out visible messages ──
  const visible = timeline.items.filter((it) => t >= it.typingAt);
  type Block = { it: TimelineItem; lines: string[]; bw: number; bh: number; incoming: boolean; typing: boolean; image?: boolean };
  const blocks: Block[] = [];
  ctx.font = `${34 * s}px system-ui, sans-serif`;
  const maxBubble = W * 0.74;

  for (const it of visible) {
    const incoming = isIncoming(story, it.msg);
    const typing = t < it.appearAt; // still in typing phase
    if (it.msg.type === 'system') {
      blocks.push({ it, lines: [it.msg.text], bw: 0, bh: 56 * s, incoming, typing: false });
      continue;
    }
    // mensagem de saída sendo "digitada" aparece na barra de input, não como balão
    if (typing && !incoming) continue;
    // foto enviada — card de imagem (prova visual)
    if (it.msg.type === 'image' && !typing) {
      const iw = Math.min(maxBubble, W * 0.62);
      const capLines = it.msg.text ? wrap(ctx, it.msg.text, iw - 32 * s) : [];
      const bh = iw * 0.74 + (capLines.length ? capLines.length * 38 * s + 14 * s : 0) + 40 * s + (it.msg.reaction ? 22 * s : 0);
      blocks.push({ it, lines: capLines, bw: iw + 20 * s, bh, incoming, typing: false, image: true });
      continue;
    }
    const label = typing ? '•••' : displayText(it.msg);
    const lines = wrap(ctx, label, maxBubble - 48 * s);
    const bw = Math.min(maxBubble, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48 * s);
    const bh = lines.length * 44 * s + 46 * s + (it.msg.reaction ? 22 * s : 0);
    blocks.push({ it, lines, bw, bh, incoming, typing });
  }

  // total height + auto-scroll to bottom
  const gap = 18 * s;
  let totalH = blocks.reduce((a, b) => a + b.bh + gap, 0);
  const scroll = Math.max(0, totalH - areaH);

  let y = top - scroll;
  for (const b of blocks) {
    // entrance animation (slide + fade) for the newest popped bubbles
    const age = t - b.it.appearAt;
    const anim = b.typing ? 1 : clamp(age / 0.22, 0, 1);
    const dy = (1 - anim) * 26 * s;
    const alpha = b.typing ? 0.85 : 0.15 + anim * 0.85;

    if (y + b.bh > top - 60 * s && y < bottom + 60 * s) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawBlock(ctx, b, y + dy, { W, padX, theme, s, settings });
      ctx.restore();
    }
    y += b.bh + gap;
  }

  // header (drawn after bubbles so it overlaps cleanly)
  drawHeader(ctx, story, theme, W, headerH, s);
  // fake input bar — simula você digitando a próxima mensagem de saída letra por letra
  let typingText: string | null = null;
  const composing = timeline.items.find(
    (it) => !isIncoming(story, it.msg) && it.msg.type === 'text' && t >= it.typingAt && t < it.appearAt,
  );
  if (composing) {
    const prog = clamp((t - composing.typingAt) / Math.max(0.001, composing.appearAt - composing.typingAt), 0, 1);
    const full = displayText(composing.msg);
    typingText = full.slice(0, Math.max(1, Math.floor(full.length * prog)));
  }
  drawInputBar(ctx, theme, W, H, inputH, s, typingText, t);
  // progress bar
  drawProgress(ctx, t, timeline.duration, W, headerH, theme, s);

  ctx.restore(); // end dramatic-zoom scope — overlays below stay fixed

  // animated emoji effect overlay (hearts / fire / confetti / sparkles)
  drawEffect(ctx, t, W, H, s, settings.effect);

  // webcam reaction overlay (drawn over everything, fixed corner)
  if (d.cameraVideo) drawCameraOverlay(ctx, d.cameraVideo, W, H, s, settings.cameraCorner || 'br');

  // captions (TikTok style) — current spoken line
  if (settings.withCaptions) {
    const cur = timeline.items.find((it) => t >= it.speakStart && t < it.speakEnd);
    if (cur) drawCaption(ctx, displayText(cur.msg), W, bottom + 60 * s, s);
  }

  // fiction seal + watermark
  // fiction seal — só nos últimos segundos do vídeo (end-card), com fade-in
  if (settings.withFictionSeal) {
    const tail = 3; // últimos 3s
    const start = timeline.duration - tail;
    if (t >= start) {
      const a = clamp((t - start) / 0.5, 0, 1);
      drawSeal(ctx, W, H, s, a);
    }
  }
  if (settings.withWatermark) drawWatermark(ctx, W, H, s, settings.watermarkText);
}

// ── pieces ──

function drawBlock(
  ctx: CanvasRenderingContext2D, b: any, y: number,
  o: { W: number; padX: number; theme: any; s: number; settings: ExportSettings }
) {
  const { W, padX, theme, s } = o;
  const it = b.it as TimelineItem;

  if (it.msg.type === 'system') {
    ctx.font = `${26 * s}px system-ui`;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.textAlign = 'center';
    roundRect(ctx, W / 2 - 200 * s, y, 400 * s, 44 * s, 22 * s);
    ctx.fillStyle = 'rgba(225,245,254,0.9)';
    ctx.fill();
    ctx.fillStyle = '#4a6572';
    ctx.fillText(b.lines[0], W / 2, y + 30 * s);
    ctx.textAlign = 'left';
    return;
  }

  const incoming = b.incoming;
  const x = incoming ? padX : W - padX - b.bw;
  ctx.fillStyle = incoming ? theme.bubbleIn : theme.bubbleOut;
  shadow(ctx, s);
  roundRect(ctx, x, y, b.bw, b.bh, 22 * s, incoming ? 'in' : 'out');
  ctx.fill();
  noShadow(ctx);

  // foto (prova visual) — placeholder com gradiente + ícone + legenda
  if (b.image) {
    const pad = 10 * s;
    const iw = b.bw - pad * 2;
    const ih = iw * 0.74;
    const ix = x + pad, iy = y + pad;
    const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    g.addColorStop(0, '#3a4a5a'); g.addColorStop(1, '#1f2933');
    ctx.fillStyle = g;
    roundRect(ctx, ix, iy, iw, ih, 14 * s);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.font = `${64 * s}px system-ui`;
    ctx.fillText('🖼️', ix + iw / 2, iy + ih / 2 + 8 * s);
    ctx.font = `${20 * s}px system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('Foto', ix + iw / 2, iy + ih - 18 * s);
    // legenda
    ctx.textAlign = 'left';
    ctx.fillStyle = incoming ? theme.bubbleInText : theme.bubbleOutText;
    ctx.font = `${30 * s}px system-ui, sans-serif`;
    let cy = iy + ih + 34 * s;
    for (const line of b.lines) { ctx.fillText(line, ix, cy); cy += 38 * s; }
    return;
  }

  // text
  ctx.fillStyle = incoming ? theme.bubbleInText : theme.bubbleOutText;
  ctx.font = `${(b.typing ? 40 : 34) * s}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  let ty = y + 40 * s;
  for (const line of b.lines) {
    ctx.fillText(line, x + 24 * s, ty);
    ty += 44 * s;
  }

  // time + checks (anchored to the bubble body, above any reaction badge)
  const reaction = it.msg.reaction;
  const bodyBottom = y + b.bh - (reaction ? 22 * s : 0);
  if (!b.typing) {
    ctx.font = `${20 * s}px system-ui`;
    ctx.fillStyle = theme.meta;
    ctx.textAlign = 'right';
    const checks = !incoming ? (it.msg.status === 'read' ? ' ✓✓' : it.msg.status === 'delivered' ? ' ✓✓' : ' ✓') : '';
    ctx.fillText(it.msg.time + checks, x + b.bw - 18 * s, bodyBottom - 16 * s);
    if (!incoming && it.msg.status === 'read') {
      // recolor last checks blue-ish
      ctx.fillStyle = theme.accent;
      ctx.fillText('✓✓', x + b.bw - 18 * s, bodyBottom - 16 * s);
    }
    ctx.textAlign = 'left';
  }

  // emoji reaction stuck on the bubble (WhatsApp style), at the inner bottom corner
  if (reaction) {
    const rx = incoming ? x + b.bw - 14 * s : x + 14 * s;
    const ry = bodyBottom + 2 * s;
    ctx.beginPath();
    ctx.arc(rx, ry, 19 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = Math.max(1, 1 * s);
    ctx.stroke();
    ctx.font = `${22 * s}px system-ui`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reaction, rx, ry + s);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, story: Story, theme: any, W: number, h: number, s: number) {
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, W, h);
  const contact = story.characters.find((c) => c.side === 'left') || story.characters[0];
  // avatar
  const cx = 110 * s, cy = h / 2 + 14 * s, r = 42 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = contact?.avatarColor || theme.accent;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `${40 * s}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText((contact?.name || '?').charAt(0).toUpperCase(), cx, cy + 14 * s);
  // back chevron
  ctx.strokeStyle = theme.headerText;
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(48 * s, cy - 14 * s); ctx.lineTo(30 * s, cy); ctx.lineTo(48 * s, cy + 14 * s);
  ctx.stroke();
  // name + status
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.headerText;
  ctx.font = `bold ${36 * s}px system-ui`;
  ctx.fillText(contact?.name || 'Contato', 175 * s, cy - 6 * s);
  ctx.font = `${24 * s}px system-ui`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(contact?.online ? 'online' : 'visto por último hoje', 175 * s, cy + 28 * s);
  ctx.globalAlpha = 1;
  // call/cam icons (generic circles, no brand)
  ctx.fillStyle = theme.headerText;
  ctx.globalAlpha = 0.9;
  ctx.font = `${34 * s}px system-ui`;
  ctx.textAlign = 'right';
  ctx.fillText('⋮', W - 36 * s, cy + 12 * s);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawInputBar(
  ctx: CanvasRenderingContext2D, theme: any, W: number, H: number, h: number, s: number,
  typingText?: string | null, t = 0,
) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, H - h, W, h);
  // pill
  const pillX = 24 * s, pillW = W - 130 * s;
  ctx.fillStyle = theme.inputBg;
  roundRect(ctx, pillX, H - h + 22 * s, pillW, h - 44 * s, (h - 44 * s) / 2);
  ctx.fill();
  const baseline = H - h / 2 + 10 * s;
  ctx.font = `${28 * s}px system-ui`;
  ctx.textAlign = 'left';
  if (typingText) {
    // texto sendo digitado (cabe na pill) + cursor piscando
    ctx.fillStyle = theme.bubbleInText || '#0b141a';
    const maxTextW = pillW - 72 * s;
    let shown = typingText;
    while (shown.length > 1 && ctx.measureText(shown).width > maxTextW) shown = shown.slice(1);
    if (shown !== typingText) shown = '…' + shown.slice(1);
    const cursor = Math.floor(t * 2) % 2 === 0 ? '|' : '';
    ctx.fillText(shown + cursor, 60 * s, baseline);
  } else {
    ctx.fillStyle = theme.meta;
    ctx.fillText('Mensagem', 60 * s, baseline);
  }
  // send button (mais vivo enquanto digita)
  ctx.beginPath();
  ctx.arc(W - 64 * s, H - h / 2, 40 * s, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = typingText ? 1 : 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = `${34 * s}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText('➤', W - 64 * s, H - h / 2 + 12 * s);
  ctx.textAlign = 'left';
}

function drawProgress(ctx: CanvasRenderingContext2D, t: number, dur: number, W: number, headerH: number, theme: any, s: number) {
  const p = clamp(t / dur, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 0, W, 6 * s);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W * p, 6 * s);
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, y: number, s: number) {
  const t = text.length > 90 ? text.slice(0, 88) + '…' : text;
  ctx.font = `bold ${44 * s}px system-ui`;
  ctx.textAlign = 'center';
  const lines = wrap(ctx, t.toUpperCase(), W * 0.86);
  let ly = y;
  for (const line of lines.slice(0, 2)) {
    const w = ctx.measureText(line).width;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    roundRect(ctx, W / 2 - w / 2 - 18 * s, ly - 40 * s, w + 36 * s, 58 * s, 12 * s);
    ctx.fill();
    ctx.fillStyle = '#FFE600';
    ctx.fillText(line, W / 2, ly);
    ly += 64 * s;
  }
  ctx.textAlign = 'left';
}

function drawSeal(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, alpha = 1) {
  const label = '⚠️ História fictícia para entretenimento';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${26 * s}px system-ui`;
  ctx.textAlign = 'center';
  const w = Math.min(W * 0.9, ctx.measureText(label).width + 48 * s);
  const x = W / 2 - w / 2;
  const y = H * 0.46;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  roundRect(ctx, x, y, w, 64 * s, 16 * s);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, W / 2, y + 40 * s);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, text?: string) {
  ctx.font = `bold ${26 * s}px system-ui`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText((text || 'Chat Viral Studio').slice(0, 40), W - 26 * s, H - 200 * s);
  ctx.textAlign = 'left';
}

const EFFECT_EMOJIS: Record<string, string[]> = {
  hearts: ['❤️', '💕', '💖', '😍'],
  fire: ['🔥', '💥', '🤯'],
  confetti: ['🎉', '🎊', '✨', '⭐'],
  sparkles: ['✨', '⭐', '💫', '🌟'],
};

// Floating emoji particles rising over the whole frame (deterministic by t, so
// preview and export match). Cheap and lively.
function drawEffect(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, s: number, kind?: string) {
  if (!kind || kind === 'none') return;
  const emojis = EFFECT_EMOJIS[kind];
  if (!emojis) return;
  const N = 16;
  const span = H + 160 * s;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    const seed = i * 97.13;
    const x = (Math.sin(seed) * 0.5 + 0.5) * W;
    const speed = 70 + (i % 5) * 28;            // px/s upward
    const yRaw = (H + 80 * s) - (((t * speed + (seed * 37)) % span));
    const sway = Math.sin(t * 1.4 + seed) * 28 * s;
    const size = (34 + (i % 4) * 12) * s;
    ctx.globalAlpha = 0.9;
    ctx.font = `${size}px system-ui`;
    ctx.fillText(emojis[i % emojis.length], x + sway, yRaw);
  }
  ctx.restore();
}

// Circular webcam (selfie, mirrored) pinned to a corner — the "reaction" overlay.
function drawCameraOverlay(
  ctx: CanvasRenderingContext2D, video: CanvasImageSource,
  W: number, H: number, s: number, corner: 'tl' | 'tr' | 'bl' | 'br',
) {
  const d = 320 * s;            // diameter
  const m = 34 * s;             // margin
  const topSafe = 170 * s;      // below header
  const botSafe = 250 * s;      // above input bar
  let cx: number, cy: number;
  switch (corner) {
    case 'tl': cx = m + d / 2; cy = topSafe + d / 2; break;
    case 'tr': cx = W - m - d / 2; cy = topSafe + d / 2; break;
    case 'bl': cx = m + d / 2; cy = H - botSafe - d / 2; break;
    default:   cx = W - m - d / 2; cy = H - botSafe - d / 2; // br
  }
  const vw = (video as any).videoWidth || 640;
  const vh = (video as any).videoHeight || 480;
  if (!vw || !vh) return;
  const sc = Math.max(d / vw, d / vh); // cover-fit
  const dw = vw * sc, dh = vh * sc;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.translate(cx, cy); ctx.scale(-1, 1); ctx.translate(-cx, -cy); // mirror (selfie)
  try { ctx.drawImage(video, cx - dw / 2, cy - dh / 2, dw, dh); } catch { /* frame not ready */ }
  ctx.restore();
  // ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.restore();
}

// ── canvas helpers ──

function displayText(m: Message): string {
  switch (m.type) {
    case 'deleted': return '🚫 Esta mensagem foi apagada';
    case 'call_missed': return '📞 Chamada de voz perdida';
    case 'audio': return '🎤 Áudio  ▶ ▬▬▬▬▬▬ 0:0' + (Math.floor(Math.random() * 9));
    case 'sticker': return m.text || '🩷';
    default: return m.text;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  // split on spaces, but also hard-break any single word too long to fit (no spaces)
  const words = text.split(/\s+/).flatMap((w) => breakLongWord(ctx, w, maxW));
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// break a single space-less word (long URL, "kkkk…") into chunks that fit maxW
function breakLongWord(ctx: CanvasRenderingContext2D, word: string, maxW: number): string[] {
  if (!word || ctx.measureText(word).width <= maxW) return [word];
  const chunks: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      chunks.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, tail?: 'in' | 'out') {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPattern(ctx: CanvasRenderingContext2D, W: number, H: number, color: string, s: number) {
  ctx.fillStyle = color;
  const step = 60 * s;
  for (let y = 0; y < H; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function shadow(ctx: CanvasRenderingContext2D, s: number) {
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 8 * s;
  ctx.shadowOffsetY = 2 * s;
}
function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
