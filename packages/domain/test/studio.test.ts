import { describe, expect, it } from "vitest";
import {
  CONTROLPOT_PROFILE, COURSE_MODULES, PRODUCTION_MODES, SHOT_LIBRARY, commercialBlockers, initialCourse, lessonPublishBlockers, pendingClaimsIn, type ClipMeta,
} from "../src";

const reviewed: ClipMeta = {
  mode: "demonstracao_mixer", sku: "CF-MIXERP-1778541098", skuNome: "Mixer SD 201", fonteSorvete: "expresso",
  permissoes: { imagemPessoas: true, marcasTerceiros: true },
  review: { falaConfere: true, legendaConfere: true, equipamentoEhOSku: true, ingredientesConferem: true, resultadoOk: true, ctaOk: true, revisadoEm: "2026-09-29T20:00:00Z" },
};

describe("estúdio da fábrica — modos de produção", () => {
  it("todos os modos A–G têm tomadas da biblioteca e travas", () => {
    expect(Object.keys(PRODUCTION_MODES)).toHaveLength(7);
    for (const m of Object.values(PRODUCTION_MODES)) {
      expect(m.shots.every((s) => s in SHOT_LIBRARY)).toBe(true);
      expect(m.guard.length).toBeGreaterThan(0);
    }
    expect(PRODUCTION_MODES.comece_balde.source).toBe("balde");
    expect(PRODUCTION_MODES.comece_balde.brief).toMatch(/NÃO cite valor de investimento/);
    expect(PRODUCTION_MODES.expresso_x_balde.brief).toMatch(/Não diga que uma opção é sempre superior/);
  });

  it("clipe revisado com SKU confirmado libera uso comercial (balde e expresso)", () => {
    expect(commercialBlockers(reviewed, "curto_redes")).toEqual([]);
    expect(commercialBlockers({ ...reviewed, mode: "comece_balde", fonteSorvete: "balde" }, "marketplace")).toEqual([]);
  });

  it("mixer diferente do SKU associado bloqueia", () => {
    const b = commercialBlockers({ ...reviewed, review: { ...reviewed.review!, equipamentoEhOSku: false } }, "marketplace");
    expect(b.join()).toMatch(/não foi confirmado como o SKU/);
    expect(commercialBlockers({ ...reviewed, sku: null }, "marketplace").join()).toMatch(/Sem SKU/);
  });

  it("sem revisão, sem autorização de imagem ou com alegação sem prova: bloqueia", () => {
    expect(commercialBlockers({ ...reviewed, review: undefined }, "curto_redes").join()).toMatch(/não revisado/);
    expect(commercialBlockers({ ...reviewed, permissoes: { imagemPessoas: false, marcasTerceiros: true } }, "campanha").join()).toMatch(/autorização de imagem/);
    const script = "A gente já tem mais de 4.000 máquinas rodando e caneca cônica exclusiva.";
    const claims = pendingClaimsIn(script, CONTROLPOT_PROFILE.business!.pendingClaims!);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(commercialBlockers(reviewed, "campanha", claims).join()).toMatch(/Alegação sem prova/);
    expect(pendingClaimsIn("Olha a textura desse milk-shake.", CONTROLPOT_PROFILE.business!.pendingClaims!)).toEqual([]);
  });
});

describe("curso de milk-shake", () => {
  it("estrutura editável sem receita, preço ou tempo fixos, com caminho do balde", () => {
    const c = initialCourse(() => Math.random().toString(36).slice(2));
    expect(c).toHaveLength(COURSE_MODULES.length);
    expect(c.every((l) => l.ingredientes.length === 0 && l.status === "rascunho")).toBe(true);
    expect(c.at(-1)!.fonteSorvete).toBe("balde");
    expect(JSON.stringify(COURSE_MODULES)).not.toMatch(/R\$|\d+ ?segundos|\d+ ?%/);
  });

  it("aula só publica aprovada, com vídeo e com quantidades aprovadas", () => {
    const [l] = initialCourse(() => "x");
    expect(lessonPublishBlockers(l!, false).length).toBeGreaterThan(1);
    const ok = { ...l!, status: "aprovada" as const, ingredientes: [{ item: "Leite", quantidade: "conforme ficha aprovada" }] };
    expect(lessonPublishBlockers(ok, true)).toEqual([]);
    expect(lessonPublishBlockers({ ...ok, ingredientes: [{ item: "Leite", quantidade: "" }] }, true).join()).toMatch(/sem quantidade/);
  });
});
