import { describe, expect, it } from "vitest";
import { BUSINESS_PILLARS, RODRIGO_PILLARS, RODRIGO_PROFILE, ScenesSchema, buildAss, buildDayPlan, buildEditPlan, buildSegments, businessRoutine, directionIssues, generateLocal, parseDraft, rodrigoRoutine, type ContentDraft } from "../src";

const base = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "main_video", eventText: null, recent: [] }).draft;
const direcao = {
  takes: [
    { ordem: 1, nome: "Gancho", fala_exata: "Ninguém te conta isso sobre ter 40.", duracao_segundos: 4, enquadramento: "close no rosto", luz: "janela de frente", olhar: "na lente", erro_comum: "olhar a tela" },
    { ordem: 2, nome: "Virada", fala_exata: "Mas foi aí que eu entendi o que importa de verdade.", duracao_segundos: 8 },
    { ordem: 3, nome: "Cena da rua", duracao_segundos: 3, broll: "pés andando na calçada" },
    { ordem: 4, nome: "Chamada", fala_exata: "Manda pra alguém que precisa ouvir isso.", duracao_segundos: 5 },
  ],
  legendas_na_tela: [{ texto: "Vida real 40+", inicio: 0, fim: 3 }],
  musica: { id: "mixkit-839", volume: 0.3, entrada: 2, saida: 20 },
  capa: { frame: 1.5, texto: "Aos 40" },
  publicacao_por_rede: [{ rede: "instagram", horario: "19:30", hashtags: ["#vidareal"], primeiro_comentario: "E você?" }],
  teste_ab: { ganchos: ["Ninguém te conta isso sobre ter 40.", "Eu achei que aos 40 estaria pronto."] },
};

function withDirection(extra: Record<string, unknown> = {}): ContentDraft {
  const r = parseDraft({ ...base, direcao: { ...direcao, ...extra } });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.draft;
}

describe("direção completa do diretor", () => {
  it("o contrato aceita a direção e preenche o que faltou com o padrão", () => {
    const d = withDirection().direcao!;
    expect(d.takes[1]!.luz).toBe("");
    expect(d.legendas_na_tela[0]!.posicao).toBe("topo");
    expect(d.musica).toMatchObject({ id: "mixkit-839", volume: 0.3, entrada: 2, saida: 20, bpm: null });
    expect(parseDraft({ ...base }).ok).toBe(true); // continua opcional
  });

  it("grava take por take: só os takes com fala, na ordem, com a instrução de cada um e o fechamento no fim", () => {
    const segs = buildSegments(withDirection(), { selectedHook: 0, userEdited: false, closingPhrase: "E se der certo!" });
    expect(segs.map((s) => s.label)).toEqual(["Take 1 — Gancho", "Take 2 — Virada", "Take 4 — Chamada", "Fechamento"]);
    expect(segs.map((s) => s.role)).toEqual(["hook", "free", "cta", "closing"]);
    expect(segs[0]!.direction).toEqual([
      { label: "Enquadramento", value: "close no rosto" }, { label: "Luz", value: "janela de frente" },
      { label: "Olhar", value: "na lente" }, { label: "Cuidado", value: "olhar a tela" },
    ]);
  });

  it("aponta o que impede gravar/montar: música inexistente, ordem repetida, texto com fim antes do início", () => {
    const bad = withDirection({
      musica: { id: "faixa-qualquer" }, legendas_na_tela: [{ texto: "x", inicio: 5, fim: 2 }],
      takes: [...direcao.takes, { ordem: 1, nome: "dup", fala_exata: "Outra fala aqui", duracao_segundos: 2 }],
    }).direcao!;
    const issues = directionIssues(bad, { durationSeconds: 60, spoken: true, business: false }).join(" | ");
    expect(issues).toMatch(/ordem diferente/);
    expect(issues).toMatch(/não existe na biblioteca/);
    expect(issues).toMatch(/fim precisa ser depois/);
    expect(directionIssues(withDirection().direcao!, { durationSeconds: 60, spoken: true, business: true })).toEqual([]);
  });

  it("texto na tela da direção vai para a legenda (no lugar do gancho automático)", () => {
    const seg = buildSegments(withDirection(), { selectedHook: 0, userEdited: false, closingPhrase: "" });
    const plan = buildEditPlan({
      segments: seg, takes: seg.map((s) => ({ segmentIndex: s.index, takeId: `t${s.index}`, durationMs: 4000 })), signature: "",
      hookText: "GANCHO AUTOMÁTICO", overlays: [{ text: "Vida real 40+", startMs: 0, endMs: 3000, position: "centro" }],
    });
    const ass = buildAss(plan);
    expect(plan.hookText).toBeNull();
    expect(ass).toContain("{\\an5\\fad(120,200)}VIDA REAL 40+");
    expect(ass).not.toContain("GANCHO AUTOMÁTICO");
  });
});

describe("plano da empresa com cena de apoio dirigida", () => {
  it("o B-roll de prova visual vira conteúdo (sem entrar no rodízio de temas); perfil pessoal continua só com missões", () => {
    let n = 0;
    const newId = () => `id-${++n}`;
    const biz = buildDayPlan({ date: new Date(0), dateKey: "2026-10-05", utcOffsetMinutes: -180, workspaceId: "w", routine: businessRoutine(newId), pillars: BUSINESS_PILLARS, recentPillarSlugs: [], newId, now: "x", directedBroll: true });
    expect(biz.contentItems.map((c) => [c.format, c.title, c.pillarSlug])).toEqual([["main_video", "Vídeo principal", expect.any(String)], ["broll", "Prova visual / B-roll do produto", "demonstracao"]]);
    expect(biz.tasks.find((t) => t.kind === "broll")!.contentItemId).toBe(biz.contentItems[1]!.id);
    const pessoal = buildDayPlan({ date: new Date(0), dateKey: "2026-10-05", utcOffsetMinutes: -180, workspaceId: "w", routine: rodrigoRoutine(newId), pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now: "x" });
    expect(pessoal.contentItems.map((c) => c.format)).toEqual(["thought", "main_video"]);
    expect(ScenesSchema.safeParse([{ ordem: 1, nome: "Close", duracao_segundos: 3 }]).success).toBe(true);
  });
});
