import { describe, expect, it } from "vitest";
import { DEFAULT_WATERMARK, WATERMARK_CORNERS, buildEditPlan, watermarkCorner } from "../src";

describe("assinatura no canto", () => {
  it("aceita só cantos conhecidos; o resto cai no padrão (em cima, à direita)", () => {
    for (const c of WATERMARK_CORNERS) expect(watermarkCorner(c)).toBe(c);
    expect(watermarkCorner(undefined)).toBe(DEFAULT_WATERMARK);
    expect(watermarkCorner("meio'; rm -rf /")).toBe("sup-dir");
  });
  it("o plano de edição leva o canto só quando informado", () => {
    const seg = [{ index: 0, role: "hook" as const, text: "Oi", label: "Gancho" }];
    const takes = [{ segmentIndex: 0, takeId: "t", durationMs: 3000 }];
    expect(buildEditPlan({ segments: seg, takes, signature: "ControlPot", watermark: "inf-esq" }).watermark).toBe("inf-esq");
    expect("watermark" in buildEditPlan({ segments: seg, takes, signature: "ControlPot" })).toBe(false);
  });
});
