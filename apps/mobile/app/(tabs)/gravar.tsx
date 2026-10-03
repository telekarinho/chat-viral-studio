import { useCallback, useState } from "react";
import { Text, View } from "react-native";
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

  const next = tasks[0] ?? null;

  return (
    <Screen testID="gravar-screen">
      <Eyebrow>Direção de gravação</Eyebrow>
      <H1>Gravar</H1>
      <Text style={s.muted}>O app salva primeiro no celular e funciona sem internet. Quando há roteiro, a câmera abre com a instrução certa para cada take.</Text>

      {next ? (
        <Card style={{ gap: 10, backgroundColor: colors.hero }} testID="director-next-record">
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>{`PRÓXIMA MISSÃO · ${hhmm(next.scheduledFor)}`}</Text>
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 22 }}>{next.title}</Text>
          <Text style={{ color: "#C9CBD1" }}>{FORMAT_LABEL[next.kind]}{next.hint ? ` · ${next.hint}` : ""}</Text>
          <Button variant="light" label="🎬 GRAVAR O QUE O DIRETOR PEDIU" onPress={() => router.push({ pathname: "/record", params: { taskId: next.id, contentId: next.contentItemId ?? "", prompter: next.contentItemId ? "1" : "0", partes: next.contentItemId ? "1" : "0" } })} testID="record-director-next" />
        </Card>
      ) : (
        <Card><Text style={s.muted}>Nenhuma missão pendente. Você pode gravar algo livre abaixo.</Text></Card>
      )}

      <Section>Gravação livre</Section>
      <View style={{ gap: 8 }}>
        <Button label="🎙 GRAVAR TAKE LIVRE" onPress={() => router.push("/record")} testID="free-record" />
        <Button variant="secondary" label="Aa TELEPROMPTER + GRAVAR" onPress={() => router.push({ pathname: "/record", params: { prompter: "1" } })} />
      </View>

      {tasks.length > 1 ? <Section>Outras missões de hoje</Section> : null}
      {tasks.slice(1).map((t) => (
        <Card key={t.id}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 16 }}>{hhmm(t.scheduledFor)} · {t.title}</Text>
          <Text style={s.muted}>{FORMAT_LABEL[t.kind]}{t.hint ? ` · ${t.hint}` : ""}</Text>
          <Button compact label="GRAVAR ESTA" onPress={() => router.push({ pathname: "/record", params: { taskId: t.id, contentId: t.contentItemId ?? "", prompter: t.contentItemId ? "1" : "0", partes: t.contentItemId ? "1" : "0" } })} />
        </Card>
      ))}
    </Screen>
  );
}
