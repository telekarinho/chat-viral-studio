import { describe, expect, it } from "vitest";
import { RODRIGO_PILLARS, buildDayPlan, rodrigoRoutine, type RoutineBlock } from "../src";

let n = 0;
const newId = () => `id-${++n}`;
const now = "2026-10-03T12:00:00Z";

describe("plano do dia: fim de semana e prova diária", () => {
  it("sábado sem rotina (pessoal): um Pensamento do Dia opcional", () => {
    const p = buildDayPlan({ date: new Date(0), dateKey: "2026-10-03", utcOffsetMinutes: -180, workspaceId: "ws", routine: rodrigoRoutine(newId), pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now, lightDay: true });
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0]).toMatchObject({ kind: "thought", optional: true });
    expect(p.contentItems.map((c) => c.format)).toEqual(["thought"]);
    // sem a opção (empresa): fim de semana continua livre
    expect(buildDayPlan({ date: new Date(0), dateKey: "2026-10-03", utcOffsetMinutes: -180, workspaceId: "ws", routine: rodrigoRoutine(newId), pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now }).tasks).toHaveLength(0);
  });

  it("empresa com rotina só de vídeo na segunda: ganha a cena de prova visual do dia", () => {
    const routine: RoutineBlock[] = [{ id: "b1", weekday: 1, startTime: "11:00", title: "Vídeo de venda", contentHint: "", optional: false, format: "main_video" }];
    const p = buildDayPlan({ date: new Date(0), dateKey: "2026-10-05", utcOffsetMinutes: -180, workspaceId: "ws", routine, pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now, directedBroll: true });
    expect(p.contentItems.map((c) => c.format)).toEqual(["main_video", "broll"]);
    expect(p.tasks.find((t) => t.kind === "broll")).toMatchObject({ optional: false, title: "Prova visual / B-roll do produto" });
  });
});
