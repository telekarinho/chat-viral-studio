import { describe, expect, it } from "vitest";
import { MUSIC_LIBRARY, assColor, buildAss, captionSpot, cuesFromWords, moodForPillar, pickTrack, type EditClip, type SpokenWord } from "../src";

const words = (s: string, startMs = 0, stepMs = 300, pauseAfter: Record<number, number> = {}): SpokenWord[] => {
  let t = startMs;
  return s.split(" ").map((w, i) => {
    const out = { text: w, startMs: t, endMs: t + stepMs - 40 };
    t += stepMs + (pauseAfter[i] ?? 0);
    return out;
  });
};

describe("legenda sincronizada com a fala", () => {
  it("agrupa em frases curtas de 1 linha, quebra em pontuação e em pausa", () => {
    const cues = cuesFromWords(words("porque eu sou contigo... e você sabe disso agora", 500, 300, { 4: 600 }), "manuscrito", 10_000);
    expect(cues[0]).toMatchObject({ text: "PORQUE EU SOU CONTIGO...", startMs: 500 });
    expect(cues.every((c) => c.text.length <= 26)).toBe(true);
    expect(cues[1]!.startMs).toBeGreaterThanOrEqual(cues[0]!.endMs);
    // a legenda começa quando a pessoa FALA (não no início do clipe)
    expect(cues[0]!.words![0]!.startMs).toBe(500);
  });

  it("limpo mantém caixa normal; nenhuma não gera nada", () => {
    expect(cuesFromWords(words("Olha isso aqui"), "limpo", 5000)[0]!.text).toBe("Olha isso aqui");
    expect(cuesFromWords(words("Olha isso aqui"), "nenhuma", 5000)).toEqual([]);
  });

  it("não passa do fim do clipe", () => {
    const cues = cuesFromWords(words("uma frase final", 0, 400), "destaque", 1000);
    expect(cues.at(-1)!.endMs).toBeLessThanOrEqual(1000);
  });
});

describe("arquivo ASS", () => {
  const clip = (captions: EditClip["captions"], durationMs: number): EditClip => ({
    segmentIndex: 0, role: "hook", takeId: "t", sourceDurationMs: durationMs, trimStartMs: 0, trimEndMs: 0, durationMs,
    effect: { kind: "hold", fromScale: 1, toScale: 1, moveMs: 0 }, captions,
  });
  const c1 = cuesFromWords(words("porque eu sou contigo", 200), "manuscrito", 3000);
  const c2 = cuesFromWords(words("e se der certo!", 100), "manuscrito", 2000);

  it("manuscrito: creme do print, contorno, tempos globais depois de juntar as partes", () => {
    const ass = buildAss({ clips: [clip(c1, 3000), clip(c2, 2000)], captionStyle: "manuscrito", width: 1080, height: 1920 });
    expect(ass).toContain("Style: manuscrito,Covered By Your Grace,118,&H00CFE6F3");
    expect(ass).toContain("PlayResY: 1920");
    // entra com "pop" (92% → 100%), em caixa alta; sem rosto detectado: terço de baixo (66% da altura)
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.20,[^,]+,manuscrito,,0,0,0,,\{\\an8\\pos\(540,1373\)\\fad\(70,50\)\\fscx92\\fscy92\\t\(0,140,\\fscx100\\fscy100\)\}PORQUE EU SOU CONTIGO/);
    // rosto até 80% da altura: legenda logo abaixo do queixo e menor para caber antes da assinatura
    const face = buildAss({ clips: [{ ...clip(c1, 3000), faceBottom: 0.8 }], captionStyle: "manuscrito", width: 1080, height: 1920 });
    expect(captionSpot(0.8, "manuscrito")).toEqual({ top: 0.771, scale: 0.6 });
    expect(face).toContain("{\\an8\\pos(540,1480)\\fad(70,50)\\fscx55\\fscy55\\t(0,140,\\fscx60\\fscy60)}");
    expect(captionSpot(0.55, "manuscrito")).toEqual({ top: 0.56, scale: 1 });
    // 2ª parte começa em 3.000s + 0.100s
    expect(ass).toMatch(/Dialogue: 0,0:00:03\.10,/);
    // com transição de 300ms, a 2ª parte entra 0.3s antes — a legenda acompanha
    const withT = buildAss({ clips: [clip(c1, 3000), clip(c2, 2000)], transitions: [{ kind: "fade", durationMs: 300 }], captionStyle: "manuscrito", width: 1080, height: 1920 });
    expect(withT).toMatch(/Dialogue: 0,0:00:02\.80,/);
  });

  it("destaque: uma linha por palavra, a falada acende na cor do tema", () => {
    const d = cuesFromWords(words("olha isso aqui", 0), "destaque", 3000);
    const ass = buildAss({ clips: [clip(d, 3000)], captionStyle: "destaque", width: 1080, height: 1920, accentColor: "#FFD23F" });
    const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue"));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`{\\c${assColor("#FFD23F")}\\fscx110\\fscy110}ISSO{`);
  });

  it("texto do usuário não injeta comando ASS", () => {
    const ass = buildAss({ clips: [clip([{ startMs: 0, endMs: 1000, text: "A {\\b1} B\\N" }], 1000)], captionStyle: "limpo", width: 1080, height: 1920 });
    expect(ass).not.toContain("{\\b1}");
    expect(ass).toContain("A (/b1) B/N");
  });
});

describe("música de fundo", () => {
  it("todas as faixas têm licença de uso em vídeo, sha256 e clima", () => {
    expect(MUSIC_LIBRARY.length).toBeGreaterThanOrEqual(14);
    for (const t of MUSIC_LIBRARY) {
      expect(t.url).toMatch(/^https:\/\/assets\.mixkit\.co\/music\/\d+\/\d+\.mp3$/);
      expect(t.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it("clima automático pelo pilar e escolha estável por vídeo", () => {
    expect(moodForPillar("academia")).toBe("treino");
    expect(moodForPillar("reflexao")).toBe("reflexao");
    expect(moodForPillar("familia")).toBe("familia");
    expect(moodForPillar("demonstracao", true)).toBe("empresa");
    expect(pickTrack("treino", "conteudo-1").id).toBe(pickTrack("treino", "conteudo-1").id);
    expect(pickTrack("treino", "x").mood).toBe("treino");
  });
});
