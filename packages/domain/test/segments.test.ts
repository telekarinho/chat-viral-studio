import { describe, expect, it } from "vitest";
import { RODRIGO_PROFILE, buildCaptions, buildEditPlan, buildSegments, chooseEffect, generateLocal, segmentProgress } from "../src";

const main = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: [] }).draft;
const thought = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "humor", pillarName: "Humor", format: "thought", eventText: null, recent: [] }).draft;
const opts = { selectedHook: 1, userEdited: false, closingPhrase: "E se der certo!" };

describe("gravação por partes", () => {
  it("vídeo principal vira gancho → E → MAS → POR ISSO → CTA → fechamento", () => {
    const segs = buildSegments(main, opts);
    expect(segs.map((s) => s.role)).toEqual(["hook", "e", "mas", "por_isso", "cta", "closing"]);
    expect(segs[0]!.text).toBe(main.hook_options[1]);
    expect(segs[5]!.text).toBe("E se der certo!");
    expect(segs.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("pensamento do dia: gancho (1ª frase) → mensagem → fechamento, sem repetir o fechamento", () => {
    const segs = buildSegments(thought, opts);
    expect(segs.at(-1)!.text).toBe("E se der certo!");
    expect(segs.slice(0, -1).map((s) => s.text).join(" ")).not.toMatch(/E se der certo!/);
    const t = { ...thought, script: "Nem sempre o que marca custa dinheiro. Às vezes é só sentar, ouvir e estar ali de verdade. Eles esquecem o presente, mas lembram de você. E se der certo!" };
    expect(buildSegments(t, opts).map((s) => [s.label, s.text])).toEqual([
      ["Gancho", "Nem sempre o que marca custa dinheiro."],
      ["Mensagem", "Às vezes é só sentar, ouvir e estar ali de verdade. Eles esquecem o presente, mas lembram de você."],
      ["Fechamento", "E se der certo!"],
    ]);
    // uma frase só: gancho + fechamento
    expect(buildSegments({ ...thought, script: "Hoje eu escolhi ficar em casa com eles. E se der certo!" }, opts).map((s) => s.label)).toEqual(["Gancho", "Fechamento"]);
  });
  it("roteiro editado divide por parágrafo e junta fragmentos curtos", () => {
    const segs = buildSegments({ ...main, script: "Oi.\n\nHoje eu quero te contar uma coisa.\n\nFoi difícil mas valeu a pena.\n\nE se der certo!" }, { ...opts, userEdited: true });
    expect(segs.map((s) => s.text)).toEqual(["Oi. Hoje eu quero te contar uma coisa.", "Foi difícil mas valeu a pena.", "E se der certo!"]);
  });
  it("próxima parte é a primeira ainda não gravada; regravar não perde a ordem", () => {
    expect(segmentProgress(4, [])).toEqual({ recorded: [], next: 0, done: false });
    expect(segmentProgress(4, [0, 1, 1])).toMatchObject({ next: 2, done: false });
    expect(segmentProgress(4, [0, 2])).toMatchObject({ next: 1 });
    expect(segmentProgress(3, [2, 0, 1])).toMatchObject({ next: null, done: true });
  });
});

describe("plano de edição automático", () => {
  const segs = buildSegments(main, opts);
  const takes = segs.map((s) => ({ segmentIndex: s.index, takeId: `t${s.index}`, durationMs: 4000 + s.index * 500 }));
  const plan = buildEditPlan({ segments: segs, takes, signature: "RodrigoSerra.me" });

  it("junta as partes na ordem, apara o toque do botão e soma a duração", () => {
    expect(plan.clips.map((c) => c.takeId)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
    expect(plan.clips[0]).toMatchObject({ trimStartMs: 250, trimEndMs: 200, durationMs: 3550 });
    // transições automáticas entre as partes: a sobreposição encurta o total
    expect(plan.transitions).toHaveLength(plan.clips.length - 1);
    expect(plan.transitions!.every((t) => t.durationMs > 0 && t.durationMs <= 300)).toBe(true);
    expect(plan.transitions!.find((_, k) => plan.clips[k + 1]!.role === "mas")?.kind).toBe("zoomin");
    expect(plan.totalMs).toBe(plan.clips.reduce((a, c) => a + c.durationMs, 0) - plan.transitions!.reduce((a, t) => a + t.durationMs, 0));
  });
  it("efeito escolhido pelo papel do trecho", () => {
    expect(plan.clips.map((c) => c.effect.kind)).toEqual(["punch_in", "slow_zoom_in", "zoom_out_reveal", "push_in", "hold", "zoom_out_end"]);
    expect(chooseEffect("e", "Você já parou pra pensar nisso?", 1, 5000).kind).toBe("punch_in");
    const gentle = chooseEffect("e", "texto longo", 1, 30_000);
    expect(gentle.toScale).toBeLessThan(1.06);
  });
  it("legendas manuscrito: 3–6 palavras, caixa alta, cobrem a parte inteira", () => {
    const cues = buildCaptions("porque eu sou contigo, mesmo quando o dia não ajuda e tudo parece pesado.", 6000, "manuscrito");
    expect(cues[0]!.text).toBe("PORQUE EU SOU CONTIGO,");
    for (const c of cues) {
      expect(c.text.split(" ").length).toBeLessThanOrEqual(6);
      expect(c.text.length).toBeLessThanOrEqual(22);
    }
    expect(buildCaptions("Você não precisa mudar tudo hoje.", 3000, "manuscrito").map((c) => c.text)).toEqual(["VOCÊ NÃO PRECISA MUDAR", "TUDO HOJE."]);
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[cues.length - 1]!.endMs).toBe(6000);
    expect(buildCaptions("x", 1000, "nenhuma")).toEqual([]);
  });
  it("não monta sem todas as partes", () => {
    expect(() => buildEditPlan({ segments: segs, takes: takes.slice(0, 3), signature: "x" })).toThrow(/Faltam partes: 4, 5, 6/);
  });
  it("take muito curto não é aparado", () => {
    const p = buildEditPlan({ segments: segs.slice(0, 1), takes: [{ segmentIndex: 0, takeId: "a", durationMs: 700 }], signature: "x" });
    expect(p.clips[0]).toMatchObject({ trimStartMs: 0, durationMs: 700 });
  });
});
