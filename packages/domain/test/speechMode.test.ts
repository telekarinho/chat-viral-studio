import { describe, expect, it } from "vitest";
import { TakeSchema, prompterText } from "../src";

describe("modo de fala do diretor", () => {
  it("padrão é exata (roteiros antigos não mudam)", () => {
    expect(TakeSchema.parse({ ordem: 1, nome: "Gancho", fala_exata: "Oi.", duracao_segundos: 3 }).modo_fala).toBe("exata");
  });
  it("teleprompter: tópicos em linhas, improviso só a ideia central", () => {
    const t = "Primeiro ponto. Segundo ponto! Terceiro?";
    expect(prompterText(t, "exata")).toBe(t);
    expect(prompterText(t, "topicos")).toBe("• Primeiro ponto.\n• Segundo ponto!\n• Terceiro?");
    expect(prompterText(t, "improviso")).toBe("🎯 Primeiro ponto.");
  });
});
