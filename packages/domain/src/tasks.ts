export const TASK_STATUSES = ["pending", "done", "skipped", "did_not_happen", "rescheduled", "alternate_scene"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CONTENT_FORMATS = ["thought", "main_video", "story", "broll"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export interface RecordingTask {
  id: string;
  workspaceId: string;
  contentItemId: string | null;
  scheduledFor: string; // ISO
  title: string;
  kind: ContentFormat;
  hint: string | null;
  suggestedDurationSeconds: number | null;
  optional: boolean;
  status: TaskStatus;
  notes: string | null;
  takeId: string | null;
  supersededBy: string | null;
  updatedAt: string;
}

export type TaskAction =
  | { type: "done"; takeId?: string | null }
  | { type: "skip"; reason?: string }
  | { type: "did_not_happen"; reason?: string }
  | { type: "reschedule"; to: string }
  | { type: "alternate_scene"; scene: string }
  | { type: "reopen" };

export interface TaskEvent {
  id: string;
  workspaceId: string;
  taskId: string;
  action: TaskAction["type"];
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TaskTransition {
  task: RecordingTask;
  event: TaskEvent;
  /** follow-up task created by REMARCAR / USAR OUTRA CENA */
  spawned: RecordingTask | null;
}

export const TASK_ACTION_LABELS: Record<TaskAction["type"], string> = {
  done: "FEITO",
  skip: "PULAR",
  did_not_happen: "NÃO ACONTECEU",
  reschedule: "REMARCAR",
  alternate_scene: "USAR OUTRA CENA",
  reopen: "DESFAZER",
};

export class TaskTransitionError extends Error {}

const ACTIONABLE: readonly TaskStatus[] = ["pending"];

export function applyTaskAction(task: RecordingTask, action: TaskAction, ctx: { now: string; newId: () => string }): TaskTransition {
  const from = task.status;
  if (action.type === "reopen") {
    if (from === "pending") throw new TaskTransitionError("A tarefa já está pendente.");
    if (task.supersededBy) throw new TaskTransitionError("Esta tarefa foi substituída; edite a nova tarefa.");
    return build(task, { ...task, status: "pending", takeId: null, updatedAt: ctx.now }, action, ctx, null, {});
  }
  if (!ACTIONABLE.includes(from)) throw new TaskTransitionError(`Não é possível aplicar ${TASK_ACTION_LABELS[action.type]} numa tarefa ${from}.`);

  switch (action.type) {
    case "done":
      return build(task, { ...task, status: "done", takeId: action.takeId ?? task.takeId, updatedAt: ctx.now }, action, ctx, null, { takeId: action.takeId ?? null });
    case "skip":
      return build(task, { ...task, status: "skipped", notes: action.reason ?? task.notes, updatedAt: ctx.now }, action, ctx, null, { reason: action.reason ?? null });
    case "did_not_happen":
      return build(task, { ...task, status: "did_not_happen", notes: action.reason ?? task.notes, updatedAt: ctx.now }, action, ctx, null, { reason: action.reason ?? null });
    case "reschedule": {
      const to = new Date(action.to);
      if (Number.isNaN(to.getTime())) throw new TaskTransitionError("Horário inválido para remarcar.");
      const spawned: RecordingTask = { ...task, id: ctx.newId(), scheduledFor: to.toISOString(), status: "pending", takeId: null, supersededBy: null, updatedAt: ctx.now };
      return build(task, { ...task, status: "rescheduled", supersededBy: spawned.id, updatedAt: ctx.now }, action, ctx, spawned, { to: spawned.scheduledFor });
    }
    case "alternate_scene": {
      const scene = action.scene.trim();
      if (!scene) throw new TaskTransitionError("Descreva a outra cena.");
      const spawned: RecordingTask = { ...task, id: ctx.newId(), title: scene, hint: `Substitui: ${task.title}`, status: "pending", takeId: null, supersededBy: null, updatedAt: ctx.now };
      return build(task, { ...task, status: "alternate_scene", supersededBy: spawned.id, updatedAt: ctx.now }, action, ctx, spawned, { scene });
    }
  }
}

function build(prev: RecordingTask, next: RecordingTask, action: TaskAction, ctx: { now: string; newId: () => string }, spawned: RecordingTask | null, payload: Record<string, unknown>): TaskTransition {
  return {
    task: next,
    spawned,
    event: { id: ctx.newId(), workspaceId: prev.workspaceId, taskId: prev.id, action: action.type, fromStatus: prev.status, toStatus: next.status, payload, createdAt: ctx.now },
  };
}

export interface DayProgress {
  total: number;
  done: number;
  skipped: number;
  didNotHappen: number;
  pending: number;
  percent: number;
  label: string;
}

/** Superseded tasks (remarcadas / trocadas) are replaced by their follow-up, so they don't count twice. */
export function computeProgress(tasks: readonly RecordingTask[]): DayProgress {
  const counted = tasks.filter((t) => t.status !== "rescheduled" && t.status !== "alternate_scene");
  const done = counted.filter((t) => t.status === "done").length;
  const skipped = counted.filter((t) => t.status === "skipped").length;
  const didNotHappen = counted.filter((t) => t.status === "did_not_happen").length;
  const pending = counted.filter((t) => t.status === "pending").length;
  const total = counted.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const label = total === 0 ? "Nenhuma missão para hoje" : `${done} de ${total} ${total === 1 ? "missão feita" : "missões feitas"}`;
  return { total, done, skipped, didNotHappen, pending, percent, label };
}

const GRACE_MINUTES = 60;

/** "O que eu tenho que gravar agora?" — the pending task closest to now, preferring what is still in time. */
export function nextTask(tasks: readonly RecordingTask[], now: Date): RecordingTask | null {
  const pending = tasks.filter((t) => t.status === "pending").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  if (pending.length === 0) return null;
  const cutoff = now.getTime() - GRACE_MINUTES * 60_000;
  const inTime = pending.find((t) => new Date(t.scheduledFor).getTime() >= cutoff);
  return inTime ?? pending[pending.length - 1]!;
}

export function isOverdue(task: RecordingTask, now: Date): boolean {
  return task.status === "pending" && new Date(task.scheduledFor).getTime() < now.getTime() - GRACE_MINUTES * 60_000;
}
