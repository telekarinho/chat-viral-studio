/** Assinatura fixa num canto durante o vídeo todo; cada perfil escolhe o canto (ou desliga). */
export type WatermarkCorner = "sup-esq" | "sup-dir" | "inf-esq" | "inf-dir" | "off";

export const WATERMARK_CORNERS: readonly WatermarkCorner[] = ["sup-esq", "sup-dir", "inf-esq", "inf-dir", "off"];

export const WATERMARK_LABEL: Record<WatermarkCorner, string> = {
  "sup-esq": "↖ Em cima, à esquerda",
  "sup-dir": "↗ Em cima, à direita",
  "inf-esq": "↙ Embaixo, à esquerda",
  "inf-dir": "↘ Embaixo, à direita",
  off: "Sem assinatura no canto",
};

export const DEFAULT_WATERMARK: WatermarkCorner = "sup-dir";

/** Valor salvo (ou vindo do servidor) → canto válido; qualquer coisa estranha cai no padrão. */
export const watermarkCorner = (v: unknown): WatermarkCorner =>
  WATERMARK_CORNERS.includes(v as WatermarkCorner) ? (v as WatermarkCorner) : DEFAULT_WATERMARK;
