import { describe, expect, it } from "vitest";
import {
  AUTOCUT_THEMES, DEFAULT_EDIT_CHOICES, activeAutoCutTheme, applyAutoCutTheme, applyAutoCutToPlan, autoCutParams, buildEditPlan, planCuts, type SpokenWord,
} from "../src";

const segments = [
  { index: 0, role: "hook" as const, label: "a", text: "um dois três" },
  { index: 1, role: "e" as const, label: "b", text: "quatro cinco seis" },
  { index: 2, role: "cta" as const, label: "c", text: "sete oito nove" },
];
const plan = buildEditPlan({ segments, takes: segments.map((s) => ({ segmentIndex: s.index, takeId: `t${s.index}`, durationMs: 4000 })), signature: "" });

describe("temas do AutoCut", () => {
  it("são 9 e nenhum é cópia de outro (montagem + escolhas)", () => {
    expect(AUTOCUT_THEMES.map((t) => t.id)).toEqual(["viral", "longa", "psicologica", "engracada", "suspense", "dramatica", "tiktok", "calma", "jovem"]);
    const keys = AUTOCUT_THEMES.map((t) => JSON.stringify([t.params, t.choices]));
    expect(new Set(keys).size).toBe(9);
    // os parâmetros de montagem também diferem entre todos
    expect(new Set(AUTOCUT_THEMES.map((t) => JSON.stringify(t.params))).size).toBe(9);
  });

  it("aplicar guarda o tema; mexer numa escolha vira Personalizado; trocar só a faixa mantém o tema", () => {
    const v = applyAutoCutTheme({ ...DEFAULT_EDIT_CHOICES }, "viral");
    expect(v.autocut).toBe("viral");
    expect(activeAutoCutTheme(v)).toBe("viral");
    expect(activeAutoCutTheme({ ...v, captionStyle: "limpo" })).toBeNull();
    expect(activeAutoCutTheme({ ...v, musicVolume: 0.4 })).toBeNull();
    expect(activeAutoCutTheme({ ...v, music: "mixkit-839" })).toBe("viral");
    expect(activeAutoCutTheme({ ...v, music: "own:11111111-1111-4111-8111-111111111111" })).toBe("viral");
    expect(activeAutoCutTheme({ ...DEFAULT_EDIT_CHOICES })).toBeNull();
  });

  it("o tema muda o corte: TikTok corta pausas que a Calma mantém", () => {
    const words: SpokenWord[] = [
      { text: "um", startMs: 0, endMs: 300 }, { text: "dois", startMs: 650, endMs: 900 }, { text: "três", startMs: 1500, endMs: 1800 },
    ];
    const tiktok = planCuts(words, 2200, autoCutParams({ autocut: "tiktok" }));
    const calma = planCuts(words, 2200, autoCutParams({ autocut: "calma" }));
    expect(tiktok.pauses).toBe(2);
    expect(calma.pauses).toBe(0);
    expect(tiktok.removedMs).toBeGreaterThan(calma.removedMs);
  });

  it("o tema muda a imagem: zoom, jump cut e transições", () => {
    const calma = applyAutoCutToPlan(plan, autoCutParams({ autocut: "calma" }));
    const tiktok = applyAutoCutToPlan(plan, autoCutParams({ autocut: "tiktok" }));
    const engracada = applyAutoCutToPlan(plan, autoCutParams({ autocut: "engracada" }));
    const zoom = (p: typeof plan) => p.clips.map((c) => Math.max(c.effect.fromScale, c.effect.toScale) - 1);
    expect(Math.max(...zoom(tiktok))).toBeGreaterThan(Math.max(...zoom(calma)) * 3);
    expect(calma.clips.every((c) => c.punch === 0)).toBe(true);
    expect(tiktok.clips.every((c) => c.punch === 0.12)).toBe(true);
    expect(calma.transitions!.every((t) => t.kind === "fade")).toBe(true);
    expect(engracada.transitions).toEqual([]); // corte seco
    expect(engracada.totalMs).toBe(3 * 3550); // partes de 4 s menos o toque no botão (0,45 s)
    expect(tiktok.totalMs).toBe(3 * 3550 - 2 * 180);
  });

  it("sem tema: montagem padrão de sempre", () => {
    expect(autoCutParams({})).toMatchObject({ pauseMaxMs: 450, pauseKeepMs: 160, jumpPunch: 0.1, zoom: 1 });
    expect(applyAutoCutToPlan(plan, autoCutParams({})).clips[0]!.effect).toEqual(plan.clips[0]!.effect);
  });
});
