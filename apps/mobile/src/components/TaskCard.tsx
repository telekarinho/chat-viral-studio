import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FORMAT_LABEL, TASK_ACTION_LABELS, isOverdue, type RecordingTask, type TaskAction } from "@postai/domain";
import { Button, colors, s } from "../ui";

const STATUS_LABEL: Record<RecordingTask["status"], string> = {
  pending: "Pendente",
  done: "Feito",
  skipped: "Pulado",
  did_not_happen: "Não aconteceu",
  rescheduled: "Remarcado",
  alternate_scene: "Trocado por outra cena",
};

const STATUS_COLOR: Record<RecordingTask["status"], string> = {
  pending: colors.line,
  done: colors.good,
  skipped: colors.muted,
  did_not_happen: colors.muted,
  rescheduled: colors.info,
  alternate_scene: colors.info,
};

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function rescheduleOptions(task: RecordingTask, now: Date): { label: string; to: string }[] {
  const base = Math.max(now.getTime(), new Date(task.scheduledFor).getTime());
  const tomorrow = new Date(task.scheduledFor);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    { label: "+30 min", to: new Date(base + 30 * 60_000).toISOString() },
    { label: "+1 hora", to: new Date(base + 60 * 60_000).toISOString() },
    { label: "+2 horas", to: new Date(base + 120 * 60_000).toISOString() },
    { label: "Amanhã", to: tomorrow.toISOString() },
  ];
}

interface Props {
  task: RecordingTask;
  now: Date;
  onAction: (task: RecordingTask, action: TaskAction) => void;
  onRecord: (task: RecordingTask) => void;
  onOpenContent?: (task: RecordingTask) => void;
}

export function TaskCard({ task, now, onAction, onRecord, onOpenContent }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "reschedule" | "alternate">("none");
  const [scene, setScene] = useState("");
  const pending = task.status === "pending";
  const superseded = task.status === "rescheduled" || task.status === "alternate_scene";
  const late = isOverdue(task, now);
  const act = (a: TaskAction) => {
    setMode("none");
    setOpen(false);
    onAction(task, a);
  };

  return (
    <View style={[s.card, { flexDirection: "column", opacity: superseded ? 0.55 : 1 }]} testID={`task-${task.title}`}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`${hhmm(task.scheduledFor)} ${task.title}, ${STATUS_LABEL[task.status]}`}
        accessibilityHint="Toque para ver as ações"
        style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 44 }}
      >
        <Text style={{ width: 48, fontWeight: "800", color: colors.ink, fontSize: 15 }}>{hhmm(task.scheduledFor)}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink, textDecorationLine: task.status === "done" ? "line-through" : "none" }}>{task.title}</Text>
          <Text style={s.muted}>
            {FORMAT_LABEL[task.kind]}
            {task.suggestedDurationSeconds ? ` · ${task.suggestedDurationSeconds}s` : ""}
            {task.optional ? " · opcional" : ""}
            {task.hint ? ` · ${task.hint}` : ""}
          </Text>
          {!pending ? <Text style={{ fontSize: 12, fontWeight: "800", color: STATUS_COLOR[task.status] }}>{STATUS_LABEL[task.status].toUpperCase()}</Text> : null}
          {late ? <Text style={{ fontSize: 12, fontWeight: "700", color: colors.warn }}>Passou do horário — ainda dá, ou remarque sem culpa.</Text> : null}
        </View>
        <View style={{ width: 14, height: 14, borderRadius: 7, marginTop: 4, borderWidth: 2, borderColor: STATUS_COLOR[task.status], backgroundColor: task.status === "done" ? colors.good : "transparent" }} />
      </Pressable>

      {open && pending ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <View style={s.row}>
            <Button compact label="GRAVAR" onPress={() => onRecord(task)} testID={`task-record-${task.title}`} />
            {task.contentItemId && onOpenContent ? <Button compact variant="secondary" label="ROTEIRO" onPress={() => onOpenContent(task)} /> : null}
            <Button compact variant="secondary" label={TASK_ACTION_LABELS.done} onPress={() => act({ type: "done" })} testID={`task-done-${task.title}`} />
          </View>
          <View style={s.row}>
            <Button compact variant="secondary" label={TASK_ACTION_LABELS.skip} onPress={() => act({ type: "skip" })} testID={`task-skip-${task.title}`} />
            <Button compact variant="secondary" label={TASK_ACTION_LABELS.did_not_happen} onPress={() => act({ type: "did_not_happen" })} testID={`task-dnh-${task.title}`} />
            <Button compact variant="secondary" label={TASK_ACTION_LABELS.reschedule} onPress={() => setMode(mode === "reschedule" ? "none" : "reschedule")} testID={`task-resched-${task.title}`} />
            <Button compact variant="secondary" label={TASK_ACTION_LABELS.alternate_scene} onPress={() => setMode(mode === "alternate" ? "none" : "alternate")} testID={`task-alt-${task.title}`} />
          </View>
          {mode === "reschedule" ? (
            <View style={s.row}>
              {rescheduleOptions(task, now).map((o) => (
                <Button key={o.label} compact variant="ghost" label={o.label} onPress={() => act({ type: "reschedule", to: o.to })} testID={`resched-${o.label}`} />
              ))}
            </View>
          ) : null}
          {mode === "alternate" ? (
            <View style={{ gap: 8 }}>
              <TextInput testID="alt-scene-input" style={s.input} placeholder="Qual cena você vai gravar no lugar?" value={scene} onChangeText={setScene} accessibilityLabel="Outra cena" />
              <Button compact label="TROCAR CENA" onPress={() => act({ type: "alternate_scene", scene })} disabled={!scene.trim()} testID="alt-scene-confirm" />
            </View>
          ) : null}
        </View>
      ) : null}
      {open && !pending && !superseded ? (
        <View style={[s.row, { marginTop: 10 }]}>
          <Button compact variant="ghost" label={TASK_ACTION_LABELS.reopen} onPress={() => act({ type: "reopen" })} testID={`task-reopen-${task.title}`} />
        </View>
      ) : null}
    </View>
  );
}
