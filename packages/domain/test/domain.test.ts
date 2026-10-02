import { describe, expect, it } from "vitest";
import {
  RODRIGO_PILLARS, RODRIGO_PROFILE, applyTaskAction, availablePresets, buildDayPlan, buildManualPrompt, canDeleteLocal, checkRepetition,
  computeProgress, contentDraftJsonSchema, finalizeDraft, fingerprintsFor, generateLocal, initialTeleprompter, nextTask, parseDraft,
  parseManualResponse, pickFormat, pickNextPillar, pillarBalance, recoverAfterRestart, rodrigoRoutine, similarity, teleprompterReducer,
  validatePillarTargets, applySyncEvent, isDue, type MediaRecord, type RecordingTask, type Fingerprint,
} from "../src";

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const NOW = "2026-09-28T12:00:00.000Z";

describe("pilares", () => {
  it("seed do Rodrigo soma 100% e é válido", () => {
    expect(validatePillarTargets(RODRIGO_PILLARS)).toEqual([]);
    expect(RODRIGO_PILLARS.map((p) => p.targetPercent)).toEqual([40, 20, 15, 10, 10, 5]);
  });
  it("rejeita soma diferente de 100 e duplicados", () => {
    const errs = validatePillarTargets([...RODRIGO_PILLARS.slice(0, 5), { slug: "humor", name: "Humor", targetPercent: 10 }]);
    expect(errs.some((e) => e.includes("duplicado"))).toBe(true);
    expect(validatePillarTargets([{ slug: "a", name: "A", targetPercent: 60 }])[0]).toMatch(/somam 60/);
  });
  it("escolhe o pilar mais atrasado e converge para os percentuais", () => {
    expect(pickNextPillar(RODRIGO_PILLARS, []).slug).toBe("reflexao");
    const history: string[] = [];
    for (let i = 0; i < 100; i++) history.push(pickNextPillar(RODRIGO_PILLARS, history).slug);
    const bal = pillarBalance(RODRIGO_PILLARS, history);
    for (const b of bal) expect(Math.abs(b.actualPercent - b.targetPercent)).toBeLessThanOrEqual(1);
  });
  it("respeita exclusão (pensamento e vídeo principal com pilares diferentes)", () => {
    expect(pickNextPillar(RODRIGO_PILLARS, [], ["reflexao"]).slug).toBe("vida-real");
  });
});

function task(over: Partial<RecordingTask> = {}): RecordingTask {
  return { id: newId(), workspaceId: "ws", contentItemId: null, scheduledFor: "2026-09-28T13:30:00.000Z", title: "Pensamento do Dia", kind: "thought", hint: null, suggestedDurationSeconds: 12, optional: false, status: "pending", notes: null, takeId: null, supersededBy: null, updatedAt: NOW, ...over };
}

describe("ciclo de vida das tarefas", () => {
  it("FEITO anexa take e registra evento", () => {
    const t = task();
    const r = applyTaskAction(t, { type: "done", takeId: "take-1" }, { now: NOW, newId });
    expect(r.task.status).toBe("done");
    expect(r.task.takeId).toBe("take-1");
    expect(r.event).toMatchObject({ fromStatus: "pending", toStatus: "done", action: "done" });
    expect(t.status).toBe("pending"); // imutável
  });
  it("PULAR e NÃO ACONTECEU", () => {
    expect(applyTaskAction(task(), { type: "skip" }, { now: NOW, newId }).task.status).toBe("skipped");
    expect(applyTaskAction(task(), { type: "did_not_happen", reason: "choveu" }, { now: NOW, newId }).task.notes).toBe("choveu");
  });
  it("REMARCAR cria nova tarefa pendente no novo horário", () => {
    const r = applyTaskAction(task(), { type: "reschedule", to: "2026-09-28T20:00:00.000Z" }, { now: NOW, newId });
    expect(r.task.status).toBe("rescheduled");
    expect(r.spawned).toMatchObject({ status: "pending", scheduledFor: "2026-09-28T20:00:00.000Z" });
    expect(r.task.supersededBy).toBe(r.spawned!.id);
    expect(() => applyTaskAction(task(), { type: "reschedule", to: "x" }, { now: NOW, newId })).toThrow();
  });
  it("USAR OUTRA CENA troca a cena mantendo histórico", () => {
    const r = applyTaskAction(task({ title: "Academia" }), { type: "alternate_scene", scene: "Caminhada no parque" }, { now: NOW, newId });
    expect(r.task.status).toBe("alternate_scene");
    expect(r.spawned!.title).toBe("Caminhada no parque");
    expect(() => applyTaskAction(task(), { type: "alternate_scene", scene: "  " }, { now: NOW, newId })).toThrow();
  });
  it("não aplica ação em tarefa encerrada, mas permite desfazer", () => {
    const done = applyTaskAction(task(), { type: "done" }, { now: NOW, newId }).task;
    expect(() => applyTaskAction(done, { type: "skip" }, { now: NOW, newId })).toThrow();
    expect(applyTaskAction(done, { type: "reopen" }, { now: NOW, newId }).task.status).toBe("pending");
  });
  it("progresso não conta tarefas substituídas", () => {
    const a = task({ status: "done" });
    const b = task({ status: "rescheduled" });
    const c = task({ status: "pending" });
    const d = task({ status: "skipped" });
    const p = computeProgress([a, b, c, d]);
    expect(p).toMatchObject({ total: 3, done: 1, pending: 1, skipped: 1, percent: 33 });
    expect(p.label).toBe("1 de 3 missões feitas");
  });
  it("próxima tarefa = o que gravar agora", () => {
    const early = task({ scheduledFor: "2026-09-28T09:00:00.000Z" });
    const soon = task({ scheduledFor: "2026-09-28T12:30:00.000Z" });
    expect(nextTask([soon, early], new Date("2026-09-28T12:00:00Z"))!.id).toBe(soon.id);
    expect(nextTask([early], new Date("2026-09-28T23:00:00Z"))!.id).toBe(early.id);
    expect(nextTask([task({ status: "done" })], new Date())).toBeNull();
  });
});

describe("planejamento do dia", () => {
  const routine = rodrigoRoutine(newId);
  it("segunda-feira gera 10 missões com pensamento e vídeo principal vinculados", () => {
    const plan = buildDayPlan({ date: new Date(2026, 8, 28), workspaceId: "ws", routine, pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now: NOW });
    expect(plan.tasks).toHaveLength(10);
    expect(plan.contentItems.map((c) => c.format)).toEqual(["thought", "main_video"]);
    expect(plan.contentItems[0]!.pillarSlug).not.toBe(plan.contentItems[1]!.pillarSlug);
    expect(new Date(plan.tasks[0]!.scheduledFor).getHours()).toBe(8);
    expect(plan.tasks.filter((t) => t.contentItemId).length).toBe(2);
  });
  it("domingo não tem rotina", () => {
    expect(buildDayPlan({ date: new Date(2026, 8, 27), workspaceId: "ws", routine, pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId, now: NOW }).tasks).toEqual([]);
  });
});

describe("contrato de IA", () => {
  const gen = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: [] });
  it("gera rascunho válido com 3 ganchos e E/MAS/POR ISSO", () => {
    expect(parseDraft(gen.draft).ok).toBe(true);
    expect(gen.draft.hook_options).toHaveLength(3);
    expect(gen.draft.narrative.e && gen.draft.narrative.mas && gen.draft.narrative.por_isso).toBeTruthy();
    expect(gen.meta).toMatchObject({ source: "local", prompt_version: "content-v1.3.0" });
  });
  it("fechamento 'E se der certo!' é exato e a assinatura aparece nas legendas", () => {
    expect(gen.draft.script.endsWith("E se der certo!")).toBe(true);
    for (const c of Object.values(gen.draft.caption)) expect(c).toContain("RodrigoSerra.me");
    const twice = finalizeDraft({ ...gen.draft, script: "texto\n\nE se der certo" }, RODRIGO_PROFILE);
    expect(twice.script).toBe("texto\n\nE se der certo!");
  });
  it("rejeita saída inválida da IA", () => {
    const bad = parseDraft({ ...gen.draft, hook_options: ["só um"] });
    expect(bad.ok).toBe(false);
    expect(parseDraft({ title: "x" }).ok).toBe(false);
  });
  it("JSON schema strict: sem keywords proibidas e additionalProperties=false", () => {
    const s = JSON.stringify(contentDraftJsonSchema());
    expect(s).not.toMatch(/minItems|maxLength|\$schema/);
    expect((contentDraftJsonSchema() as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });
  it("transforma acontecimento digitado em conteúdo", () => {
    const g = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "vida-real", pillarName: "Vida real", format: "main_video", eventText: "Meu carro quebrou no caminho do trabalho", recent: [] });
    expect(g.draft.narrative.e).toContain("Meu carro quebrou");
    expect(g.draft.structure).toBe("historia");
  });
  it("modo manual ChatGPT/Claude: prompt copiável e resposta colada validada", () => {
    const prompt = buildManualPrompt({ profile: RODRIGO_PROFILE, pillarName: "Humor", format: "thought", eventText: null, recentSummaries: [], avoid: "" });
    expect(prompt).toContain("E se der certo!");
    const pasted = "Claro! Aqui está:\n```json\n" + JSON.stringify({ ...gen.draft, script: "Roteiro colado do assistente" }) + "\n```";
    const r = parseManualResponse(pasted, RODRIGO_PROFILE);
    expect(r.ok && r.draft.script.endsWith("E se der certo!")).toBe(true);
    expect(parseManualResponse("sem json aqui", RODRIGO_PROFILE).ok).toBe(false);
  });
});

describe("anti-repetição", () => {
  it("similaridade detecta frase reaproveitada e ignora assunto diferente", () => {
    expect(similarity("Pequenas escolhas diárias que o futuro agradece", "as pequenas escolhas diarias que seu futuro agradece")).toBeGreaterThan(0.7);
    expect(similarity("treinar sem vontade", "presença em casa depois do trabalho")).toBeLessThan(0.2);
  });
  it("bloqueia assunto/frase/gancho/metáfora recentes e gera outro ângulo", () => {
    const first = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: [] });
    const memory: Fingerprint[] = fingerprintsFor(first.draft).map((f) => ({ ...f, contentItemId: "c1" }));
    const report = checkRepetition(fingerprintsFor(first.draft), memory);
    expect(new Set(report.hits.map((h) => h.type))).toEqual(new Set(["topic", "phrase", "metaphor", "hook"]));
    const second = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: memory });
    expect(second.draft.topic).not.toBe(first.draft.topic);
    expect(second.report.repeated).toBe(false);
    expect(second.notices.join(" ")).toMatch(/Evitei repetir/);
  });
  it("CTA e estrutura só contam quando excessivos", () => {
    const cta: Fingerprint = { type: "cta", value: "manda pra alguem que precisa ouvir isso hoje" };
    expect(checkRepetition([cta], [cta]).repeated).toBe(false);
    expect(checkRepetition([cta], [cta, cta]).hits[0]!.type).toBe("cta");
    const s = (id: string): Fingerprint => ({ type: "structure", value: "confissao", contentItemId: id });
    expect(checkRepetition([s("new")], [s("a"), s("b")]).repeated).toBe(false);
    expect(checkRepetition([s("new")], [s("a"), s("b"), s("c")]).hits[0]!.type).toBe("structure");
  });
});

describe("fila de sincronização", () => {
  const base: MediaRecord = { id: "m1", state: "local_only", sizeBytes: 1000, checksum: "abc", attempts: 0, nextAttemptAt: null, lastError: null, remoteVerifiedAt: null };
  const now = new Date("2026-09-28T12:00:00Z");
  it("fluxo feliz com verificação de integridade", () => {
    let r = applySyncEvent(base, { type: "enqueue" }, now);
    expect(isDue(r, now)).toBe(true);
    r = applySyncEvent(r, { type: "start" }, now);
    r = applySyncEvent(r, { type: "uploaded", remoteSize: 1000, remoteChecksum: "ABC" }, now);
    expect(r.state).toBe("uploaded_original");
    expect(r.remoteVerifiedAt).not.toBeNull();
  });
  it("integridade divergente volta para a fila com backoff", () => {
    let r = applySyncEvent(applySyncEvent(base, { type: "enqueue" }, now), { type: "start" }, now);
    r = applySyncEvent(r, { type: "uploaded", remoteSize: 999, remoteChecksum: null }, now);
    expect(r).toMatchObject({ state: "queued", attempts: 1 });
    expect(isDue(r, now)).toBe(false);
    expect(isDue(r, new Date(now.getTime() + 5_000))).toBe(true);
  });
  it("vai para dead letter após tentativas e permite retry manual", () => {
    let r: MediaRecord = { ...base, state: "queued" };
    for (let i = 0; i < 8; i++) r = applySyncEvent(applySyncEvent({ ...r, state: "queued" }, { type: "start" }, now), { type: "failed", error: "offline" }, now);
    expect(r.state).toBe("dead_letter");
    expect(applySyncEvent(r, { type: "retry" }, now)).toMatchObject({ state: "queued", attempts: 0 });
  });
  it("queda de rede não consome tentativa e a volta da conexão libera a fila", () => {
    let r: MediaRecord = { ...base, state: "queued" };
    for (let i = 0; i < 50; i++) r = applySyncEvent(applySyncEvent(r, { type: "start" }, now), { type: "interrupted", error: "offline" }, now);
    expect(r).toMatchObject({ state: "queued", attempts: 0 });
    expect(isDue(r, now)).toBe(false);
    expect(isDue(applySyncEvent(r, { type: "online" }, now), now)).toBe(true);
  });
  it("upload interrompido por kill volta à fila; original nunca é apagado antes da verificação", () => {
    expect(recoverAfterRestart({ ...base, state: "uploading" }, now).state).toBe("queued");
    expect(canDeleteLocal({ ...base, state: "queued" }, { allowCleanup: true, keepDays: 0 }, now)).toBe(false);
    const up = { ...base, state: "uploaded_original" as const, remoteVerifiedAt: "2026-09-01T00:00:00Z" };
    expect(canDeleteLocal(up, { allowCleanup: false, keepDays: 0 }, now)).toBe(false);
    expect(canDeleteLocal(up, { allowCleanup: true, keepDays: 7 }, now)).toBe(true);
  });
});

describe("teleprompter", () => {
  it("countdown, rolagem, pausa, reinício, avanço manual, fonte, velocidade, espelho", () => {
    let s = teleprompterReducer(initialTeleprompter, { type: "start" });
    expect(s.phase).toBe("countdown");
    s = teleprompterReducer(s, { type: "tick", dtMs: 3000, maxOffset: 500 });
    expect(s.phase).toBe("running");
    s = teleprompterReducer(s, { type: "tick", dtMs: 1000, maxOffset: 500 });
    expect(s.offset).toBeGreaterThan(0);
    s = teleprompterReducer(s, { type: "pause" });
    const frozen = teleprompterReducer(s, { type: "tick", dtMs: 1000, maxOffset: 500 });
    expect(frozen.offset).toBe(s.offset);
    s = teleprompterReducer(s, { type: "advance", px: 100, maxOffset: 500 });
    expect(s.offset).toBeCloseTo(frozen.offset + 100);
    s = teleprompterReducer(s, { type: "resume" });
    s = teleprompterReducer(s, { type: "tick", dtMs: 60_000, maxOffset: 500 });
    expect(s).toMatchObject({ phase: "finished", offset: 500 });
    s = teleprompterReducer(s, { type: "restart" });
    expect(s).toMatchObject({ phase: "idle", offset: 0 });
    expect(teleprompterReducer(s, { type: "setFontSize", value: 999 }).fontSize).toBe(64);
    expect(teleprompterReducer(s, { type: "setSpeed", value: 0 }).speed).toBe(1);
    expect(teleprompterReducer(s, { type: "toggleMirror" }).mirrored).toBe(true);
    expect(teleprompterReducer(teleprompterReducer(s, { type: "setCountdown", seconds: 0 }), { type: "start" }).phase).toBe("running");
  });
});

describe("câmera", () => {
  const formats = [
    { videoWidth: 1920, videoHeight: 1080, maxFps: 60 },
    { videoWidth: 2560, videoHeight: 1440, maxFps: 30 },
    { videoWidth: 1440, videoHeight: 1080, maxFps: 30 },
  ];
  it("só oferece 2K/4K se o aparelho suporta", () => {
    expect(availablePresets(formats)).toEqual(["1080p", "2k"]);
    expect(availablePresets([{ videoWidth: 1280, videoHeight: 720, maxFps: 30 }])).toEqual(["1080p"]);
  });
  it("escolhe formato 16:9 compatível com fps", () => {
    expect(pickFormat(formats, "1080p", 60)).toEqual(formats[0]);
    expect(pickFormat(formats, "2k", 30)).toEqual(formats[1]);
    expect(pickFormat(formats, "4k", 30)).toEqual(formats[1]);
  });
});

describe("plano feito no servidor (UTC) no fuso do criador", () => {
  it("quinta 01/10/2026 às 10:30 em Brasília = 13:30 UTC, e usa a rotina de quinta", async () => {
    const { buildDayPlan, rodrigoRoutine, RODRIGO_PILLARS, zonedDateTime, BRASILIA_OFFSET_MIN } = await import("../src");
    expect(zonedDateTime("2026-10-01", "10:30", BRASILIA_OFFSET_MIN).toISOString()).toBe("2026-10-01T13:30:00.000Z");
    let n = 0;
    const plan = buildDayPlan({ date: new Date(0), dateKey: "2026-10-01", utcOffsetMinutes: BRASILIA_OFFSET_MIN, workspaceId: "w", routine: rodrigoRoutine(() => `b${n++}`), pillars: RODRIGO_PILLARS, recentPillarSlugs: [], newId: () => `i${n++}`, now: "x" });
    expect(plan.date).toBe("2026-10-01");
    const thought = plan.tasks.find((t) => t.kind === "thought")!;
    expect(thought.scheduledFor).toBe("2026-10-01T13:30:00.000Z");
    expect(plan.contentItems.length).toBeGreaterThan(0);
  });
});
