import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { pillarBalance } from "@postai/domain";
import { useApp } from "../../src/app-state";
import { donePillarSlugs, history, type DayHistory } from "../../src/db/repo";
import { Card, Empty, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";

export default function Resultados() {
  const { workspace } = useApp();
  const [days, setDays] = useState<DayHistory[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    void history(14).then(setDays);
    void donePillarSlugs(60).then(setRecent);
  }, []));

  const totalDone = days.reduce((a, d) => a + d.done, 0);
  const streak = (() => {
    let n = 0;
    for (const d of days) {
      if (d.done > 0) n++;
      else break;
    }
    return n;
  })();

  return (
    <Screen testID="resultados-screen">
      <Eyebrow>Histórico básico</Eyebrow>
      <H1>Resultados</H1>
      <Text style={s.muted}>Métricas das redes entram numa próxima versão. Aqui você vê a sua constância.</Text>
      <View style={s.row}>
        <Card style={{ flex: 1 }}><Text style={{ fontSize: 28, fontWeight: "900", color: colors.ink }}>{totalDone}</Text><Text style={s.muted}>missões feitas (14 dias)</Text></Card>
        <Card style={{ flex: 1 }}><Text style={{ fontSize: 28, fontWeight: "900", color: colors.ink }}>{streak}</Text><Text style={s.muted}>dias seguidos com algo gravado</Text></Card>
      </View>
      <Section>Últimos dias</Section>
      {days.length === 0 ? <Empty title="Ainda sem histórico" /> : null}
      {days.map((d) => (
        <Card key={d.date} style={{ gap: 6 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>{d.date.split("-").reverse().join("/")}</Text>
            <Text style={s.muted}>{d.done}/{d.total}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${d.total ? Math.round((d.done / d.total) * 100) : 0}%`, backgroundColor: colors.good, borderRadius: 3 }} />
          </View>
        </Card>
      ))}
      {workspace ? (
        <>
          <Section>Pilares gravados vs. meta</Section>
          <Card style={{ gap: 6 }}>
            {pillarBalance(workspace.pillars, recent).map((b) => (
              <Text key={b.slug} style={s.body}>{b.name}: {Math.round(b.actualPercent)}% (meta {b.targetPercent}%)</Text>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
