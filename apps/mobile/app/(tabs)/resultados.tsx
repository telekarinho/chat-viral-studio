import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, directorLearnings, engagementRate, metricsInsights, pillarBalance, sharesPer1k, styleLabel, trackById } from "@postai/domain";
import { useApp } from "../../src/app-state";
import { donePillarSlugs, history, listContentWithMetrics, pullImportedMetrics, type ContentItem, type DayHistory } from "../../src/db/repo";
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
    // números que o assistente trouxe (ex.: do Metricool) entram aqui também
    if (workspace?.cloud) void pullImportedMetrics(workspace.id).then((n) => (n ? listContentWithMetrics().then(setPosts) : undefined)).catch(() => undefined);
  }, [workspace?.id, workspace?.cloud]));
  const pillarName = (slug: string) => workspace?.pillars.find((p) => p.slug === slug)?.name ?? slug;
  const insights = metricsInsights(posts.map((p) => ({ id: p.id, title: p.draft?.title ?? p.title, pillarSlug: p.pillarSlug, metrics: p.metrics! })), pillarName);
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  // só posts com números reais; cada post entra com o que usou (tema, duração, estilo, música, horário, gancho)
  const learned = directorLearnings(posts.map((p) => ({
    metrics: p.metrics!, tema: pillarName(p.pillarSlug), formato: FORMAT_LABEL[p.format], duracaoS: p.draft?.duration_seconds ?? null,
    estilo: p.edit ? styleLabel(p.edit) : null, musica: p.edit?.music ? trackById(p.edit.music)?.title ?? null : null,
    hora: p.posted?.at ? new Date(p.posted.at).getHours() : null, gancho: p.draft?.hook_options[p.selectedHook ?? 0] ?? null,
  })));

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
      <Eyebrow>{workspace ? `Perfil: ${workspace.name}` : "Resultados"}</Eyebrow>
      <H1>O que seu Diretor aprendeu</H1>
      <Card style={{ gap: 6 }} testID="learnings">
        <Text style={s.label} testID="learnings-sample">{`Baseado em ${learned.posts} post${learned.posts === 1 ? "" : "s"} com números${learned.small && learned.posts ? " · amostra pequena" : ""}`}</Text>
        {learned.learnings.length ? learned.learnings.map((l) => (
          <Text key={l.dimensao} style={[s.body, { fontWeight: "700" }]}>{`• ${l.texto}`}</Text>
        )) : (
          <Text style={s.muted}>{learned.posts < 3 ? "Ainda poucos posts com números. Anote em “Como foi este post?” (ou peça ao Claude para importar do Metricool) — a partir de 3 o Diretor começa a comparar." : "Ainda sem diferença clara entre os grupos (cada grupo precisa de pelo menos 2 posts)."}</Text>
        )}
        <Text style={s.muted}>Comparação entre os seus posts, não causa garantida. Leads e vendas aparecem quando estiverem integrados.</Text>
      </Card>

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
