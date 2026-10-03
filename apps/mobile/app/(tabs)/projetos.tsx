import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, SYNC_LABEL } from "@postai/domain";
import { listRecentContent, listTakes, type ContentItem, type Take } from "../../src/db/repo";
import { Card, Chip, Empty, Eyebrow, H1, Screen, Section, colors, s } from "../../src/ui";
import { subscribeSync } from "../../src/sync/engine";
import { useApp } from "../../src/app-state";

const STATUS_LABEL: Record<ContentItem["status"], string> = { planned: "planejado", scripted: "roteiro pronto", recorded: "gravado", published: "postado", done: "concluído" };
const CATEGORY_LABEL = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;
const dayLabel = (dateKey: string) => dateKey.split("-").reverse().join("/");

const CATEGORIES: { key: string | null; label: string }[] = [
  { key: null, label: "Tudo" },
  { key: "broll", label: "B-roll" },
  { key: "thought", label: "Pensamentos" },
  { key: "main_video", label: "Vídeos" },
  { key: "livre", label: "Livres" },
];

export default function Projetos() {
  const { workspace } = useApp();
  const pillarName = (slug: string) => workspace?.pillars.find((p) => p.slug === slug)?.name ?? slug;
  const [cat, setCat] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const load = useCallback(() => {
    void listTakes(cat ? { category: cat } : undefined).then(setTakes);
    void listRecentContent(30).then((c) => setContents(c.filter((x) => x.draft)));
  }, [cat]);
  useFocusEffect(load);
  useEffect(() => subscribeSync((st) => { if (!st.running) load(); }), [load]);

  return (
    <Screen testID="projetos-screen">
      <Eyebrow>Seu acervo de criação</Eyebrow>
      <H1>Biblioteca</H1>
      <Text style={s.muted}>Tudo que você já gravou fica aqui para reutilizar em novos vídeos. O Diretor pode aproveitar esse material sem mandar você gravar de novo.</Text>

      <View style={s.row}>{CATEGORIES.map((c) => <Chip key={c.label} label={c.label} selected={cat === c.key} onPress={() => setCat(c.key)} />)}</View>

      <Section>{`Takes e cenas (${takes.length})`}</Section>
      {takes.length === 0 ? <Empty title="Sua biblioteca ainda está vazia" body="Grave pela aba Gravar ou cumpra uma missão de Hoje." /> : null}
      {takes.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="button" testID="take-row">
          <Card>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>{t.favorite ? "★ " : ""}{new Date(t.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: t.media.state === "uploaded_original" ? colors.good : t.media.state === "dead_letter" ? colors.bad : colors.warn }}>{SYNC_LABEL[t.media.state].toUpperCase()}</Text>
            </View>
            <Text style={s.muted}>{CATEGORY_LABEL(t.category)} · {Math.round((t.media.durationMs ?? 0) / 1000)}s · {(t.media.sizeBytes / 1_048_576).toFixed(1)} MB{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</Text>
          </Card>
        </Pressable>
      ))}

      <Section>Vídeos e roteiros</Section>
      {contents.length === 0 ? <Empty title="Nenhum vídeo criado ainda" body="Quando o Diretor preparar ou você gravar um conteúdo, ele aparece aqui." /> : null}
      {contents.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/content/${c.id}`)} accessibilityRole="button">
          <Card>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ flex: 1, fontWeight: "800", color: colors.ink }}>{c.draft!.title}</Text>
              <Text style={{ fontSize: 11, fontWeight: "900", color: c.status === "published" || c.status === "done" ? colors.good : colors.muted }}>{(STATUS_LABEL[c.status] ?? c.status).toUpperCase()}</Text>
            </View>
            <Text style={s.muted}>{dayLabel(c.date)} · {FORMAT_LABEL[c.format]} · {pillarName(c.pillarSlug)}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
