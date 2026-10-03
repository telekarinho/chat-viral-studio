import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { FORMAT_LABEL, SYNC_LABEL, musicCatalog, type OwnMusic } from "@postai/domain";
import { listRecentContent, listTakes, type ContentItem, type Take } from "../../src/db/repo";
import { localCover } from "../../src/finalRender";
import { listOwnMusic } from "../../src/ownMusic";
import { loadMusicFavorites } from "../../src/musicFavorites";
import { Card, Chip, Empty, Eyebrow, H1, Screen, colors, s } from "../../src/ui";
import { subscribeSync } from "../../src/sync/engine";
import { useApp } from "../../src/app-state";

const STATUS_LABEL: Record<ContentItem["status"], string> = { planned: "planejado", scripted: "roteiro pronto", recorded: "gravado", published: "postado", done: "concluído" };
const CATEGORY_LABEL: Record<string, string> = { broll: "B-roll", thought: "Pensamento", main_video: "Vídeo", livre: "Livre", patrimonio: "Patrimônio", story: "Story" };
const dayLabel = (dateKey: string) => dateKey.split("-").reverse().join("/");

type Tab = "videos" | "takes" | "broll" | "provas" | "roteiros" | "musicas";
const TABS: { key: Tab; label: string }[] = [
  { key: "videos", label: "Vídeos" }, { key: "takes", label: "Takes" }, { key: "broll", label: "B-roll" },
  { key: "provas", label: "Provas" }, { key: "roteiros", label: "Roteiros" }, { key: "musicas", label: "Músicas" },
];
/** prova/produto: tomada do estúdio (tem "shot") ou patrimônio filmado */
const isProof = (t: Take) => Boolean(t.meta?.shot) || t.category === "patrimonio";
const takeTab = (t: Take): Tab => (t.category === "broll" ? "broll" : isProof(t) ? "provas" : "takes");

/**
 * Biblioteca: o acervo para reutilizar. Tudo local (funciona offline); músicas próprias vêm da nuvem quando dá.
 * O Diretor (Claude) vê os mesmos takes pelo conector antes de pedir para gravar de novo.
 */
export default function Biblioteca() {
  const { workspace } = useApp();
  const pillarName = (slug: string) => workspace?.pillars.find((p) => p.slug === slug)?.name ?? slug;
  const [tab, setTab] = useState<Tab>("videos");
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [takes, setTakes] = useState<Take[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [own, setOwn] = useState<OwnMusic[]>([]);
  const [favMusic, setFavMusic] = useState<string[]>([]);

  const load = useCallback(() => {
    void listTakes().then(setTakes);
    void listRecentContent(60).then(async (cs) => {
      setContents(cs);
      const pairs = await Promise.all(cs.filter((c) => c.status !== "planned").map(async (c) => [c.id, await localCover(c.id).catch(() => null)] as const));
      setCovers(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => Boolean(p[1]))));
    });
    void loadMusicFavorites(workspace?.cloud ? workspace.id : undefined).then(setFavMusic).catch(() => undefined);
    if (workspace?.cloud) void listOwnMusic(workspace.id).then(setOwn).catch(() => undefined);
  }, [workspace]);
  useFocusEffect(load);
  useEffect(() => subscribeSync((st) => { if (!st.running) load(); }), [load]);

  const q = query.trim().toLowerCase();
  const match = (...xs: (string | null | undefined)[]) => !q || xs.some((x) => x?.toLowerCase().includes(q));
  const shownTakes = useMemo(() => takes.filter((t) => takeTab(t) === tab && (!onlyFav || t.favorite)
    && match(CATEGORY_LABEL[t.category] ?? t.category, t.tags.join(" "), t.meta?.capitulo, new Date(t.createdAt).toLocaleDateString("pt-BR"))), [takes, tab, onlyFav, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const videos = contents.filter((c) => (c.status === "recorded" || c.status === "published" || c.status === "done" || covers[c.id]) && match(c.draft?.title ?? c.title, pillarName(c.pillarSlug)));
  const scripts = contents.filter((c) => c.draft && match(c.draft.title, c.draft.topic, c.draft.script, pillarName(c.pillarSlug)));
  const music = musicCatalog(own, workspace?.profile.kind === "empresa").filter((r) => (favMusic.includes(r.id) || r.own) && match(r.title, r.artist));
  const counts: Record<Tab, number> = {
    videos: videos.length, roteiros: scripts.length, musicas: music.length,
    takes: takes.filter((t) => takeTab(t) === "takes").length, broll: takes.filter((t) => takeTab(t) === "broll").length, provas: takes.filter((t) => takeTab(t) === "provas").length,
  };

  return (
    <Screen testID="projetos-screen">
      <Eyebrow>Seu acervo de criação</Eyebrow>
      <H1>Biblioteca</H1>
      <TextInput value={query} onChangeText={setQuery} placeholder="Buscar no acervo" style={s.input} accessibilityLabel="Buscar na biblioteca" testID="library-search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TABS.map((t) => <Chip key={t.key} label={`${t.label} ${counts[t.key]}`} selected={tab === t.key} onPress={() => setTab(t.key)} testID={`library-tab-${t.key}`} />)}
      </ScrollView>
      {tab === "takes" || tab === "broll" || tab === "provas" ? (
        <View style={s.row}><Chip label="★ Só favoritos" selected={onlyFav} onPress={() => setOnlyFav(!onlyFav)} testID="library-only-fav" /></View>
      ) : null}

      {tab === "videos" ? (
        videos.length ? videos.map((c) => (
          <Pressable key={c.id} onPress={() => router.push(covers[c.id] ? `/final/${c.id}` : `/content/${c.id}`)} accessibilityRole="button" testID="video-row">
            <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {covers[c.id] ? <Image source={{ uri: covers[c.id] }} style={{ width: 54, height: 96, borderRadius: 8, backgroundColor: "#000" }} accessibilityIgnoresInvertColors />
                : <View style={{ width: 54, height: 96, borderRadius: 8, backgroundColor: colors.line, alignItems: "center", justifyContent: "center" }}><Text style={s.muted}>▶</Text></View>}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontWeight: "800", color: colors.ink }} numberOfLines={2}>{c.draft?.title ?? c.title}</Text>
                <Text style={s.muted}>{`${dayLabel(c.date)} · ${FORMAT_LABEL[c.format]} · ${pillarName(c.pillarSlug)}`}</Text>
                <Text style={{ fontSize: 11, fontWeight: "900", color: c.status === "published" || c.status === "done" ? colors.good : colors.muted }}>{(STATUS_LABEL[c.status] ?? c.status).toUpperCase()}</Text>
              </View>
            </Card>
          </Pressable>
        )) : <Empty title="Nenhum vídeo ainda" body="Os vídeos que você gravar e montar aparecem aqui, com a capa." />
      ) : tab === "roteiros" ? (
        scripts.length ? scripts.map((c) => (
          <Pressable key={c.id} onPress={() => router.push(`/content/${c.id}`)} accessibilityRole="button">
            <Card>
              <Text style={{ fontWeight: "800", color: colors.ink }}>{c.draft!.title}</Text>
              <Text style={s.muted}>{`${dayLabel(c.date)} · ${FORMAT_LABEL[c.format]} · ${pillarName(c.pillarSlug)} · ${(STATUS_LABEL[c.status] ?? c.status)}`}</Text>
            </Card>
          </Pressable>
        )) : <Empty title="Nenhum roteiro" body="Os roteiros do Diretor aparecem aqui." />
      ) : tab === "musicas" ? (
        music.length ? music.map((r) => (
          <Card key={r.id}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>{`${favMusic.includes(r.id) ? "♥ " : ""}${r.title}`}</Text>
            <Text style={s.muted}>{r.own ? `música sua · ${r.license === "comercial" ? "licença comercial declarada" : "uso pessoal"}` : [r.artist, r.bpm ? `${r.bpm} BPM` : ""].filter(Boolean).join(" · ")}</Text>
          </Card>
        )) : <Empty title="Nenhuma música guardada" body="Favorite (♡) músicas ou envie as suas na escolha de música ao finalizar um vídeo." />
      ) : shownTakes.length ? shownTakes.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/take/${t.id}`)} accessibilityRole="button" testID="take-row">
          <Card>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>{t.favorite ? "★ " : ""}{new Date(t.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: t.media.state === "uploaded_original" ? colors.good : t.media.state === "dead_letter" ? colors.bad : colors.warn }}>{SYNC_LABEL[t.media.state].toUpperCase()}</Text>
            </View>
            <Text style={s.muted}>{`${CATEGORY_LABEL[t.category] ?? t.category}${t.meta?.capitulo ? ` · ${t.meta.capitulo}` : ""} · ${Math.round((t.media.durationMs ?? 0) / 1000)}s · ${(t.media.sizeBytes / 1_048_576).toFixed(1)} MB${t.tags.length ? ` · ${t.tags.join(", ")}` : ""}`}</Text>
          </Card>
        </Pressable>
      )) : <Empty title={onlyFav ? "Nenhum favorito aqui" : "Nada aqui ainda"} body={tab === "provas" ? "Provas e tomadas de produto gravadas no estúdio aparecem aqui." : "Grave pela aba Gravar ou cumpra uma missão de Hoje."} />}
    </Screen>
  );
}
