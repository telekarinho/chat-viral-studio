import { describe, expect, it } from "vitest";
import { takeTechNotes } from "../src";

const TEXT = "uma duas três quatro cinco seis sete oito nove dez"; // 10 palavras ≈ 4s

describe("checagem técnica do take", () => {
  it("take bom: nada a apontar", () => {
    expect(takeTechNotes({ durationMs: 4500, width: 1080, height: 1920, synced: true }, TEXT)).toEqual([]);
  });
  it("aponta curto, longo, resolução, horizontal e envio", () => {
    expect(takeTechNotes({ durationMs: 1500, width: 1080, height: 1920, synced: true }, TEXT)[0]).toContain("curto demais");
    expect(takeTechNotes({ durationMs: 16000, width: 1080, height: 1920, synced: true }, TEXT)[0]).toContain("bem mais longo");
    const notes = takeTechNotes({ durationMs: 4000, width: 640, height: 480, synced: false }, TEXT);
    expect(notes).toEqual(["ainda não subiu para a nuvem", "resolução baixa (640x480)", "gravado na horizontal: o vídeo final é vertical e corta as laterais"]);
  });
  it("sem texto ou sem medida: não inventa", () => {
    expect(takeTechNotes({ durationMs: 500, width: null, height: null, synced: true }, "")).toEqual([]);
  });
});

describe("take usado em cada parte", () => {
  const t = (id: string, segmentIndex: number | null, tags: string[] = []) => ({ id, segmentIndex, tags });
  it("escolhido vence o mais recente; sem escolha, o mais recente; descartado nunca", async () => {
    const { chosenTakes } = await import("../src");
    const m = chosenTakes([t("p0-novo", 0), t("p0-velho", 0, ["escolhido"]), t("p1-desc", 1, ["descartado"]), t("p1", 1), t("inteiro", null)]);
    expect(m.get(0)?.id).toBe("p0-velho");
    expect(m.get(1)?.id).toBe("p1");
    expect(m.size).toBe(2);
  });
});

describe("diagnóstico para o criador", () => {
  it("🟢 fala completa, ritmo, duração, vertical, resolução; 🟡 rápido; recomenda o com menos alertas", async () => {
    const { takeChecks, recommendTake } = await import("../src");
    const good = takeChecks({ durationMs: 4500, width: 1080, height: 1920 }, TEXT);
    expect(good.every((c) => c.ok)).toBe(true);
    expect(good.map((c) => c.key)).toEqual(["fala", "ritmo", "duracao", "enquadramento", "resolucao"]);
    expect(takeChecks({ durationMs: 2600, width: 1080, height: 1920 }, TEXT).find((c) => c.key === "ritmo")).toEqual({ key: "ritmo", ok: false, label: "Falou um pouco rápido" });
    const fast = { id: "novo", durationMs: 2600, width: 1080, height: 1920 };
    const ok = { id: "velho", durationMs: 4500, width: 1080, height: 1920 };
    expect(recommendTake([fast, ok], TEXT)?.id).toBe("velho");
  });
});
