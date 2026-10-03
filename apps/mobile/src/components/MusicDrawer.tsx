import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  MOOD_LABEL, MUSIC_TABS, MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN, MUSIC_TAB_LABEL, autoCutTheme, moodForPillar, musicCatalog, musicTab, ownMusicUuid, searchMusic,
  type EditChoices, type MusicMood, type MusicRow, type MusicTab, type OwnMusic,
} from "@postai/domain";
import { listOwnMusic, ownMusicUrl } from "../ownMusic";
import { loadMusicFavorites, syncMusicFavorites, toggleMusicFavorite } from "../musicFavorites";
import { musicUsage } from "../db/repo";
import { useMusicPreview } from "../useMusicPreview";
import { Button, Chip, colors, s } from "../ui";
import { OwnMusicSection } from "./OwnMusicSection";

const VOLUME_STEP = 0.05;
const DEFAULT_VOLUME = 0.22;
const PRESETS = [["Baixinha", 0.12], ["Normal", 0.22], ["Mais alta", 0.35]] as const;

const mmss = (sec: number | null) => (sec === null ? "" : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`);
export const clampVolume = (v: number) => Math.round(Math.min(MUSIC_VOLUME_MAX, Math.max(MUSIC_VOLUME_MIN, v)) * 100) / 100;

/**
 * Biblioteca de música estilo TikTok: abre grande, busca instantânea, abas (Para você, Favoritas, Recentes, Todas,
 * Minhas, climas), uma faixa tocando por vez, ♥ sincronizado, USAR. "Em alta" não existe: não há fonte real de
 * tendência e o app nunca inventa. Volume e trecho da música ficam aqui também.
 */
export function MusicDrawer({ value, onChange, workspaceId, business, voiceUri, pillarSlug }: {
  value: EditChoices;
  onChange: (v: EditChoices) => void;
  workspaceId?: string;
  business: boolean;
  voiceUri?: string | null;
  pillarSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<MusicTab>("para_voce");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [own, setOwn] = useState<OwnMusic[]>([]);
  const [usage, setUsage] = useState<{ recents: string[]; count: Record<string, number> }>({ recents: [], count: {} });
  const [withVoice, setWithVoice] = useState(false);
  const preview = useMusicPreview();

  const reload = useCallback(async () => {
    setFavorites(await loadMusicFavorites(workspaceId));
    setUsage(await musicUsage().catch(() => ({ recents: [], count: {} })));
    if (workspaceId) {
      setOwn(await listOwnMusic(workspaceId).catch(() => []));
      setFavorites(await syncMusicFavorites(workspaceId).catch(() => loadMusicFavorites(workspaceId)));
    }
  }, [workspaceId]);
  useEffect(() => { void reload(); }, [reload]);
  // fechou a gaveta: para a música
  useEffect(() => { if (!open) preview.stop(); }, [open, preview]);

  const themeMood = autoCutTheme(value.autocut)?.choices.music;
  const mood: MusicMood | null = themeMood && themeMood !== "auto" ? themeMood : pillarSlug ? moodForPillar(pillarSlug, business) : null;
  const ctx = useMemo(() => ({ favorites, recents: usage.recents, mood }), [favorites, usage.recents, mood]);
  const catalog = useMemo(() => musicCatalog(own, business), [own, business]);
  const rows = useMemo(() => searchMusic(query.trim() ? catalog : musicTab(catalog, tab, ctx), query), [catalog, tab, ctx, query]);
  const volume = value.musicVolume ?? DEFAULT_VOLUME;
  const startS = value.musicStartS ?? 0;
  const current = catalog.find((r) => r.id === value.music);
  const ownGone = ownMusicUuid(value.music) && !current && own.length > 0;

  const play = (row: MusicRow, from = 0) => void preview.toggle(row.id, row.own ? ownMusicUrl(row.own.storageKey) : row.url, {
    volume, startS: from, voiceUri: withVoice ? voiceUri : null,
  });
  const fav = async (id: string) => setFavorites(await toggleMusicFavorite(id, workspaceId));
  // trocou a faixa: o trecho escolhido era da outra música
  const use = (id: string) => onChange({ ...value, music: id, musicStartS: id === value.music ? value.musicStartS : undefined });
  const setVolume = (v: number) => onChange({ ...value, musicVolume: clampVolume(v) });
  const setStart = (sec: number | undefined) => onChange({ ...value, musicStartS: sec === undefined ? undefined : Math.max(0, Math.min(Math.round(sec), (current?.durationSec ?? 600) - 5)) });

  const label = value.music === "none" ? "Sem música" : value.music === "auto" ? "Automática" : current?.title ?? (ownGone ? "música removida" : "escolhida");
  return (
    <View style={{ gap: 8 }} testID="music-drawer">
      <Button variant="secondary" label={`🎵 ESCOLHER MÚSICA · ${label}`} onPress={() => setOpen(true)} testID="open-music-drawer" />
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 10 }} testID="music-sheet">
          <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.ink }}>Músicas</Text>
            <Button compact variant="ghost" label="FECHAR" onPress={() => setOpen(false)} testID="close-music-drawer" />
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar: nome, artista, clima ou BPM (ex.: 120)" style={s.input} testID="music-search" accessibilityLabel="Buscar música" />
          {!query.trim() ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
              {MUSIC_TABS.map((t) => <Chip key={t} label={MUSIC_TAB_LABEL[t]} selected={tab === t} onPress={() => setTab(t)} testID={`music-tab-${t}`} />)}
              {(Object.keys(MOOD_LABEL) as MusicMood[]).filter((m) => !business || m !== "humor").map((m) => (
                <Chip key={m} label={MOOD_LABEL[m]} selected={tab === m} onPress={() => setTab(m)} testID={`music-tab-${m}`} />
              ))}
            </ScrollView>
          ) : null}
          {voiceUri ? (
            <Chip label={withVoice ? "🎙 Ouvindo com a sua voz" : "🎙 Ouvir com a minha voz"} selected={withVoice} onPress={() => setWithVoice(!withVoice)} testID="music-with-voice" />
          ) : null}
          {preview.error ? <Text style={{ color: colors.bad }}>{preview.error}</Text> : null}
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            style={{ flex: 1 }}
            initialNumToRender={12}
            windowSize={7}
            ListEmptyComponent={<Text style={s.muted} testID="music-empty">{tab === "favoritas" ? "Toque em ♡ para guardar suas favoritas." : tab === "recentes" ? "As músicas dos seus últimos vídeos aparecem aqui." : "Nenhuma música aqui ainda."}</Text>}
            renderItem={({ item }) => (
              <MusicRowView row={item} playing={preview.playing === item.id} fav={favorites.includes(item.id)} using={value.music === item.id}
                used={usage.count[item.id] ?? 0} onPlay={() => play(item)} onFav={() => void fav(item.id)} onUse={() => use(item.id)} />
            )}
          />
          {tab === "minhas" && workspaceId && !query.trim() ? (
            <OwnMusicSection workspaceId={workspaceId} business={business} list={own} usage={usage.count} onListChange={setOwn}
              onSelect={(music) => use(music)} />
          ) : null}
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip label="✨ Automática" selected={value.music === "auto"} onPress={() => onChange({ ...value, music: "auto", musicStartS: undefined })} testID="music-auto" />
              <Chip label="Sem música" selected={value.music === "none"} onPress={() => onChange({ ...value, music: "none" })} testID="music-none" />
            </View>
            {value.music !== "none" ? (
              <>
                <VolumeControl volume={volume} onChange={setVolume} />
                {current ? (
                  <View style={[s.row, { alignItems: "center", gap: 6, flexWrap: "wrap" }]} testID="music-start">
                    <Text style={s.body}>{`Trecho: começa em ${mmss(startS)}${value.musicStartS === undefined ? " (automático)" : ""}`}</Text>
                    {([-10, -2, 2, 10] as const).map((d) => <Button key={d} compact variant="ghost" label={`${d > 0 ? "+" : ""}${d}s`} onPress={() => setStart(startS + d)} testID={`music-start-${d}`} />)}
                    <Button compact variant="secondary" label={preview.playing === current.id ? "■" : "▶ trecho"} onPress={() => play(current, startS)} testID="music-start-play" />
                    {value.musicStartS !== undefined ? <Button compact variant="ghost" label="automático" onPress={() => setStart(undefined)} /> : null}
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={s.muted}>A música abaixa sozinha quando você fala (no vídeo final). Músicas próprias: a licença é a que você declarou ao enviar.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MusicRowView({ row, playing, fav, using, used, onPlay, onFav, onUse }: {
  row: MusicRow; playing: boolean; fav: boolean; using: boolean; used: number; onPlay: () => void; onFav: () => void; onUse: () => void;
}) {
  const details = [row.artist, mmss(row.durationSec), row.bpm ? `${row.bpm} BPM` : "", row.mood ? MOOD_LABEL[row.mood] : "", used ? `usada em ${used} vídeo${used > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }} testID={`music-row-${row.id}`}>
      <Pressable onPress={onPlay} accessibilityRole="button" accessibilityLabel={playing ? `Parar ${row.title}` : `Ouvir ${row.title}`} testID={`music-play-${row.id}`}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: playing ? colors.ink : colors.card }}>
        <Text style={{ color: playing ? colors.bg : colors.ink, fontSize: 18, fontWeight: "900" }}>{playing ? "■" : "▶"}</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800", color: colors.ink }} numberOfLines={1}>{row.title}</Text>
        <Text style={s.muted} numberOfLines={1}>{details}</Text>
        {row.own ? <Text style={{ fontSize: 11, color: colors.muted }}>{row.license === "comercial" ? "licença comercial declarada" : "uso pessoal declarado"}</Text> : null}
      </View>
      <Pressable onPress={onFav} accessibilityRole="button" accessibilityLabel={fav ? "Tirar das favoritas" : "Favoritar"} hitSlop={8} testID={`music-fav-${row.id}`}>
        <Text style={{ fontSize: 22, color: fav ? colors.bad : colors.muted }}>{fav ? "♥" : "♡"}</Text>
      </Pressable>
      <Button compact variant={using ? "secondary" : "primary"} label={using ? "✓ USANDO" : "USAR"} onPress={onUse} testID={`music-use-${row.id}`} />
    </View>
  );
}

/** Presets + ajuste fino de 5 em 5%, com barra. Limite de cima protege a fala. */
function VolumeControl({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const pct = Math.round(volume * 100);
  const fill = (volume - MUSIC_VOLUME_MIN) / (MUSIC_VOLUME_MAX - MUSIC_VOLUME_MIN);
  return (
    <View style={{ gap: 6 }} testID="music-volume">
      <View style={[s.row, { alignItems: "center", gap: 8 }]}>
        <Text style={[s.body, { width: 110 }]} testID="music-volume-value">{`Volume: ${pct}%`}</Text>
        <Button compact variant="ghost" label="−" onPress={() => onChange(volume - VOLUME_STEP)} testID="music-volume-down" />
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" }}>
          <View style={{ width: `${Math.round(fill * 100)}%`, height: 8, backgroundColor: colors.ink }} />
        </View>
        <Button compact variant="ghost" label="+" onPress={() => onChange(volume + VOLUME_STEP)} testID="music-volume-up" />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {PRESETS.map(([l, v]) => <Chip key={l} label={l} selected={Math.abs(volume - v) < 0.005} onPress={() => onChange(v)} testID={`music-volume-${l}`} />)}
      </View>
    </View>
  );
}
