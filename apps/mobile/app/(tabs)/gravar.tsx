import { useCallback, useState } from "react";
import { Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, toLocalDateKey, type RecordingTask } from "@postai/domain";
import { ensureDayPlan, listTasks } from "../../src/db/repo";
import { hhmm } from "../../src/components/TaskCard";
import { Button, Card, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";

export default function Gravar() {
  const [tasks, setTasks] = useState<RecordingTask[]>([]);
  useFocusEffect(useCallback(() => {
    void (async () => {
      await ensureDayPlan(new Date());
      setTasks((await listTasks(toLocalDateKey(new Date()))).filter((t) => t.status === "pending"));
    })();
  }, []));

  return (
    <Screen testID="gravar-screen">
      <Eyebrow>Câmera</Eyebrow>
      <H1>Gravar</H1>
      <Text style={s.muted}>Tudo é salvo primeiro no seu celular — funciona sem internet.</Text>
      <Button label="GRAVAR TAKE LIVRE" onPress={() => router.push("/record")} testID="free-record" />
      <Button variant="secondary" label="GRAVAR COM TELEPROMPTER" onPress={() => router.push({ pathname: "/record", params: { prompter: "1" } })} />
      <Section>Missões pendentes de hoje</Section>
      {tasks.length === 0 ? <Card><Text style={s.muted}>Nada pendente agora.</Text></Card> : null}
      {tasks.map((t) => (
        <Card key={t.id}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 16 }}>{hhmm(t.scheduledFor)} · {t.title}</Text>
          <Text style={s.muted}>{FORMAT_LABEL[t.kind]}{t.hint ? ` · ${t.hint}` : ""}</Text>
          <Button compact label="GRAVAR ESTA" onPress={() => router.push({ pathname: "/record", params: { taskId: t.id, contentId: t.contentItemId ?? "", prompter: t.contentItemId ? "1" : "0" } })} />
        </Card>
      ))}
    </Screen>
  );
}
