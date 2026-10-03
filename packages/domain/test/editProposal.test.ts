import { describe, expect, it } from "vitest";
import { DEFAULT_EDIT_CHOICES, activeAutoCutTheme, applyEditProposal, describeEditProposal, parseEditProposal } from "../src";

const OWN = [{ id: "11111111-1111-4111-8111-111111111111", titulo: "Minha trilha", comercial: false, storageKey: "k" }];

describe("proposta de edição do diretor", () => {
  it("valida tema, faixa, volume e trecho juntos", () => {
    const r = parseEditProposal({ autocut: "tiktok", musica: "mixkit-22", volume: 0.3, inicio_musica_s: 12 }, { business: false, own: [] });
    expect(r).toEqual({ ok: true, edit: { autocut: "tiktok", music: "mixkit-22", musicVolume: 0.3, musicStartS: 12 } });
  });

  it("devolve todos os erros de uma vez", () => {
    const r = parseEditProposal({ autocut: "xxx", musica: "nao-existe", volume: 0.9, inicio_musica_s: 3 }, { business: false, own: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(4);
  });

  it("empresa não usa música própria sem licença comercial; pessoal usa", () => {
    const id = `own:${OWN[0]!.id}`;
    expect(parseEditProposal({ musica: id }, { business: true, own: OWN }).ok).toBe(false);
    expect(parseEditProposal({ musica: id }, { business: false, own: OWN })).toEqual({ ok: true, edit: { music: id } });
  });

  it("trecho além do fim da faixa é recusado", () => {
    expect(parseEditProposal({ musica: "mixkit-22", inicio_musica_s: 197 }, { business: false, own: [] }).ok).toBe(false);
  });

  it("aplica: tema primeiro, depois a música; o tema continua ativo com faixa escolhida", () => {
    const v = applyEditProposal({ ...DEFAULT_EDIT_CHOICES, musicStartS: 40 }, { autocut: "tiktok", music: "mixkit-22", musicStartS: 12 });
    expect(v).toMatchObject({ autocut: "tiktok", music: "mixkit-22", musicStartS: 12, captionStyle: "destaque" });
    expect(activeAutoCutTheme(v)).toBe("tiktok");
    // trocou a faixa sem dizer o trecho: o trecho antigo (de outra música) sai
    expect(applyEditProposal({ ...DEFAULT_EDIT_CHOICES, music: "mixkit-601", musicStartS: 40 }, { music: "mixkit-22" }).musicStartS).toBeUndefined();
  });

  it("descreve em uma linha", () => {
    expect(describeEditProposal({ autocut: "tiktok", music: "mixkit-22", musicStartS: 72, musicVolume: 0.3 })).toBe("AutoCut Acelerada TikTok · música Piano Reflections a partir de 1:12 · volume 30%");
  });
});
