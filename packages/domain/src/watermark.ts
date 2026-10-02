/** Assinatura na fonte manuscrita durante o vídeo todo (padrão: embaixo, no centro); cada perfil escolhe a posição. */
export type WatermarkCorner = "inf-centro" | "sup-esq" | "sup-dir" | "inf-esq" | "inf-dir" | "off";

export const WATERMARK_CORNERS: readonly WatermarkCorner[] = ["inf-centro", "sup-esq", "sup-dir", "inf-esq", "inf-dir", "off"];

export const WATERMARK_LABEL: Record<WatermarkCorner, string> = {
  "inf-centro": "⬇ Embaixo, no centro",
  "sup-esq": "↖ Em cima, à esquerda",
  "sup-dir": "↗ Em cima, à direita",
  "inf-esq": "↙ Embaixo, à esquerda",
  "inf-dir": "↘ Embaixo, à direita",
  off: "Sem assinatura no canto",
};

export const DEFAULT_WATERMARK: WatermarkCorner = "inf-centro";

/** Valor salvo (ou vindo do servidor) → canto válido; qualquer coisa estranha cai no padrão. */
export const watermarkCorner = (v: unknown): WatermarkCorner =>
  WATERMARK_CORNERS.includes(v as WatermarkCorner) ? (v as WatermarkCorner) : DEFAULT_WATERMARK;
