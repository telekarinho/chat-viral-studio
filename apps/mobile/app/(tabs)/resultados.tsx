import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { engagementRate, metricsInsights, pillarBalance, sharesPer1k } from "@postai/domain";
import { useApp } from "../../src/app-state";
import { donePillarSlugs, history, listContentWithMetrics, type ContentItem, type DayHistory } from "../../src/db/repo";
import { Card, Empty, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";

export default function Resultados() {
  const { workspace } = useApp();
  const [days, setDays] = useState<DayHistory[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  useFocusEffect(useCallback(() => {
    void history(14).then(setDays);
    void donePillarSlugs(60).then(setRecent);
    void listContentWithMetrics().then(setPosts);
  }, []));
  const pillarName = (slug: string) => workspace?.pillars.find((p) => p.slug === slug)?.name ?? slug;
  const insights = metricsInsights(posts.map((p) => ({ id: p.id, title: p.draft?.title ?? p.title, pillarSlug: p.pillarSlug, metrics: p.metrics! })), pillarName);
  const fmt = (n: number) => n.toLocaleString("pt-BR");

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
      <Eyebrow>O que está funcionando</Eyebrow>
      <H1>Resultados</H1>
      <Text style={s.muted}>Anote os números de cada post (na tela do vídeo final, em “Como foi este post?”) e o app compara os temas para você.</Text>

      <Section>Seus posts</Section>
      {insights.posts === 0 ? <Empty title="Nenhum número anotado ainda" body="Abra um vídeo final e preencha “Como foi este post?”." /> : (
        <>
          <View style={s.row}>
            <Card style={{ flex: 1 }}><Text style={{ fontSize: 28, fontWeight: "900", color: colors.ink }}>{fmt(insights.totalViews)}</Text><Text style={s.muted}>visualizações em {insights.posts} post(s)</Text></Card>
          </View>
          {insights.tip ? <Card testID="metrics-tip"><Text style={{ fontWeight: "800", color: colors.good }}>{`💡 ${insights.tip}`}</Text></Card> : null}
          {insights.best ? (
            <Pressable onPress={() => router.push(`/content/${insights.best!.id}`)} accessibilityRole="button">
              <Card style={{ gap: 4 }}>
                <Text style={s.label}>Melhor post</Text>
                <Text style={{ fontWeight: "800", color: colors.ink }}>{insights.best.title}</Text>
                <Text style={s.muted}>{`${fmt(insights.best.metrics.views)} visualizações · engajamento ${(engagementRate(insights.best.metrics) * 100).toFixed(1)}% · ${sharesPer1k(insights.best.metrics).toFixed(1)} envios a cada mil`}</Text>
              </Card>
            </Pressable>
          ) : null}
          <Text style={s.muted}>O que mais faz um vídeo chegar em gente nova é alguém mandar para outra pessoa: fique de olho nos “envios a cada mil”.</Text>
          <Card style={{ gap: 6 }}>
            <Text style={s.label}>Média por tema</Text>
            {insights.byPillar.map((p) => (
              <Text key={p.pillarSlug} style={s.body}>{`${pillarName(p.pillarSlug)}: ${fmt(p.avgViews)} visualizações · ${(p.avgEngagement * 100).toFixed(1)}% engajamento (${p.posts} post${p.posts > 1 ? "s" : ""})`}</Text>
            ))}
          </Card>
        </>
      )}

      <Section>Constância</Section>
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
