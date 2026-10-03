import { describe, expect, it } from "vitest";
import { directorLearnings, type LearningPost } from "../src";

const p = (over: Partial<LearningPost>, views: number, shares: number, completion?: number): LearningPost => ({
  metrics: { views, likes: 0, comments: 0, shares, saves: 0, updatedAt: "x", ...(completion !== undefined ? { completionRate: completion } : {}) },
  tema: null, formato: null, duracaoS: null, estilo: null, musica: null, hora: null, gancho: null, ...over,
});

describe("o que o Diretor aprendeu", () => {
  it("poucos posts: nada de conclusão", () => {
    expect(directorLearnings([p({}, 100, 1), p({}, 100, 1)])).toEqual({ posts: 2, small: true, learnings: [] });
  });
  it("compara grupos com ≥2 posts, diz a amostra e não inventa causa", () => {
    const posts = [
      p({ tema: "Demonstração", duracaoS: 30 }, 1000, 20, 60), p({ tema: "Demonstração", duracaoS: 32 }, 1000, 18, 58),
      p({ tema: "Bastidor", duracaoS: 70 }, 1000, 4, 30), p({ tema: "Bastidor", duracaoS: 75 }, 1000, 5, 35),
      p({ tema: "Único", musica: "X" }, 1000, 50),
    ];
    const r = directorLearnings(posts);
    expect(r.posts).toBe(5);
    expect(r.small).toBe(true);
    expect(r.learnings.find((l) => l.dimensao === "tema")?.texto).toBe("Vídeos de Demonstração tiveram mais compartilhamentos nesta amostra (2 posts).");
    expect(r.learnings.find((l) => l.dimensao === "duração")?.texto).toMatch(/^Seus vídeos de 20 a 40 s \(roteiro\) tiveram mais/);
    // grupo de 1 post (música X) não vira aprendizado
    expect(r.learnings.some((l) => l.dimensao === "música")).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/viral|chance|%/);
  });
});
