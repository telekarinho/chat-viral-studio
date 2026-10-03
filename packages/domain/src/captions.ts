import { clipStartsMs, type CaptionCue, type CaptionStyle, type EditPlan, type PlanOverlay } from "./editPlan";
import type { WatermarkCorner } from "./watermark";

/**
 * Legendas sincronizadas com a FALA REAL (palavra a palavra, vindas da transcrição do take) e renderizadas
 * em ASS/libass: contorno para ler em qualquer fundo, entrada suave, e no estilo "destaque" a palavra falada acende.
 */
export interface SpokenWord {
  text: string;
  startMs: number;
  endMs: number;
}

const MAX_CHARS: Record<CaptionStyle, number> = { manuscrito: 26, destaque: 16, limpo: 30, nenhuma: 0 };
const MAX_WORDS = 4; // blocos curtos: lê de relance, prende mais
const PAUSE_BREAK_MS = 350;
const MIN_CUE_MS = 450;
const TAIL_MS = 300;

/** Agrupa as palavras faladas em frases curtas (1 linha), quebrando em pontuação, pausa ou tamanho. */
export function cuesFromWords(words: readonly SpokenWord[], style: CaptionStyle, clipDurationMs: number): CaptionCue[] {
  if (style === "nenhuma") return [];
  const clean = words.map((w) => ({ ...w, text: w.text.trim() })).filter((w) => w.text && w.endMs > w.startMs);
  const groups: SpokenWord[][] = [];
  let cur: SpokenWord[] = [];
  for (const w of clean) {
    const prev = cur[cur.length - 1];
    const tooLong = cur.length > 0 && [...cur, w].map((x) => x.text).join(" ").length > MAX_CHARS[style];
    const pause = prev !== undefined && w.startMs - prev.endMs > PAUSE_BREAK_MS;
    if (cur.length && (tooLong || pause || cur.length >= MAX_WORDS)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.!?…;:]$/.test(w.text) || (/,$/.test(w.text) && cur.length >= 2)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  const upper = style !== "limpo";
  return groups.map((g, i) => {
    const next = groups[i + 1];
    const startMs = Math.max(0, g[0]!.startMs);
    const natural = g[g.length - 1]!.endMs + TAIL_MS;
    const endMs = Math.min(clipDurationMs, next ? Math.min(natural, next[0]!.startMs) : natural, Math.max(natural, startMs + MIN_CUE_MS));
    const fmt = (s: string) => (upper ? s.toLocaleUpperCase("pt-BR") : s);
    return {
      startMs, endMs: Math.max(endMs, startMs + 1),
      text: fmt(g.map((w) => w.text).join(" ")),
      words: g.map((w) => ({ text: fmt(w.text), startMs: w.startMs, endMs: w.endMs })),
    };
  });
}

// ---------- ASS (libass) ----------

/** #RRGGBB → &H00BBGGRR (ASS) */
export function assColor(hex: string, alpha = 0): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  return `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${b}${g}${r}`.toUpperCase();
}

export const CAPTION_FONTS = { manuscrito: "Covered By Your Grace", destaque: "Anton", limpo: "DejaVu Sans" } as const;
export const CAPTION_CREAM = "#F3E6CF"; // preset "Manuscrito" do print do Rodrigo
export const DEFAULT_ACCENT = "#FFD23F";
export const HOOK_MS = 3000;
/** a legenda da fala nunca passa daqui para baixo (a assinatura fica abaixo) */
const CAPTION_SAFE_BOTTOM = 0.855;
const CAPTION_MIN_TOP = 0.45;
const CAPTION_MIN_SCALE = 0.6;
/** altura que o bloco da legenda ocupa (fração do vídeo), por estilo — até 2 linhas na manuscrita */
const CAPTION_BLOCK: Record<CaptionStyle, number> = { manuscrito: 0.14, destaque: 0.08, limpo: 0.08, nenhuma: 0 };

/** Onde a legenda da fala começa (topo do bloco) e quanto a letra encolhe para caber entre o queixo e a assinatura. */
export function captionSpot(faceBottom: number | null, style: CaptionStyle): { top: number; scale: number } {
  const block = CAPTION_BLOCK[style];
  // sem rosto encontrado: o mais baixo possível (logo acima da assinatura) — no enquadramento de selfie, abaixo da barba
  if (faceBottom === null || !block) return { top: Math.round((CAPTION_SAFE_BOTTOM - block) * 1000) / 1000, scale: 1 };
  const below = Math.max(CAPTION_MIN_TOP, faceBottom + 0.01);
  const scale = Math.max(CAPTION_MIN_SCALE, Math.min(1, (CAPTION_SAFE_BOTTOM - below) / block));
  const top = Math.min(below, CAPTION_SAFE_BOTTOM - block * scale);
  return { top: Math.round(top * 1000) / 1000, scale: Math.round(scale * 100) / 100 };
}

/** texto na tela (gancho e textos do diretor): SEMPRE acima da cabeça — nunca sobre o rosto nem na faixa da legenda */
const OVERLAY_TOP = 0.13;
const OVERLAY_MIN_TOP = 0.07;
/** altura do bloco do texto na tela (letra 132, até 2 linhas) */
const OVERLAY_BLOCK = 0.16;

/** Onde o texto na tela começa e quanto encolhe para caber entre o alto da tela e o alto da cabeça. */
export function overlaySpot(faceTop: number | null): { top: number; scale: number } {
  if (faceTop === null) return { top: OVERLAY_TOP, scale: 1 };
  const room = faceTop - 0.01 - OVERLAY_MIN_TOP;
  const scale = Math.max(CAPTION_MIN_SCALE, Math.min(1, room / OVERLAY_BLOCK));
  const top = Math.max(OVERLAY_MIN_TOP, Math.min(OVERLAY_TOP, faceTop - 0.01 - OVERLAY_BLOCK * scale));
  return { top: Math.round(top * 1000) / 1000, scale: Math.round(scale * 100) / 100 };
}

function assTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** Texto seguro para ASS: sem chaves/barras que viram comando. */
export function assText(s: string): string {
  return s.replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, " ");
}

/** Arquivo .ass do vídeo inteiro (tempos globais, depois de juntar as partes). */
export function buildAss(plan: Pick<EditPlan, "clips" | "captionStyle" | "width" | "height" | "transitions"> & {
  accentColor?: string; hookText?: string | null; totalMs?: number; signature?: string; watermark?: WatermarkCorner; overlays?: PlanOverlay[];
}): string {
  const style = plan.captionStyle;
  const accent = assColor(plan.accentColor ?? DEFAULT_ACCENT);
  const white = assColor("#FFFFFF");
  const marginV = Math.round(plan.height * 0.42); // texto na altura do rosto (≈ 58%), como no print
  const header = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${plan.width}`, `PlayResY: ${plan.height}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // creme, pincel, contorno fino escuro + sombra suave: legível sem caixa de fundo (como o print)
    `Style: manuscrito,${CAPTION_FONTS.manuscrito},118,${assColor(CAPTION_CREAM)},${assColor(CAPTION_CREAM)},${assColor("#000000", 0xA0)},${assColor("#000000", 0x70)},0,0,0,0,100,100,3,0,1,1.5,3,2,70,70,${marginV},1`,
    `Style: destaque,${CAPTION_FONTS.destaque},124,${white},${white},${assColor("#000000")},${assColor("#000000", 0x80)},0,0,0,0,100,100,1,0,1,6,0,2,70,70,${marginV},1`,
    `Style: limpo,${CAPTION_FONTS.limpo},64,${white},${white},${assColor("#000000")},${assColor("#000000", 0x90)},-1,0,0,0,100,100,0,0,1,3,1,2,70,70,${marginV},1`,
    // assinatura do perfil: mesma fonte manuscrita, menor, o vídeo inteiro
    `Style: assinatura,${CAPTION_FONTS.manuscrito},74,${assColor(CAPTION_CREAM, 0x10)},${assColor(CAPTION_CREAM, 0x10)},${assColor("#000000", 0xA0)},${assColor("#000000", 0x70)},0,0,0,0,100,100,4,0,1,1.5,3,2,60,60,${Math.round(plan.height * 0.1)},1`,
    // gancho na tela: mesma letra manuscrita, bem grande, no alto, com sombra (sem caixa: visual de criador, não de anúncio)
    `Style: gancho,${CAPTION_FONTS.manuscrito},132,${assColor(CAPTION_CREAM)},${assColor(CAPTION_CREAM)},${assColor("#000000", 0x90)},${assColor("#000000", 0x60)},0,0,0,0,100,100,3,0,1,2,4,8,80,80,${Math.round(plan.height * 0.13)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events: string[] = [];
  const hook = plan.hookText?.trim();
  const sig = plan.signature?.trim();
  const corner = plan.watermark ?? "inf-centro";
  if (sig && corner !== "off" && (plan.totalMs ?? 0) > 0) {
    // \an = posição (teclado numérico); em cima fica abaixo da barra do app da rede, embaixo acima dos botões
    const an = { "inf-centro": 2, "inf-esq": 1, "inf-dir": 3, "sup-esq": 7, "sup-dir": 9 }[corner];
    const top = corner.startsWith("sup") ? `\\pos(${corner.endsWith("esq") ? 60 : plan.width - 60},${Math.round(plan.height * 0.07)})` : "";
    events.push(`Dialogue: 2,${assTime(0)},${assTime(plan.totalMs!)},assinatura,,0,0,0,,{\\an${an}${top}}${assText(sig.toLocaleUpperCase("pt-BR"))}`);
  }
  // texto na tela (gancho e textos do diretor): SEMPRE acima da cabeça — a legenda da fala fica abaixo do queixo.
  // A posição pedida pelo diretor (topo/centro/base) é ignorada de propósito: um texto nunca cobre o rosto nem a legenda.
  const clipStarts = clipStartsMs(plan);
  const headTopAt = (ms: number) => {
    let k = 0;
    while (k + 1 < plan.clips.length && clipStarts[k + 1]! <= ms) k++;
    return plan.clips[k]?.faceTop ?? null;
  };
  const overlayTag = (ms: number) => {
    const o = overlaySpot(headTopAt(ms));
    const fs = Math.round(100 * o.scale);
    return `\\an8\\pos(${Math.round(plan.width / 2)},${Math.round(plan.height * o.top)})\\fscx${fs}\\fscy${fs}`;
  };
  if (hook) events.push(`Dialogue: 1,${assTime(0)},${assTime(Math.min(HOOK_MS, plan.totalMs ?? HOOK_MS))},gancho,,0,0,0,,{${overlayTag(0)}\\fad(120,200)}${assText(hook.toLocaleUpperCase("pt-BR"))}`);
  for (const o of plan.overlays ?? []) {
    const end = Math.min(o.endMs, plan.totalMs ?? o.endMs);
    if (end <= o.startMs || !o.text.trim()) continue;
    events.push(`Dialogue: 1,${assTime(o.startMs)},${assTime(end)},gancho,,0,0,0,,{${overlayTag(o.startMs)}\\fad(120,200)}${assText(o.text.toLocaleUpperCase("pt-BR"))}`);
  }
  if (style === "nenhuma") return [...header, ...events].join("\n") + "\n";
  const starts = clipStartsMs(plan);
  for (const [k, clip] of plan.clips.entries()) {
    const offset = starts[k]!;
    // legenda SEMPRE abaixo do queixo/barba (nunca no rosto); se o espaço for curto, a letra diminui
    const spot = captionSpot(clip.faceBottom ?? null, style);
    const at = `\\an8\\pos(${Math.round(plan.width / 2)},${Math.round(plan.height * spot.top)})`;
    const sc = (n: number) => Math.round(n * spot.scale);
    for (const cue of clip.captions) {
      const s = offset + cue.startMs;
      const e = offset + cue.endMs;
      if (style === "destaque" && cue.words?.length) {
        // uma linha por palavra falada: a atual acende na cor do tema, com um leve "pop"
        cue.words.forEach((w, i) => {
          const ws = i === 0 ? s : offset + w.startMs;
          const we = i === cue.words!.length - 1 ? e : offset + cue.words![i + 1]!.startMs;
          if (we <= ws) return;
          const txt = cue.words!.map((x, j) => (j === i ? `{\\c${accent}\\fscx${sc(110)}\\fscy${sc(110)}}${assText(x.text)}{\\c${white}\\fscx${sc(100)}\\fscy${sc(100)}}` : assText(x.text))).join(" ");
          events.push(`Dialogue: 0,${assTime(ws)},${assTime(we)},destaque,,0,0,0,,{${at}\\fscx${sc(100)}\\fscy${sc(100)}${i === 0 ? "\\fad(60,0)" : ""}}${txt}`);
        });
      } else {
        // manuscrito entra com um "pop" curto (92% → 100%) e sai rápido: ritmo de Shorts/Reels
        const anim = style === "manuscrito"
          ? `{${at}\\fad(70,50)\\fscx${sc(92)}\\fscy${sc(92)}\\t(0,140,\\fscx${sc(100)}\\fscy${sc(100)})}`
          : `{${at}\\fscx${sc(100)}\\fscy${sc(100)}\\fad(90,70)}`;
        const text = style === "manuscrito" ? cue.text.toLocaleUpperCase("pt-BR") : cue.text;
        events.push(`Dialogue: 0,${assTime(s)},${assTime(e)},${style},,0,0,0,,${anim}${assText(text)}`);
      }
    }
  }
  return [...header, ...events].join("\n") + "\n";
}
