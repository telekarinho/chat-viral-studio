import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, SYNC_LABEL } from "@postai/domain";
import { listRecentContent, listTakes, type ContentItem, type Take } from "../../src/db/repo";
import { Card, Chip, Empty, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";

const CATEGORIES: { key: string | null; label: string }[] = [
  { key: null, label: "Todos" },
  { key: "broll", label: "B-roll" },
  { key: "thought", label: "Pensamento" },
  { key: "main_video", label: "Vídeo principal" },
  { key: "livre", label: "Livres" },
];

export default function Projetos() {
  const [cat, setCat] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  useFocusEffect(useCallback(() => {
    void listTakes(cat ? { category: cat } : undefined).then(setTakes);
    void listRecentContent(30).then((c) => setContents(c.filter((x) => x.draft)));
  }, [cat]));

  return (
    <Screen testID="projetos-screen">
      <Eyebrow>Banco de takes e roteiros</Eyebrow>
      <H1>Projetos</H1>
      <View style={s.row}>{CATEGORIES.map((c) => <Chip key={c.label} label={c.label} selected={cat === c.key} onPress={() => setCat(c.key)} />)}</View>
      <Section>Takes ({takes.length})</Section>
      {takes.length === 0 ? <Empty title="Nenhum take ainda" body="Grave na aba Gravar ou numa missão de Hoje." /> : null}
      {takes.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="button" testID="take-row">
          <Card>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>{t.favorite ? "★ " : ""}{new Date(t.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: t.media.state === "uploaded_original" ? colors.good : t.media.state === "dead_letter" ? colors.bad : colors.warn }}>{SYNC_LABEL[t.media.state].toUpperCase()}</Text>
            </View>
            <Text style={s.muted}>{t.category} · {Math.round((t.media.durationMs ?? 0) / 1000)}s · {(t.media.sizeBytes / 1_048_576).toFixed(1)} MB{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</Text>
          </Card>
        </Pressable>
      ))}
      <Section>Histórico de roteiros</Section>
      {contents.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/content/${c.id}`)} accessibilityRole="button">
          <Card>
            <Text style={{ fontWeight: "800", color: colors.ink }}>{c.draft!.title}</Text>
            <Text style={s.muted}>{c.date} · {FORMAT_LABEL[c.format]} · {c.pillarSlug} · {c.status}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
