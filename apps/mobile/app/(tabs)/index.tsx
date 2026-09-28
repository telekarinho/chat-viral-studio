import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { toLocalDateKey, type RecordingTask, type TaskAction } from "@postai/domain";
import { ensureDayPlan, listContent, listTasks, runTaskAction, type ContentItem } from "../../src/db/repo";
import { generateForContent } from "../../src/generate";
import { scheduleTaskReminders } from "../../src/notifications";
import { getSyncStatus, subscribeSync } from "../../src/sync/engine";
import { syncLabel } from "../../src/sync/label";
import { reportError } from "../../src/telemetry";
import { useApp } from "../../src/app-state";
import { TodayView } from "../../src/components/TodayView";
import { ErrorBox, Loading, Screen } from "../../src/ui";

export default function Today() {
  const { workspace } = useApp();
  const [state, setState] = useState<{ tasks: RecordingTask[]; contents: ContentItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [sync, setSync] = useState(getSyncStatus());

  useEffect(() => subscribeSync(setSync), []);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      setNow(today);
      await ensureDayPlan(today);
      const key = toLocalDateKey(today);
      const [tasks, contents] = await Promise.all([listTasks(key), listContent(key)]);
      setState({ tasks, contents });
      setError(null);
      if (workspace) scheduleTaskReminders(tasks, workspace.settings.reminders).catch((e) => reportError(e, "reminders"));
    } catch (e) {
      reportError(e, "today load");
      setError("Não consegui carregar o seu dia. Seus dados continuam salvos no aparelho.");
    }
  }, [workspace]);

  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function onAction(task: RecordingTask, action: TaskAction) {
    try {
      await runTaskAction(task.id, action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onGenerate(contentId: string) {
    setGeneratingId(contentId);
    try {
      await generateForContent(contentId);
      router.push(`/content/${contentId}`);
    } catch (e) {
      reportError(e, "generate");
      setError("Não consegui gerar o roteiro agora. Tente de novo.");
    } finally {
      setGeneratingId(null);
      void load();
    }
  }

  if (!state && !error) return <Screen><Loading label="Montando o seu dia…" /></Screen>;
  return (
    <Screen testID="today-screen">
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {state ? (
        <TodayView
          now={now}
          tasks={state.tasks}
          contents={state.contents}
          syncLabel={syncLabel(sync, Boolean(workspace?.cloud))}
          generatingId={generatingId}
          onAction={onAction}
          onRecord={(t) => router.push({ pathname: "/record", params: { taskId: t.id, contentId: t.contentItemId ?? "", partes: t.contentItemId ? "1" : "0" } })}
          onOpenContent={(id) => router.push(`/content/${id}`)}
          onGenerate={onGenerate}
          onEvent={() => router.push("/event")}
          onFreeRecord={() => router.push("/record")}
        />
      ) : null}
    </Screen>
  );
}
