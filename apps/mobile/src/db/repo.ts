import {
  applyTaskAction, buildDayPlan, toLocalDateKey, type ContentDraft, type ContentFormat, type CreatorProfile, type Fingerprint,
  type FingerprintType, type GenerationMeta, type MediaRecord, type MediaState, type Pillar, type RecordingTask, type ResolutionPreset,
  type RoutineBlock, type TaskAction, type TaskStatus, type ClipMeta, type ProjectInfo, type UseTarget, PRODUCTION_MODES, type EditChoices, type PostMetrics, watermarkCorner,
} from "@postai/domain";
import { config, newId, nowIso } from "../config";
import { getDb } from "./database";

export interface Settings {
  resolution: ResolutionPreset;
  fps: number;
  reminders: boolean;
  teleprompter: { fontSize: number; speed: number; mirrored: boolean; countdownSeconds: number };
  allowLocalCleanup: boolean;
  keepLocalDays: number;
}

export interface Workspace {
  id: string;
  name: string;
  cloud: boolean;
  profile: CreatorProfile;
  pillars: Pillar[];
  routine: RoutineBlock[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  resolution: "1080p",
  fps: 30,
  reminders: true,
  teleprompter: { fontSize: 30, speed: 3, mirrored: false, countdownSeconds: 3 },
  allowLocalCleanup: false,
  keepLocalDays: 30,
};

export interface ContentItem {
  id: string;
  workspaceId: string;
  date: string;
  format: ContentFormat;
  pillarSlug: string;
  title: string;
  status: "planned" | "scripted" | "recorded" | "published" | "done";
  scheduledFor: string;
  draft: ContentDraft | null;
  meta: (GenerationMeta & { scriptId: string; notices: string[]; userEdited: boolean }) | null;
  selectedHook: number | null;
  project?: ProjectInfo | null;
  derivedFrom?: string | null;
  precisaRevisao?: string | null;
  edit?: EditChoices | null;
  metrics?: PostMetrics | null;
  /** primeira vez que tocou em POSTAR e em quais redes */
  posted?: { at: string; to: string[] } | null;
}

export interface Take {
  id: string;
  workspaceId: string;
  taskId: string | null;
  contentItemId: string | null;
  mediaId: string;
  category: string;
  tags: string[];
  camera: "front" | "back" | null;
  favorite: boolean;
  segmentIndex: number | null;
  createdAt: string;
  meta: ClipMeta;
  media: MediaRow;
}

export interface MediaRow extends MediaRecord {
  workspaceId: string;
  localUri: string;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
}

// ---------- workspace (kv) ----------

// 'workspace' = the active profile; 'workspace:<id>' = every profile of this account (personal, company, product...)

const withDefaults = (ws: Workspace): Workspace => ({
  ...ws, settings: { ...DEFAULT_SETTINGS, ...ws.settings, teleprompter: { ...DEFAULT_SETTINGS.teleprompter, ...ws.settings?.teleprompter } },
});

export async function getWorkspace(): Promise<Workspace | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = 'workspace'");
  return row ? withDefaults(JSON.parse(row.value) as Workspace) : null;
}

/** Saves a profile and makes it the active one (activate=false refreshes another profile in the background). */
export async function saveWorkspace(ws: Workspace, activate = true): Promise<void> {
  const db = await getDb();
  const active = await getWorkspace();
  await db.withTransactionAsync(async () => {
    // installs from before multi-profile only have 'workspace': keep the old profile before replacing the active one
    if (active && active.id !== ws.id) await db.runAsync("INSERT OR IGNORE INTO kv(key, value) VALUES (?, ?)", `workspace:${active.id}`, JSON.stringify(active));
    await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", `workspace:${ws.id}`, JSON.stringify(ws));
    if (activate || !active || active.id === ws.id) await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES ('workspace', ?)", JSON.stringify(ws));
  });
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ value: string }>("SELECT value FROM kv WHERE key LIKE 'workspace:%'");
  const all = rows.map((r) => withDefaults(JSON.parse(r.value) as Workspace));
  const active = await getWorkspace();
  // installs from before multi-profile only have the active key
  if (active && !all.some((w) => w.id === active.id)) all.unshift(active);
  return all;
}

export async function workspaceById(id: string): Promise<Workspace> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", `workspace:${id}`);
  if (row) return withDefaults(JSON.parse(row.value) as Workspace);
  const active = await requireWorkspace();
  if (active.id !== id) throw new Error("Perfil não encontrado neste aparelho");
  return active;
}

export async function activateWorkspace(id: string): Promise<Workspace> {
  // camera/teleprompter/cleanup settings belong to the device, not to a profile
  const current = await getWorkspace();
  const ws = { ...(await workspaceById(id)), ...(current ? { settings: current.settings } : {}) };
  await saveWorkspace(ws, true);
  return ws;
}

/** Name, voice and sales strategy of the active profile. */
export async function updateProfile(profile: CreatorProfile, name: string): Promise<Workspace> {
  const ws = await requireWorkspace();
  const next = { ...ws, name, profile };
  await saveWorkspace(next);
  await enqueue(ws, "creator_profiles", ws.id, {
    onConflict: "workspace_id",
    rows: [{
      workspace_id: ws.id, display_name: profile.displayName, handle: profile.handle, positioning: profile.positioning, signature: profile.signature,
      closing_phrase: profile.closingPhrase, voice_rules: profile.voiceRules, tone: { kind: profile.kind ?? "pessoal", business: profile.business ?? null, watermark: watermarkCorner(profile.watermark) }, updated_at: nowIso(),
    }],
  });
  return next;
}

const activeId = async () => (await requireWorkspace()).id;

export async function updateSettings(patch: Partial<Settings>): Promise<Workspace> {
  const ws = await requireWorkspace();
  const next = { ...ws, settings: { ...ws.settings, ...patch } };
  await saveWorkspace(next);
  return next;
}

export async function updatePillars(pillars: Pillar[]): Promise<void> {
  const ws = await requireWorkspace();
  await saveWorkspace({ ...ws, pillars });
  await enqueue(ws, "content_pillars", ws.id, {
    onConflict: "workspace_id,slug",
    rows: pillars.map((p) => ({ workspace_id: ws.id, slug: p.slug, name: p.name, target_percent: p.targetPercent, active: p.active !== false })),
  });
}

export async function updateRoutineBlock(block: RoutineBlock): Promise<void> {
  const ws = await requireWorkspace();
  await saveWorkspace({ ...ws, routine: ws.routine.map((b) => (b.id === block.id ? block : b)) });
  await enqueue(ws, "routine_blocks", block.id, {
    rows: [{ id: block.id, workspace_id: ws.id, start_time: block.startTime, title: block.title, content_hint: block.contentHint, optional: block.optional }],
    update: true,
  });
}

export async function requireWorkspace(): Promise<Workspace> {
  const ws = await getWorkspace();
  if (!ws) throw new Error("Workspace não configurado");
  return ws;
}

// ---------- outbox (pushed to Supabase when online) ----------

export interface OutboxPayload {
  rows: Record<string, unknown>[];
  onConflict?: string;
  /** update-only (row must already exist remotely) */
  update?: boolean;
  /** delete rows matching column=value before inserting (e.g. fingerprints of a regenerated script) */
  replaceFor?: { column: string; value: string };
  /** plain insert (tables where the client has no update grant, e.g. patrimonio_envios) */
  insertOnly?: boolean;
}

export async function enqueue(ws: Workspace, table: string, rowId: string, payload: OutboxPayload): Promise<void> {
  if (!ws.cloud) return;
  const db = await getDb();
  await db.runAsync("INSERT INTO outbox(table_name, row_id, payload, created_at) VALUES (?, ?, ?, ?)", table, rowId, JSON.stringify(payload), nowIso());
}

export async function listOutbox(limit = 50) {
  const db = await getDb();
  return db.getAllAsync<{ seq: number; table_name: string; row_id: string; payload: string; attempts: number }>("SELECT * FROM outbox ORDER BY seq LIMIT ?", limit);
}

export async function deleteOutbox(seq: number) {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE seq = ?", seq);
}

export async function failOutbox(seq: number, error: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?", error.slice(0, 300), seq);
}

const STUCK_ATTEMPTS = 5;

/** Linhas recusadas pelo servidor repetidas vezes: precisam aparecer para o usuário, não ficar escondidas. */
export async function stuckOutbox(): Promise<{ count: number; table: string; error: string }> {
  const db = await getDb();
  const n = (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE attempts >= ?", STUCK_ATTEMPTS))?.n ?? 0;
  const first = n ? await db.getFirstAsync<{ table_name: string; last_error: string | null }>("SELECT table_name, last_error FROM outbox WHERE attempts >= ? ORDER BY seq LIMIT 1", STUCK_ATTEMPTS) : null;
  return { count: n, table: first?.table_name ?? "", error: first?.last_error ?? "" };
}

export async function outboxCount(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox"))?.n ?? 0;
}

// ---------- day plan & tasks ----------

type TaskRow = {
  id: string; workspace_id: string; date: string; content_item_id: string | null; scheduled_for: string; title: string; kind: string; hint: string | null;
  duration: number | null; optional: number; status: string; notes: string | null; take_id: string | null; superseded_by: string | null; updated_at: string;
};

const toTask = (r: TaskRow): RecordingTask => ({
  id: r.id, workspaceId: r.workspace_id, contentItemId: r.content_item_id, scheduledFor: r.scheduled_for, title: r.title, kind: r.kind as ContentFormat,
  hint: r.hint, suggestedDurationSeconds: r.duration, optional: r.optional === 1, status: r.status as TaskStatus, notes: r.notes, takeId: r.take_id,
  supersededBy: r.superseded_by, updatedAt: r.updated_at,
});

const taskServerRow = (t: RecordingTask) => ({
  id: t.id, workspace_id: t.workspaceId, content_item_id: t.contentItemId, scheduled_for: t.scheduledFor, title: t.title, kind: t.kind, hint: t.hint,
  suggested_duration_seconds: t.suggestedDurationSeconds, optional: t.optional, status: t.status, notes: t.notes, take_id: t.takeId,
  superseded_by: t.supersededBy, updated_at: t.updatedAt,
});

async function insertTask(t: RecordingTask) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO tasks(id, workspace_id, date, content_item_id, scheduled_for, title, kind, hint, duration, optional, status, notes, take_id, superseded_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    t.id, t.workspaceId, toLocalDateKey(new Date(t.scheduledFor)), t.contentItemId, t.scheduledFor, t.title, t.kind, t.hint, t.suggestedDurationSeconds,
    t.optional ? 1 : 0, t.status, t.notes, t.takeId, t.supersededBy, t.updatedAt,
  );
}

const planLocks = new Map<string, Promise<void>>();

/** Creates today's missions from the routine once per day (idempotent, works offline). */
export async function ensureDayPlan(date: Date): Promise<void> {
  const key = toLocalDateKey(date);
  const lockKey = `${await activeId()}:${key}`;
  const existing = planLocks.get(lockKey);
  if (existing) return existing;
  const p = (async () => {
    const db = await getDb();
    const ws = await requireWorkspace();
    const done = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", `plan:${ws.id}:${key}`);
    const hasTasks = await db.getFirstAsync<{ id: string }>("SELECT id FROM tasks WHERE workspace_id = ? AND date = ? LIMIT 1", ws.id, key);
    if (done || hasTasks) return;
    const recent = await db.getAllAsync<{ pillar_slug: string }>("SELECT pillar_slug FROM content_items WHERE workspace_id = ? ORDER BY date DESC LIMIT 30", ws.id);
    const plan = buildDayPlan({ date, workspaceId: ws.id, routine: ws.routine, pillars: ws.pillars, recentPillarSlugs: recent.map((r) => r.pillar_slug).reverse(), newId, now: nowIso(),
      // E2E builds only: CI may run on a weekend, when Rodrigo's routine is empty
      weekdayOverride: config.e2e && (date.getDay() === 0 || date.getDay() === 6) ? 1 : undefined });
    await db.withTransactionAsync(async () => {
      for (const c of plan.contentItems) {
        await db.runAsync(
          "INSERT INTO content_items(id, workspace_id, date, format, pillar_slug, title, status, scheduled_for, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
          c.id, c.workspaceId, c.date, c.format, c.pillarSlug, c.title, c.status, c.scheduledFor, nowIso(),
        );
      }
      for (const t of plan.tasks) await insertTask(t);
      await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, '1')", `plan:${ws.id}:${key}`);
    });
    for (const c of plan.contentItems) await enqueue(ws, "content_items", c.id, { rows: [contentServerRow({ ...c, draft: null, meta: null, selectedHook: null })] });
    for (const t of plan.tasks) await enqueue(ws, "recording_tasks", t.id, { rows: [taskServerRow(t)] });
  })().finally(() => planLocks.delete(lockKey));
  planLocks.set(lockKey, p);
  return p;
}

export async function listTasks(dateKey: string): Promise<RecordingTask[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TaskRow>("SELECT * FROM tasks WHERE date = ? AND workspace_id = ? ORDER BY scheduled_for", dateKey, await activeId());
  return rows.map(toTask);
}

export async function getTask(id: string): Promise<RecordingTask | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);
  return r ? toTask(r) : null;
}

export async function runTaskAction(taskId: string, action: TaskAction): Promise<RecordingTask> {
  const task = await getTask(taskId);
  if (!task) throw new Error("Tarefa não encontrada");
  const ws = await workspaceById(task.workspaceId);
  const tr = applyTaskAction(task, action, { now: nowIso(), newId });
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (tr.spawned) await insertTask(tr.spawned);
    await insertTask(tr.task);
    await db.runAsync("INSERT INTO task_events(id, task_id, json, created_at) VALUES (?,?,?,?)", tr.event.id, task.id, JSON.stringify(tr.event), tr.event.createdAt);
  });
  // spawned first: the original references it through superseded_by
  if (tr.spawned) await enqueue(ws, "recording_tasks", tr.spawned.id, { rows: [taskServerRow(tr.spawned)] });
  await enqueue(ws, "recording_tasks", tr.task.id, { rows: [taskServerRow(tr.task)] });
  await enqueue(ws, "task_events", tr.event.id, {
    rows: [{ id: tr.event.id, workspace_id: ws.id, task_id: task.id, action: tr.event.action, from_status: tr.event.fromStatus, to_status: tr.event.toStatus, payload: tr.event.payload, created_at: tr.event.createdAt }],
  });
  return tr.task;
}

// ---------- content ----------

type ContentRow = {
  id: string; workspace_id: string; date: string; format: string; pillar_slug: string; title: string; status: string; scheduled_for: string;
  draft: string | null; meta: string | null; selected_hook: number | null;
  project?: string | null; derived_from?: string | null; precisa_revisao?: string | null; edit?: string | null; metrics?: string | null; posted?: string | null;
};

const toContent = (r: ContentRow): ContentItem => ({
  id: r.id, workspaceId: r.workspace_id, date: r.date, format: r.format as ContentFormat, pillarSlug: r.pillar_slug, title: r.title,
  status: r.status as ContentItem["status"], scheduledFor: r.scheduled_for, draft: r.draft ? JSON.parse(r.draft) : null,
  meta: r.meta ? JSON.parse(r.meta) : null, selectedHook: r.selected_hook,
  project: r.project ? JSON.parse(r.project) : null, derivedFrom: r.derived_from ?? null, precisaRevisao: r.precisa_revisao ?? null,
  edit: r.edit ? JSON.parse(r.edit) : null,
  metrics: r.metrics ? JSON.parse(r.metrics) : null,
  posted: r.posted ? JSON.parse(r.posted) : null,
});

const contentServerRow = (c: Omit<ContentItem, "draft" | "meta"> & { draft: ContentDraft | null; meta: ContentItem["meta"] }) => ({
  id: c.id, workspace_id: c.workspaceId, pillar_slug: c.pillarSlug, plan_date: c.date, scheduled_for: c.scheduledFor, format: c.format,
  title: c.title, duration_seconds: c.draft?.duration_seconds ?? null, status: c.status, structured_payload: { selected_hook: c.selectedHook, project: c.project ?? null, edit: c.edit ?? null, metrics: c.metrics ?? null, posted_at: c.posted?.at ?? null, posted_to: c.posted?.to ?? [] },
  derived_from: c.derivedFrom ?? null, precisa_revisao: c.precisaRevisao ?? null, updated_at: nowIso(),
});

export async function listContent(dateKey: string): Promise<ContentItem[]> {
  const db = await getDb();
  return (await db.getAllAsync<ContentRow>("SELECT * FROM content_items WHERE date = ? AND workspace_id = ? ORDER BY scheduled_for", dateKey, await activeId())).map(toContent);
}

export async function listRecentContent(limit = 60): Promise<ContentItem[]> {
  const db = await getDb();
  return (await db.getAllAsync<ContentRow>("SELECT * FROM content_items WHERE workspace_id = ? ORDER BY date DESC, scheduled_for DESC LIMIT ?", await activeId(), limit)).map(toContent);
}

export async function getContent(id: string): Promise<ContentItem | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ContentRow>("SELECT * FROM content_items WHERE id = ?", id);
  return r ? toContent(r) : null;
}

/** Projeto do estúdio (modo A–G, SKU filmado, fonte de sorvete) — vira um conteúdo com roteiro e plano de tomadas. */
export async function createProject(project: ProjectInfo, title: string, derivedFrom: string | null = null): Promise<ContentItem> {
  const ws = await requireWorkspace();
  const now = new Date();
  const c: ContentItem = { id: newId(), workspaceId: ws.id, date: toLocalDateKey(now), format: "main_video", pillarSlug: PRODUCTION_MODES[project.mode].pillar, title, status: "planned",
    scheduledFor: now.toISOString(), draft: null, meta: null, selectedHook: null, project, derivedFrom, precisaRevisao: null };
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO content_items(id, workspace_id, date, format, pillar_slug, title, status, scheduled_for, updated_at, project, derived_from) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    c.id, c.workspaceId, c.date, c.format, c.pillarSlug, c.title, c.status, c.scheduledFor, nowIso(), JSON.stringify(project), derivedFrom,
  );
  await enqueue(ws, "content_items", c.id, { rows: [contentServerRow(c)] });
  // lesson → recording link (queued after the content row so the FK holds)
  if (project.aulaId && !derivedFrom) await enqueue(ws, "course_lessons", project.aulaId, { update: true, rows: [{ id: project.aulaId, content_item_id: c.id, updated_at: nowIso() }] });
  return c;
}

/** Peça derivada (aula, curto, marketplace...) de uma gravação: guarda a origem e herda o projeto. */
export async function deriveContent(originId: string, target: UseTarget): Promise<ContentItem> {
  const o = await getContent(originId);
  if (!o?.project) throw new Error("Só dá para derivar de um projeto do estúdio.");
  return createProject({ ...o.project, derivedTarget: target }, `${o.title} → ${target.replace("_", " ")}`, o.id);
}

/** Correção na origem (claim, SKU, receita, imagem): marca todas as peças derivadas para revisão. */
export async function flagDerived(originId: string, motivo: string): Promise<number> {
  const db = await getDb();
  const ids: string[] = [];
  let frontier = [originId];
  while (frontier.length) {
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM content_items WHERE derived_from IN (${frontier.map(() => "?").join(",")})`, ...frontier);
    frontier = rows.map((r) => r.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  for (const id of ids) {
    await db.runAsync("UPDATE content_items SET precisa_revisao = ?, updated_at = ? WHERE id = ?", motivo.slice(0, 300), nowIso(), id);
    const c = await getContent(id);
    if (c) await enqueue(await workspaceById(c.workspaceId), "content_items", id, { rows: [contentServerRow(c)] });
  }
  return ids.length;
}

/** Legenda e música escolhidas para a montagem final. */
export async function setEditChoices(contentId: string, edit: EditChoices): Promise<ContentItem> {
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET edit = ?, updated_at = ? WHERE id = ?", JSON.stringify(edit), nowIso(), contentId);
  const c = (await getContent(contentId))!;
  await enqueue(await workspaceById(c.workspaceId), "content_items", contentId, { rows: [contentServerRow(c)] });
  return c;
}

/** Números do post (visualizações, curtidas…) anotados pelo criador; vão junto para a nuvem. */
export async function setContentMetrics(contentId: string, metrics: PostMetrics): Promise<ContentItem> {
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET metrics = ?, updated_at = ? WHERE id = ?", JSON.stringify(metrics), nowIso(), contentId);
  const c = (await getContent(contentId))!;
  await enqueue(await workspaceById(c.workspaceId), "content_items", contentId, { rows: [contentServerRow(c)] });
  return c;
}

/** Toque em POSTAR: guarda a hora da 1ª postagem e junta as redes (o agente usa para achar o melhor horário). */
export async function markPosted(contentId: string, network: string): Promise<void> {
  const c = await getContent(contentId);
  if (!c) return;
  const posted = { at: c.posted?.at ?? nowIso(), to: [...new Set([...(c.posted?.to ?? []), network])] };
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET posted = ?, updated_at = ? WHERE id = ?", JSON.stringify(posted), nowIso(), contentId);
  await enqueue(await workspaceById(c.workspaceId), "content_items", contentId, { rows: [contentServerRow({ ...c, posted })] });
}

/** Conteúdos do perfil ativo que já têm números anotados (mais recentes primeiro). */
export async function listContentWithMetrics(limit = 120): Promise<ContentItem[]> {
  const db = await getDb();
  return (await db.getAllAsync<ContentRow>("SELECT * FROM content_items WHERE workspace_id = ? AND metrics IS NOT NULL ORDER BY date DESC LIMIT ?", await activeId(), limit)).map(toContent);
}

/** Linha do servidor do conteúdo (para gravar direto antes de pedir a montagem). */
export async function contentRowForServer(contentId: string): Promise<Record<string, unknown> | null> {
  const c = await getContent(contentId);
  return c ? contentServerRow(c) : null;
}

export async function clearReviewFlag(contentId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET precisa_revisao = NULL, updated_at = ? WHERE id = ?", nowIso(), contentId);
  const c = await getContent(contentId);
  if (c) await enqueue(await workspaceById(c.workspaceId), "content_items", contentId, { rows: [contentServerRow(c)] });
}

/** Ad-hoc content (e.g. "aconteceu algo hoje") not tied to a routine block. */
export async function createAdHocContent(format: "thought" | "main_video", pillarSlug: string, title: string): Promise<ContentItem> {
  const ws = await requireWorkspace();
  const now = new Date();
  const c: ContentItem = { id: newId(), workspaceId: ws.id, date: toLocalDateKey(now), format, pillarSlug, title, status: "planned", scheduledFor: now.toISOString(), draft: null, meta: null, selectedHook: null };
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO content_items(id, workspace_id, date, format, pillar_slug, title, status, scheduled_for, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    c.id, c.workspaceId, c.date, c.format, c.pillarSlug, c.title, c.status, c.scheduledFor, nowIso(),
  );
  await enqueue(ws, "content_items", c.id, { rows: [contentServerRow(c)] });
  return c;
}

export async function saveDraft(contentId: string, draft: ContentDraft, gen: GenerationMeta & { notices: string[] }, fingerprints: Fingerprint[], userEdited = false): Promise<ContentItem> {
  const current = await getContent(contentId);
  if (!current) throw new Error("Conteúdo não encontrado");
  const ws = await workspaceById(current.workspaceId);
  const scriptId = current.meta?.scriptId ?? newId();
  const meta = { ...gen, scriptId, userEdited };
  const status = current.status === "planned" ? "scripted" : current.status;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE content_items SET draft = ?, meta = ?, title = ?, status = ?, selected_hook = COALESCE(selected_hook, 0), updated_at = ? WHERE id = ?", JSON.stringify(draft), JSON.stringify(meta), draft.title, status, nowIso(), contentId);
    if (!userEdited) {
      await db.runAsync("DELETE FROM fingerprints WHERE content_item_id = ?", contentId);
      for (const f of fingerprints) await db.runAsync("INSERT INTO fingerprints(id, workspace_id, content_item_id, type, value, created_at) VALUES (?,?,?,?,?,?)", newId(), ws.id, contentId, f.type, f.value, nowIso());
    }
  });
  const updated = (await getContent(contentId))!;
  await enqueue(ws, "content_items", contentId, { rows: [contentServerRow(updated)] });
  await enqueue(ws, "scripts", scriptId, {
    rows: [{
      id: scriptId, workspace_id: ws.id, content_item_id: contentId, prompt_version: gen.prompt_version, model: gen.model, source: gen.source !== "local" ? gen.source : gen.model.includes("manual") ? "manual" : "local",
      hook_options: draft.hook_options, selected_hook: updated.selectedHook, script: draft.script, narrative: draft.narrative, screen_text: draft.screen_text, cta: draft.cta,
      draft, user_edited: userEdited, updated_at: nowIso(),
    }],
  });
  if (!userEdited) {
    await enqueue(ws, "content_fingerprints", contentId, {
      replaceFor: { column: "content_item_id", value: contentId },
      rows: fingerprints.map((f) => ({ id: newId(), workspace_id: ws.id, content_item_id: contentId, fingerprint_type: f.type, fingerprint: f.value })),
    });
  }
  return updated;
}

export async function selectHook(contentId: string, index: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET selected_hook = ?, updated_at = ? WHERE id = ?", index, nowIso(), contentId);
}

export async function setContentStatus(contentId: string, status: ContentItem["status"]): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), contentId);
  const c = await getContent(contentId);
  const ws = c ? await workspaceById(c.workspaceId) : await requireWorkspace();
  if (c) await enqueue(ws, "content_items", contentId, { rows: [contentServerRow(c)] });
}

/** "Marcar conteúdo concluído": closes the content and its pending mission, attaching the latest take. */
export async function completeContent(contentId: string): Promise<void> {
  const db = await getDb();
  const latest = await db.getFirstAsync<{ id: string }>("SELECT id FROM takes WHERE content_item_id = ? ORDER BY created_at DESC LIMIT 1", contentId);
  const pending = await db.getAllAsync<{ id: string }>("SELECT id FROM tasks WHERE content_item_id = ? AND status = 'pending'", contentId);
  for (const t of pending) await runTaskAction(t.id, { type: "done", takeId: latest?.id ?? null });
  await setContentStatus(contentId, "done");
}

/** Anti-repetition memory is per profile: the company may reuse a word the person used. */
export async function recentFingerprints(workspaceId: string, limit = 120): Promise<Fingerprint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ type: string; value: string; content_item_id: string | null; created_at: string }>(
    "SELECT type, value, content_item_id, created_at FROM fingerprints WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?", workspaceId, limit,
  );
  return rows.map((r) => ({ type: r.type as FingerprintType, value: r.value, contentItemId: r.content_item_id, createdAt: r.created_at }));
}

// ---------- media & takes ----------

type MediaDbRow = {
  id: string; workspace_id: string; local_uri: string; size_bytes: number; checksum: string; state: string; attempts: number; next_attempt_at: string | null;
  last_error: string | null; remote_verified_at: string | null; storage_key: string | null; width: number | null; height: number | null; duration_ms: number | null; created_at: string;
};

const toMedia = (r: MediaDbRow): MediaRow => ({
  id: r.id, workspaceId: r.workspace_id, localUri: r.local_uri, sizeBytes: r.size_bytes, checksum: r.checksum, state: r.state as MediaState, attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at, lastError: r.last_error, remoteVerifiedAt: r.remote_verified_at, storageKey: r.storage_key, width: r.width, height: r.height,
  durationMs: r.duration_ms, createdAt: r.created_at,
});

export const mediaServerRow = (m: MediaRow) => ({
  id: m.id, workspace_id: m.workspaceId, class: "original", state: m.state === "uploading" ? "queued" : m.state, mime_type: "video/mp4", size_bytes: m.sizeBytes,
  checksum: m.checksum, width: m.width, height: m.height, duration_ms: m.durationMs, storage_key: m.storageKey, remote_verified_at: m.remoteVerifiedAt,
});

/**
 * Registers a take whose file is ALREADY persisted in app storage. Media row + take row are written in one
 * transaction; the sync queue only starts afterwards.
 */
export async function registerTake(input: {
  mediaId: string; localUri: string; sizeBytes: number; checksum: string; width: number | null; height: number | null; durationMs: number | null;
  taskId: string | null; contentItemId: string | null; category: string; camera: "front" | "back"; segmentIndex?: number | null; meta?: ClipMeta;
}): Promise<Take> {
  // the take (and its storage path) belongs to the profile of what is being recorded, not to whichever is active
  const owner = input.contentItemId ? (await getContent(input.contentItemId))?.workspaceId : input.taskId ? (await getTask(input.taskId))?.workspaceId : undefined;
  const ws = owner ? await workspaceById(owner) : await requireWorkspace();
  // clip keeps its origin: the project of the content (mode, SKU, ice-cream source, lesson) + what was set while filming
  const project = input.contentItemId ? (await getContent(input.contentItemId))?.project : null;
  const meta: ClipMeta = { ...(project ? { mode: project.mode, produtoId: project.produtoId ?? null, sku: project.sku ?? null, skuNome: project.skuNome ?? null, fonteSorvete: project.fonteSorvete, receita: project.receita ?? null, aulaId: project.aulaId ?? null } : {}), ...input.meta };
  const db = await getDb();
  const takeId = newId();
  const createdAt = nowIso();
  const state: MediaState = ws.cloud ? "queued" : "local_only";
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO media(id, workspace_id, local_uri, size_bytes, checksum, state, attempts, next_attempt_at, storage_key, width, height, duration_ms, created_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?)",
      input.mediaId, ws.id, input.localUri, input.sizeBytes, input.checksum, state, createdAt, `${ws.id}/${input.mediaId}.mp4`, input.width, input.height, input.durationMs, createdAt,
    );
    await db.runAsync(
      "INSERT INTO takes(id, workspace_id, task_id, content_item_id, media_id, category, tags, camera, segment_index, created_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      takeId, ws.id, input.taskId, input.contentItemId, input.mediaId, input.category, "[]", input.camera, input.segmentIndex ?? null, createdAt, JSON.stringify(meta),
    );
  });
  const take = (await getTake(takeId))!;
  await enqueue(ws, "media_files", input.mediaId, { rows: [mediaServerRow(take.media)] });
  await enqueue(ws, "takes", takeId, {
    rows: [{ id: takeId, workspace_id: ws.id, recording_task_id: input.taskId, content_item_id: input.contentItemId, media_file_id: input.mediaId, category: input.category, tags: [], camera: input.camera, segment_index: input.segmentIndex ?? null, meta }],
  });
  if (input.contentItemId) {
    const c = await getContent(input.contentItemId);
    if (c && (c.status === "planned" || c.status === "scripted")) await setContentStatus(c.id, "recorded");
  }
  return take;
}

type TakeRow = { id: string; workspace_id: string; task_id: string | null; content_item_id: string | null; media_id: string; category: string; tags: string; camera: string | null; favorite: number; segment_index: number | null; created_at: string; meta?: string | null };

async function hydrateTakes(rows: TakeRow[]): Promise<Take[]> {
  const db = await getDb();
  const out: Take[] = [];
  for (const r of rows) {
    const m = await db.getFirstAsync<MediaDbRow>("SELECT * FROM media WHERE id = ?", r.media_id);
    if (!m) continue;
    out.push({ id: r.id, workspaceId: r.workspace_id, taskId: r.task_id, contentItemId: r.content_item_id, mediaId: r.media_id, category: r.category, tags: JSON.parse(r.tags), camera: r.camera as Take["camera"], favorite: r.favorite === 1, segmentIndex: r.segment_index, createdAt: r.created_at, meta: r.meta ? (JSON.parse(r.meta) as ClipMeta) : {}, media: toMedia(m) });
  }
  return out;
}

export async function listTakes(filter?: { category?: string; contentItemId?: string }): Promise<Take[]> {
  const db = await getDb();
  const where: string[] = [];
  const args: string[] = [];
  if (filter?.category) { where.push("category = ?"); args.push(filter.category); }
  if (filter?.contentItemId) { where.push("content_item_id = ?"); args.push(filter.contentItemId); }
  else { where.push("workspace_id = ?"); args.push(await activeId()); }
  const sql = `SELECT * FROM takes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 200`;
  return hydrateTakes(await db.getAllAsync<TakeRow>(sql, ...args));
}

export async function getTake(id: string): Promise<Take | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<TakeRow>("SELECT * FROM takes WHERE id = ?", id);
  return r ? (await hydrateTakes([r]))[0] ?? null : null;
}

export async function updateTakeMeta(id: string, patch: { tags?: string[]; favorite?: boolean; category?: string; meta?: Partial<ClipMeta> }): Promise<void> {
  const t = await getTake(id);
  if (!t) return;
  const ws = await workspaceById(t.workspaceId);
  const next = { tags: patch.tags ?? t.tags, favorite: patch.favorite ?? t.favorite, category: patch.category ?? t.category, meta: { ...t.meta, ...patch.meta } };
  const db = await getDb();
  await db.runAsync("UPDATE takes SET tags = ?, favorite = ?, category = ?, meta = ? WHERE id = ?", JSON.stringify(next.tags), next.favorite ? 1 : 0, next.category, JSON.stringify(next.meta), id);
  await enqueue(ws, "takes", id, { rows: [{ id, workspace_id: ws.id, media_file_id: t.mediaId, recording_task_id: t.taskId, content_item_id: t.contentItemId, category: next.category, tags: next.tags, favorite: next.favorite, camera: t.camera, segment_index: t.segmentIndex, meta: next.meta }] });
}

export async function listMedia(): Promise<MediaRow[]> {
  const db = await getDb();
  return (await db.getAllAsync<MediaDbRow>("SELECT * FROM media ORDER BY created_at")).map(toMedia);
}

export async function saveMedia(m: MediaRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE media SET state = ?, attempts = ?, next_attempt_at = ?, last_error = ?, remote_verified_at = ? WHERE id = ?",
    m.state, m.attempts, m.nextAttemptAt, m.lastError, m.remoteVerifiedAt, m.id,
  );
}

// ---------- history ----------

export interface DayHistory { date: string; done: number; total: number }

export async function history(days = 14): Promise<DayHistory[]> {
  const db = await getDb();
  return db.getAllAsync<DayHistory>(
    `SELECT date, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN status IN ('rescheduled','alternate_scene') THEN 0 ELSE 1 END) AS total
     FROM tasks WHERE workspace_id = ? GROUP BY date ORDER BY date DESC LIMIT ?`, await activeId(), days,
  );
}

export async function donePillarSlugs(limit = 60): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ pillar_slug: string }>("SELECT pillar_slug FROM content_items WHERE workspace_id = ? AND status IN ('recorded','published','done') ORDER BY date DESC LIMIT ?", await activeId(), limit);
  return rows.map((r) => r.pillar_slug);
}

/** Gravar patrimônio: queues a reviewed take for the MMIX factory (sent after the take itself is synced). */
export async function queuePatrimonio(takeId: string, ordemId: number, clipeNum: number): Promise<void> {
  const take = await getTake(takeId);
  if (!take) throw new Error("Take não encontrado");
  const ws = await workspaceById(take.workspaceId);
  if (!ws.cloud) throw new Error("Enviar para a fábrica precisa da conta na nuvem.");
  const id = newId();
  await enqueue(ws, "patrimonio_envios", id, { insertOnly: true, rows: [{ id, workspace_id: ws.id, take_id: takeId, ordem_id: ordemId, clipe_num: clipeNum }] });
}

/** Latest take per part for a content item (a retake replaces the previous choice; originals are kept). */
export async function latestTakesBySegment(contentItemId: string): Promise<Map<number, Take>> {
  const takes = await listTakes({ contentItemId });
  const out = new Map<number, Take>();
  for (const t of takes) {
    if (t.tags.includes("descartado")) continue;
    if (t.segmentIndex !== null && !out.has(t.segmentIndex)) out.set(t.segmentIndex, t); // list is newest first
  }
  return out;
}
