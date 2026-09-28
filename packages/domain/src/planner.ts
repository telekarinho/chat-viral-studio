import { pickNextPillar, type Pillar } from "./pillars";
import type { ContentFormat, RecordingTask } from "./tasks";

export interface RoutineBlock {
  id: string;
  weekday: number; // 0 = domingo ... 6 = sábado
  startTime: string; // HH:MM
  title: string;
  contentHint: string | null;
  optional: boolean;
  format: ContentFormat;
}

export interface PlannedContentItem {
  id: string;
  workspaceId: string;
  date: string; // YYYY-MM-DD
  format: ContentFormat;
  pillarSlug: string;
  title: string;
  status: "planned" | "scripted" | "recorded" | "published" | "done";
  scheduledFor: string;
}

export interface DayPlan {
  date: string;
  tasks: RecordingTask[];
  contentItems: PlannedContentItem[];
}

const RODRIGO_WEEKDAY_BLOCKS: ReadonlyArray<Omit<RoutineBlock, "id" | "weekday">> = [
  { startTime: "08:45", title: "Café / B-roll", contentHint: "3 segundos do café", optional: false, format: "broll" },
  { startTime: "09:10", title: "Início do trabalho / B-roll", contentHint: "entrada no expediente", optional: false, format: "broll" },
  { startTime: "10:30", title: "Pensamento do Dia", contentHint: "vídeo curto 5–15s", optional: false, format: "thought" },
  { startTime: "12:15", title: "Almoço opcional", contentHint: "take de 3 segundos", optional: true, format: "broll" },
  { startTime: "15:00", title: "Trabalho / B-roll", contentHint: "algo real acontecendo na empresa", optional: true, format: "broll" },
  { startTime: "17:30", title: "Fim do expediente", contentHint: "encerramento do trabalho", optional: false, format: "broll" },
  { startTime: "19:15", title: "Preparação para academia", contentHint: "pré-treino / preparação", optional: false, format: "broll" },
  { startTime: "19:30", title: "Vídeo principal caminhando", contentHint: "45s–2m", optional: false, format: "main_video" },
  { startTime: "20:15", title: "Academia / B-roll", contentHint: "entrada, exercício ou final", optional: false, format: "broll" },
  { startTime: "21:30", title: "Fim do dia", contentHint: "encerramento", optional: false, format: "broll" },
];

/** Routine seg–sex from supabase/seed.sql. */
export function rodrigoRoutine(newId: () => string): RoutineBlock[] {
  const blocks: RoutineBlock[] = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    for (const b of RODRIGO_WEEKDAY_BLOCKS) blocks.push({ ...b, id: newId(), weekday });
  }
  return blocks;
}

export const DEFAULT_DURATION: Record<ContentFormat, number> = { thought: 12, main_video: 60, story: 15, broll: 3 };

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  thought: "Pensamento do Dia",
  main_video: "Vídeo principal",
  story: "Story",
  broll: "B-roll",
};

export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateTime(dateKey: string, hhmm: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

export function isValidTime(hhmm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
}

/**
 * Converts the routine of a weekday into capture missions. Thought/Main video blocks
 * also get a content item with a pillar chosen by target deficit.
 */
export function buildDayPlan(input: {
  date: Date;
  workspaceId: string;
  routine: readonly RoutineBlock[];
  pillars: readonly Pillar[];
  recentPillarSlugs: readonly string[];
  newId: () => string;
  now: string;
  /** use another weekday's routine (E2E builds on weekends) */
  weekdayOverride?: number;
}): DayPlan {
  const dateKey = toLocalDateKey(input.date);
  const weekday = input.weekdayOverride ?? input.date.getDay();
  const blocks = input.routine.filter((b) => b.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const history = [...input.recentPillarSlugs];
  const contentItems: PlannedContentItem[] = [];
  const tasks: RecordingTask[] = blocks.map((b) => {
    const scheduledFor = localDateTime(dateKey, b.startTime).toISOString();
    let contentItemId: string | null = null;
    if (b.format === "thought" || b.format === "main_video") {
      const pillar = pickNextPillar(input.pillars, history, contentItems.map((c) => c.pillarSlug));
      history.push(pillar.slug);
      contentItemId = input.newId();
      contentItems.push({ id: contentItemId, workspaceId: input.workspaceId, date: dateKey, format: b.format, pillarSlug: pillar.slug, title: FORMAT_LABEL[b.format], status: "planned", scheduledFor });
    }
    return {
      id: input.newId(),
      workspaceId: input.workspaceId,
      contentItemId,
      scheduledFor,
      title: b.title,
      kind: b.format,
      hint: b.contentHint,
      suggestedDurationSeconds: DEFAULT_DURATION[b.format],
      optional: b.optional,
      status: "pending",
      notes: null,
      takeId: null,
      supersededBy: null,
      updatedAt: input.now,
    };
  });
  return { date: dateKey, tasks, contentItems };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
