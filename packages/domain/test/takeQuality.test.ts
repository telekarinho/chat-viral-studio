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
