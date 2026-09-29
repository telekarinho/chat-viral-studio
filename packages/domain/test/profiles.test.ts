import { describe, expect, it } from "vitest";
import {
  BUSINESS_PILLARS, CONTROLPOT_PROFILE, PROFILE_TEMPLATES, RODRIGO_PROFILE, buildPrompt, buildSegments, businessRoutine, fingerprintsFor, generateLocal,
  mentionsPrice, validatePillarTargets, type Fingerprint,
} from "../src";

const gen = (pillarSlug: string, recent: Fingerprint[] = []) =>
  generateLocal({ profile: CONTROLPOT_PROFILE, pillarSlug, pillarName: BUSINESS_PILLARS.find((p) => p.slug === pillarSlug)!.name, format: "main_video", eventText: null, recent });

describe("perfis múltiplos", () => {
  it("templates têm pilares que somam 100% e rotina", () => {
    for (const t of PROFILE_TEMPLATES) {
      expect(validatePillarTargets(t.pillars)).toEqual([]);
      expect(t.routine(() => "x").length).toBeGreaterThan(0);
    }
    expect(businessRoutine(() => "x").every((b) => b.weekday >= 1 && b.weekday <= 5)).toBe(true);
  });

  it("perfil pessoal continua fechando com 'E se der certo!'", () => {
    const d = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: [] }).draft;
    expect(d.script.trim().endsWith("E se der certo!")).toBe(true);
  });
});

describe("perfil empresa (ControlPot)", () => {
  it("gera roteiro offline válido para todos os pilares de venda, sem preço e sem o fechamento pessoal", () => {
    for (const p of BUSINESS_PILLARS) {
      const d = gen(p.slug).draft;
      expect(mentionsPrice(d)).toBe(false);
      expect(d.script).not.toContain("E se der certo");
      expect(d.caption.instagram).toContain("ControlPot");
      expect(d.recording_suggestions.length).toBeGreaterThan(0);
    }
  });

  it("uma objeção por vídeo e varia quando já foi usada", () => {
    const first = gen("educacao").draft;
    const second = gen("educacao", fingerprintsFor(first).map((f) => ({ ...f, contentItemId: "a", createdAt: "2026-09-29T10:00:00Z" }))).draft;
    expect(second.key_phrase).not.toBe(first.key_phrase);
    const objections = CONTROLPOT_PROFILE.business!.objections.filter((o) => first.script.includes(o.objection));
    expect(objections).toHaveLength(1);
  });

  it("detecta preço em qualquer lugar visível", () => {
    const d = gen("oferta").draft;
    expect(mentionsPrice({ ...d, screen_text: "Só R$ 1.990" })).toBe(true);
    expect(mentionsPrice({ ...d, cta: "Parcelamento em 10x" })).toBe(true);
    expect(mentionsPrice({ ...d, caption: { ...d.caption, tiktok: "o preço caiu" } })).toBe(true);
    expect(mentionsPrice({ ...d, script: "30% de desconto hoje" })).toBe(true);
    expect(mentionsPrice(d)).toBe(false);
  });

  it("prompt de empresa traz a Regra de Ouro, a proibição de preço e as objeções reais", () => {
    const { system, user } = buildPrompt({ profile: CONTROLPOT_PROFILE, pillarName: "Demonstração", format: "main_video", eventText: null, recentSummaries: [], avoid: "" });
    expect(system).toContain("PROIBIDO falar preço");
    expect(system).toContain("caneca cônica");
    expect(system).not.toContain("E se der certo");
    expect(user).toContain("UMA objeção");
    expect(user).toContain("30–90s");
  });

  it("partes da gravação com rótulos de venda", () => {
    const d = gen("demonstracao").draft;
    const segs = buildSegments(d, { selectedHook: 1, userEdited: false, closingPhrase: "", business: true });
    expect(segs.map((s) => s.label)).toEqual(["Gancho", "A dor do cliente", "A objeção respondida", "A prova", "Chamada"]);
  });
});
