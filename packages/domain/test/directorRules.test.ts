import { describe, expect, it } from "vitest";
import { RODRIGO_PROFILE, directorIssues, generateLocal } from "../src";

const base = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "thought", eventText: null, recent: [] }).draft;

describe("regras do diretor no roteiro", () => {
  it("aceita roteiro dentro das regras", () => {
    const words = base.script.split(/\s+/).filter(Boolean).length;
    const ok = { ...base, hook_options: ["Ninguém te conta isso sobre ter 40", "Eu quase desisti hoje", "Você já sentiu isso?"] as [string, string, string], screen_text: "Vida real 40+", duration_seconds: Math.max(3, Math.round(words / 2.5)) };
    expect(directorIssues(ok)).toEqual([]);
  });
  it("aponta gancho longo, texto de tela fora de 2–5 palavras e duração incoerente", () => {
    const longHook = "uma duas três quatro cinco seis sete oito nove dez onze doze treze";
    const issues = directorIssues({ ...base, hook_options: [longHook, "ok curto aqui", "outro curto"], screen_text: "x", duration_seconds: 180 });
    expect(issues.join(" | ")).toMatch(/gancho 1 tem 13 palavras/);
    expect(issues.join(" | ")).toMatch(/screen_text tem 1 palavra/);
    expect(issues.join(" | ")).toMatch(/duration_seconds 180s não bate/);
  });
});
