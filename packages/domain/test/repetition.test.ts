import { describe, expect, it } from "vitest";

describe("falso positivo: uma palavra em comum", () => {
  it("frases que só dividem 'copo' não são repetição; a mesma frase continua sendo", async () => {
    const { similarity } = await import("../src");
    expect(similarity("O copo certo", "Copo de liquidificador")).toBeLessThan(0.45);
    expect(similarity("copo", "copo")).toBe(1);
    expect(similarity("o mixer bate o copo inteiro", "o mixer bate o copo")).toBeGreaterThan(0.45);
  });
});
