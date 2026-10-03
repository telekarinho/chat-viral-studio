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
  // faixa do mini player: a última que tocou (ou a escolhida)
  const [focusId, setFocusId] = useState<string | null>(null);
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

  const play = (row: MusicRow, from = row.id === value.music ? startS : 0) => {
    setFocusId(row.id);
    void preview.toggle(row.id, row.own ? ownMusicUrl(row.own.storageKey) : row.url, { volume, startS: from, voiceUri: withVoice ? voiceUri : null });
  };
  const focus = catalog.find((r) => r.id === (focusId ?? value.music));
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
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.ink }}>Escolher música</Text>
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
          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }} testID="mini-player">
            {focus && value.music !== "none" ? (
              <>
                <View style={[s.row, { alignItems: "center", gap: 8 }]}>
                  <Pressable onPress={() => play(focus)} accessibilityRole="button" accessibilityLabel={preview.playing === focus.id ? "Parar" : "Ouvir"} testID="mini-play"
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink }}>
                    <Text style={{ color: colors.bg, fontWeight: "900" }}>{preview.playing === focus.id ? "■" : "▶"}</Text>
                  </Pressable>
                  <Text style={{ flex: 1, fontWeight: "800", color: colors.ink }} numberOfLines={1} testID="mini-title">{focus.title}</Text>
                  <Pressable onPress={() => void fav(focus.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Favoritar" testID="mini-fav">
                    <Text style={{ fontSize: 22, color: favorites.includes(focus.id) ? colors.bad : colors.muted }}>{favorites.includes(focus.id) ? "♥" : "♡"}</Text>
                  </Pressable>
                  <Button compact variant={value.music === focus.id ? "secondary" : "primary"} label={value.music === focus.id ? "✓ USANDO" : "USAR"} onPress={() => use(focus.id)} testID="mini-use" />
                </View>
                {focus.durationSec ? (
                  <Timeline durationS={focus.durationSec} positionS={preview.playing === focus.id ? preview.position : null}
                    startS={value.music === focus.id ? startS : null}
                    onPick={(sec) => {
                      // na faixa escolhida, tocar na linha define onde a música começa no vídeo
                      if (value.music === focus.id) setStart(sec);
                      if (preview.playing === focus.id) preview.stop();
                      play(focus, sec);
                    }} />
                ) : null}
                {value.music === focus.id ? (
                  <View style={[s.row, { alignItems: "center", gap: 6, flexWrap: "wrap" }]} testID="music-start">
                    <Text style={s.body}>{`Começar em ${mmss(startS)}${value.musicStartS === undefined ? " (automático)" : ""}`}</Text>
                    {([-2, 2] as const).map((d) => <Button key={d} compact variant="ghost" label={`${d > 0 ? "+" : ""}${d}s`} onPress={() => setStart(startS + d)} testID={`music-start-${d}`} />)}
                    {value.musicStartS !== undefined ? <Button compact variant="ghost" label="automático" onPress={() => setStart(undefined)} /> : null}
                  </View>
                ) : null}
              </>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip label="✨ Automática" selected={value.music === "auto"} onPress={() => onChange({ ...value, music: "auto", musicStartS: undefined })} testID="music-auto" />
              <Chip label="Sem música" selected={value.music === "none"} onPress={() => onChange({ ...value, music: "none" })} testID="music-none" />
              {voiceUri && value.music !== "none" ? (
                <Chip label={withVoice ? "🎙 OUVINDO COM MINHA VOZ" : "🎙 OUVIR COM MINHA VOZ"} selected={withVoice} onPress={() => { setWithVoice(!withVoice); preview.stop(); }} testID="music-with-voice" />
              ) : null}
            </View>
            {value.music !== "none" ? <VolumeControl volume={volume} onChange={setVolume} /> : null}
            <Text style={s.muted}>{withVoice ? "Prévia aproximada com a sua voz. O render final aplica o ducking completo (a música abaixa quando você fala)." : "O render final aplica o ducking completo: a música abaixa sozinha quando você fala. Músicas próprias: a licença é a que você declarou."}</Text>
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

/**
 * Linha do tempo da faixa: tocar em um ponto toca dali (e, na faixa escolhida, define onde ela começa no vídeo).
 * ponytail: sem arrastar (só toque) — um slider nativo exigiria módulo novo no build.
 */
function Timeline({ durationS, positionS, startS, onPick }: { durationS: number; positionS: number | null; startS: number | null; onPick: (sec: number) => void }) {
  const [width, setWidth] = useState(1);
  const pct = (sec: number) => `${Math.min(100, Math.max(0, (sec / durationS) * 100))}%` as const;
  return (
    <View style={{ gap: 2 }}>
      <Pressable onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)} onPress={(e) => onPick(Math.round((e.nativeEvent.locationX / width) * durationS))}
        accessibilityRole="adjustable" accessibilityLabel="Linha do tempo da música" testID="music-timeline" style={{ height: 28, justifyContent: "center" }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
          {positionS !== null ? <View style={{ width: pct(positionS), height: 6, borderRadius: 3, backgroundColor: colors.ink }} /> : null}
        </View>
        {startS !== null ? <View style={{ position: "absolute", left: pct(startS), width: 3, height: 22, backgroundColor: colors.accent }} testID="music-start-marker" /> : null}
      </Pressable>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.muted}>{mmss(positionS ?? startS ?? 0)}</Text>
        <Text style={s.muted}>{mmss(durationS)}</Text>
      </View>
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
