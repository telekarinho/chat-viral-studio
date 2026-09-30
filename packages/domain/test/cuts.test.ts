import { describe, expect, it } from "vitest";
import { assignBroll, buildAss, buildEditPlan, planCuts, repeatedStarts, withClips, type EditClip, type ScriptSegment, type SpokenWord } from "../src";

/** palavras em sequência; `|N` depois de uma palavra = pausa de N ms */
function speak(s: string, startMs = 0, stepMs = 300): SpokenWord[] {
  let t = startMs;
  return s.split(" ").map((tok) => {
    const [text, pause] = tok.split("|");
    const w = { text: text!, startMs: t, endMs: t + stepMs - 40 };
    t += stepMs + Number(pause ?? 0);
    return w;
  });
}
const total = (r: { startMs: number; endMs: number }[]) => r.reduce((a, x) => a + x.endMs - x.startMs, 0);

describe("corte automático de erros de gravação", () => {
  it("tira o silêncio do começo e do fim", () => {
    const r = planCuts(speak("hoje eu escolhi não desistir", 1500), 6000);
    expect(r.keep).toHaveLength(1);
    expect(r.keep[0]!.startMs).toBe(1350);
    expect(r.keep[0]!.endMs).toBeLessThan(3400);
    expect(r.removedMs).toBeGreaterThan(3000);
    expect(r.words[0]!.startMs).toBe(150); // legenda acompanha o corte
  });

  it("encurta pausa longa no meio, deixando um respiro", () => {
    const r = planCuts(speak("eu parei|2500 e pensei bem", 0), 5000);
    expect(r.pauses).toBe(1);
    expect(r.keep).toHaveLength(2);
    const gapLeft = r.words[2]!.startMs - r.words[1]!.endMs;
    expect(gapLeft).toBeGreaterThan(200);
    expect(gapLeft).toBeLessThan(500);
  });

  it("falso começo: frase repetida em seguida fica só a última", () => {
    const w = speak("hoje eu quero|900 hoje eu quero falar de constância", 0);
    expect([...repeatedStarts(w)]).toEqual([0, 1, 2]);
    const r = planCuts(w, 4000);
    expect(r.repeats).toBe(1);
    expect(r.words.map((x) => x.text).join(" ")).toBe("hoje eu quero falar de constância");
  });

  it("não corta repetição de ênfase curta nem fala normal", () => {
    expect(repeatedStarts(speak("não não é assim que funciona")).size).toBe(0);
    const r = planCuts(speak("olha isso aqui que coisa boa", 100), 2200);
    expect(r.keep).toHaveLength(1);
    expect(r.repeats + r.pauses + r.fillers).toBe(0);
  });

  it("tira muletas (ahn, hum)", () => {
    const r = planCuts(speak("então ahn eu decidi hum continuar"), 3000);
    expect(r.fillers).toBe(2);
    expect(r.words.map((x) => x.text).join(" ")).toBe("então eu decidi continuar");
  });

  it("sem fala reconhecida não corta nada", () => {
    expect(planCuts([], 4000).keep).toEqual([{ startMs: 0, endMs: 4000 }]);
  });

  it("os trechos nunca se sobrepõem nem passam do clipe", () => {
    const r = planCuts(speak("um dois|1200 três ahn quatro quatro cinco cinco seis|3000 sete", 200), 9000);
    for (let i = 0; i < r.keep.length; i++) {
      expect(r.keep[i]!.endMs).toBeGreaterThan(r.keep[i]!.startMs);
      expect(r.keep[i]!.endMs).toBeLessThanOrEqual(9000);
      if (i) expect(r.keep[i]!.startMs).toBeGreaterThanOrEqual(r.keep[i - 1]!.endMs);
    }
    expect(r.words.at(-1)!.endMs).toBeLessThanOrEqual(total(r.keep));
  });
});

describe("B-roll, gancho na tela e recálculo do plano", () => {
  const seg = (index: number, role: ScriptSegment["role"], text: string): ScriptSegment => ({ index, role, label: role, text });
  const segments = [seg(0, "hook", "Você não precisa mudar tudo hoje."), seg(1, "e", "A gente acorda achando que precisa virar outra pessoa."), seg(2, "mas", "Mudança chega aos poucos."), seg(3, "por_isso", "Escolhe uma coisa hoje e faz.")];
  const plan = buildEditPlan({ segments, signature: "RodrigoSerra.me", hookText: "Uma coisa hoje", takes: [3000, 7000, 3500, 6000].map((durationMs, i) => ({ segmentIndex: i, takeId: `t${i}`, durationMs })) });

  it("cena de apoio entra só em partes longas de contexto/aprendizado, depois que o rosto abre", () => {
    const clips = assignBroll(plan.clips, [{ takeId: "cafe", durationMs: 4000 }, { takeId: "treino", durationMs: 2500 }, { takeId: "curta", durationMs: 800 }]);
    expect(clips.map((c) => c.broll?.takeId ?? null)).toEqual([null, "cafe", null, "treino"]);
    const b = clips[1]!.broll!;
    expect(b.atMs).toBeGreaterThan(1500);
    expect(b.atMs + b.durationMs).toBeLessThan(clips[1]!.durationMs);
    expect(clips[3]!.broll!.durationMs).toBeLessThanOrEqual(2200);
  });

  it("depois dos cortes, transições e duração total são recalculadas", () => {
    const shorter: EditClip[] = plan.clips.map((c, i) => (i === 1 ? { ...c, durationMs: 4000, keep: [{ startMs: 250, endMs: 4250 }] } : c));
    const p = withClips(plan, shorter);
    expect(p.totalMs).toBe(shorter.reduce((a, c) => a + c.durationMs, 0) - p.transitions!.reduce((a, t) => a + t.durationMs, 0));
    expect(p.totalMs).toBeLessThan(plan.totalMs);
  });

  it("gancho aparece nos 3 primeiros segundos, mesmo sem legenda", () => {
    const ass = buildAss({ ...plan, captionStyle: "nenhuma" });
    expect(ass).toMatch(/Dialogue: 1,0:00:00\.00,0:00:03\.00,gancho,,0,0,0,,\{\\fad\(120,200\)\}UMA COISA HOJE/);
    expect(buildAss({ ...plan, hookText: null, captionStyle: "nenhuma" })).not.toContain("Dialogue");
  });
});
