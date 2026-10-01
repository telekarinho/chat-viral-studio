import { describe, expect, it } from "vitest";
import { engagementRate, metricsInsights, parseMetric, type PostMetrics } from "../src";

const m = (views: number, likes = 0): PostMetrics => ({ views, likes, comments: 0, shares: 0, saves: 0, updatedAt: "2026-09-30T00:00:00Z" });

describe("números dos posts", () => {
  it("entende o jeito que a pessoa digita", () => {
    expect(parseMetric("1.200")).toBe(1200);
    expect(parseMetric("1,200")).toBe(1200);
    expect(parseMetric("3k")).toBe(3000);
    expect(parseMetric("2,5 mil")).toBe(2500);
    expect(parseMetric("1.5M")).toBe(1_500_000);
    expect(parseMetric("")).toBe(0);
    expect(parseMetric("abc")).toBeNull();
    expect(parseMetric("-5")).toBeNull();
  });
  it("engajamento sem dividir por zero", () => {
    expect(engagementRate(m(0, 10))).toBe(0);
    expect(engagementRate(m(100, 10))).toBeCloseTo(0.1);
  });
  it("mostra o tema que mais funciona e só dá dica com dados suficientes", () => {
    const items = [
      { id: "a", title: "A", pillarSlug: "familia", metrics: m(1000, 50) },
      { id: "b", title: "B", pillarSlug: "familia", metrics: m(3000, 90) },
      { id: "c", title: "C", pillarSlug: "academia", metrics: m(500, 5) },
    ];
    const r = metricsInsights(items, (s) => (s === "familia" ? "Família" : s));
    expect(r.posts).toBe(3);
    expect(r.totalViews).toBe(4500);
    expect(r.best?.id).toBe("b");
    expect(r.byPillar.map((p) => [p.pillarSlug, p.avgViews])).toEqual([["familia", 2000], ["academia", 500]]);
    expect(r.tip).toContain("Família");
    expect(metricsInsights(items.slice(0, 2)).tip).toBeNull();
    expect(metricsInsights([]).best).toBeNull();
  });
});

describe("envios por alcance", () => {
  it("compartilhamentos a cada mil visualizações", async () => {
    const { sharesPer1k } = await import("../src");
    expect(sharesPer1k({ views: 2000, shares: 10 })).toBe(5);
    expect(sharesPer1k({ views: 0, shares: 3 })).toBe(0);
  });
});
