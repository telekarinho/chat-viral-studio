import * as Notifications from "expo-notifications";
import { FORMAT_LABEL, type RecordingTask } from "@postai/domain";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Re-schedules today's reminders: one local notification per pending future mission (works offline). */
export async function scheduleTaskReminders(tasks: readonly RecordingTask[], enabled: boolean): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return 0;
  const now = Date.now();
  const upcoming = tasks.filter((t) => t.status === "pending" && new Date(t.scheduledFor).getTime() > now + 30_000);
  if (upcoming.length === 0 || !(await ensureNotificationPermission())) return 0;
  for (const t of upcoming) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t.kind === "broll" ? `Hora do B-roll: ${t.title}` : `Hora de gravar: ${FORMAT_LABEL[t.kind]}`,
        body: t.hint ? `${t.hint} · se não der, tudo bem — é só remarcar.` : "Abra o Post.ai para ver o roteiro.",
        data: { taskId: t.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t.scheduledFor) },
    });
  }
  return upcoming.length;
}
