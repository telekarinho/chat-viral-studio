import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { MOOD_LABEL, MUSIC_LIBRARY, ownMusicId, ownMusicUuid, type EditChoices, type MusicMood, type MusicTrack, type OwnMusic } from "@postai/domain";
import { listOwnMusic, ownMusicUrl } from "../ownMusic";
import { loadMusicFavorites, toggleMusicFavorite } from "../musicFavorites";
import { Button, Chip, s } from "../ui";
import { OwnMusicSection } from "./OwnMusicSection";

type Tab = "favoritas" | "todas" | MusicMood | "minhas";
type Row = { id: string; title: string; subtitle: string; url?: string; own?: OwnMusic };

export function MusicDrawer({ value, onChange, workspaceId, business, voiceUri }: {
  value: EditChoices;
  onChange: (v: EditChoices) => void;
  workspaceId?: string;
  business: boolean;
  voiceUri?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("favoritas");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [own, setOwn] = useState<OwnMusic[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const players = useRef<VideoPlayer[]>([]);

  const reload = useCallback(async () => {
    setFavorites(await loadMusicFavorites(workspaceId));
    if (workspaceId) setOwn(await listOwnMusic(workspaceId));
  }, [workspaceId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => stop(), []);

  const rows = useMemo<Row[]>(() => {
    const builtIn = MUSIC_LIBRARY
      .filter((t) => !business || t.license === "comercial")
      .map((t: MusicTrack) => ({ id: t.id, title: t.title, subtitle: `${MOOD_LABEL[t.mood]}${t.bpm ? ` · ${t.bpm} BPM` : ""}`, url: t.url }));
    const mine = own.filter((m) => !business || m.comercial).map((m) => ({ id: ownMusicId(m.id), title: m.titulo, subtitle: "Minha música", own: m }));
    const all = [...mine, ...builtIn];
    if (tab === "favoritas") return all.filter((r) => favorites.includes(r.id));
    if (tab === "minhas") return mine;
    if (tab === "todas") return all;
    return builtIn.filter((r) => MUSIC_LIBRARY.find((t) => t.id === r.id)?.mood === tab);
  }, [business, favorites, own, tab]);

  function stop() {
    for (const p of players.current) {
      try { p.pause(); p.release(); } catch { /* já liberado */ }
    }
    players.current = [];
    setPlaying(null);
  }

  const play = async (row: Row) => {
    if (playing === row.id) return stop();
    stop();
    const url = row.own ? await ownMusicUrl(row.own.storageKey) : row.url;
    if (!url) return;
    const music = createVideoPlayer(url);
    music.volume = value.musicVolume ?? 0.22;
    players.current.push(music);
    if (voiceUri) {
      const voice = createVideoPlayer(voiceUri);
      voice.volume = 1;
      players.current.push(voice);
      voice.play();
    }
    music.play();
    setPlaying(row.id);
  };

  const fav = async (id: string) => setFavorites(await toggleMusicFavorite(id, workspaceId));
  const choose = (id: string) => onChange({ ...value, music: id });
  const selectedOwn = ownMusicUuid(value.music);
  const selectedTitle = selectedOwn ? own.find((m) => m.id === selectedOwn)?.titulo : MUSIC_LIBRARY.find((t) => t.id === value.music)?.title;

  return (
    <View style={{ gap: 8 }} testID="music-drawer">
      <Button
        variant="secondary"
        label={open ? "FECHAR MÚSICAS" : `🎵 ESCOLHER MÚSICA${selectedTitle ? ` · ${selectedTitle}` : ""}`}
        onPress={() => setOpen((v) => !v)}
        testID="open-music-drawer"
      />
      {!open ? null : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="♡ Favoritas" selected={tab === "favoritas"} onPress={() => setTab("favoritas")} />
            <Chip label="Todas" selected={tab === "todas"} onPress={() => setTab("todas")} />
            <Chip label="Minhas" selected={tab === "minhas"} onPress={() => setTab("minhas")} />
            {(Object.keys(MOOD_LABEL) as MusicMood[]).map((m) => <Chip key={m} label={MOOD_LABEL[m]} selected={tab === m} onPress={() => setTab(m)} />)}
          </View>

          {rows.length ? rows.map((row) => (
            <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }} testID={`music-row-${row.id}`}>
              <Button compact variant="secondary" label={playing === row.id ? "■" : "▶"} onPress={() => void play(row)} testID={`music-play-${row.id}`} />
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={s.body}>{row.title}</Text>
                <Text style={s.muted}>{row.subtitle}</Text>
              </View>
              <Button compact variant="ghost" label={favorites.includes(row.id) ? "♥" : "♡"} onPress={() => void fav(row.id)} testID={`music-fav-${row.id}`} />
              <Button compact variant={value.music === row.id ? "secondary" : "ghost"} label={value.music === row.id ? "✓ USANDO" : "USAR"} onPress={() => choose(row.id)} testID={`music-use-${row.id}`} />
            </View>
          )) : <Text style={s.muted}>Nenhuma música nesta categoria ainda.</Text>}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Automática" selected={value.music === "auto"} onPress={() => onChange({ ...value, music: "auto" })} />
            <Chip label="Sem música" selected={value.music === "none"} onPress={() => onChange({ ...value, music: "none" })} />
          </View>

          {workspaceId ? (
            <OwnMusicSection workspaceId={workspaceId} business={business} selected={value.music} onSelect={(music) => onChange({ ...value, music })} voiceUri={voiceUri} musicVolume={value.musicVolume ?? 0.22} />
          ) : null}
        </View>
      )}
    </View>
  );
}
