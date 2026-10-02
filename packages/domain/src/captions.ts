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
  if (hook) events.push(`Dialogue: 1,${assTime(0)},${assTime(Math.min(HOOK_MS, plan.totalMs ?? HOOK_MS))},gancho,,0,0,0,,{\\fad(120,200)}${assText(hook.toLocaleUpperCase("pt-BR"))}`);
  // textos na tela do diretor: mesma letra do gancho, na posição pedida (topo / centro / base)
  for (const o of plan.overlays ?? []) {
    const end = Math.min(o.endMs, plan.totalMs ?? o.endMs);
    if (end <= o.startMs || !o.text.trim()) continue;
    const an = { topo: 8, centro: 5, base: 2 }[o.position];
    events.push(`Dialogue: 1,${assTime(o.startMs)},${assTime(end)},gancho,,0,0,0,,{\\an${an}\\fad(120,200)}${assText(o.text.toLocaleUpperCase("pt-BR"))}`);
  }
  if (style === "nenhuma") return [...header, ...events].join("\n") + "\n";
  const starts = clipStartsMs(plan);
  for (const [k, clip] of plan.clips.entries()) {
    const offset = starts[k]!;
    for (const cue of clip.captions) {
      const s = offset + cue.startMs;
      const e = offset + cue.endMs;
      if (style === "destaque" && cue.words?.length) {
        // uma linha por palavra falada: a atual acende na cor do tema, com um leve "pop"
        cue.words.forEach((w, i) => {
          const ws = i === 0 ? s : offset + w.startMs;
          const we = i === cue.words!.length - 1 ? e : offset + cue.words![i + 1]!.startMs;
          if (we <= ws) return;
          const txt = cue.words!.map((x, j) => (j === i ? `{\\c${accent}\\fscx110\\fscy110}${assText(x.text)}{\\c${white}\\fscx100\\fscy100}` : assText(x.text))).join(" ");
          events.push(`Dialogue: 0,${assTime(ws)},${assTime(we)},destaque,,0,0,0,,${i === 0 ? "{\\fad(60,0)}" : ""}${txt}`);
        });
      } else {
        // manuscrito entra com um "pop" curto (92% → 100%) e sai rápido: ritmo de Shorts/Reels
        const anim = style === "manuscrito" ? "{\\fad(70,50)\\fscx92\\fscy92\\t(0,140,\\fscx100\\fscy100)}" : "{\\fad(90,70)}";
        const text = style === "manuscrito" ? cue.text.toLocaleUpperCase("pt-BR") : cue.text;
        events.push(`Dialogue: 0,${assTime(s)},${assTime(e)},${style},,0,0,0,,${anim}${assText(text)}`);
      }
    }
  }
  return [...header, ...events].join("\n") + "\n";
}
