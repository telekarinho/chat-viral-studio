import { useState } from "react";
import { Alert, Linking, Text, TextInput, View } from "react-native";
import { ownMusicId, type OwnMusic } from "@postai/domain";
import { deleteOwnMusic, renameOwnMusic, uploadOwnMusic, type OwnMusicOrigin } from "../ownMusic";
import { reportError } from "../telemetry";
import { Button, colors, s } from "../ui";

const ORIGINS: { origem: OwnMusicOrigin; label: string; business: string }[] = [
  { origem: "minha", label: "É MINHA", business: "É MINHA" },
  { origem: "licenciada", label: "TENHO LICENÇA", business: "TENHO LICENÇA COMERCIAL" },
  { origem: "youtube_audio_library", label: "BIBLIOTECA DE ÁUDIO DO YOUTUBE", business: "BIBLIOTECA DE ÁUDIO DO YOUTUBE" },
];

/**
 * Gerenciar as músicas próprias do perfil: enviar (MP3, M4A, AAC, WAV) dizendo de onde veio, renomear, tirar da
 * biblioteca. A origem/licença é a DECLARAÇÃO do criador (não é comprovação jurídica). Para YouTube, só arquivo
 * obtido na Biblioteca de Áudio do YouTube — o app nunca baixa nem separa áudio de vídeo do YouTube.
 */
export function OwnMusicSection({ workspaceId, business, list, usage, onListChange, onSelect }: {
  workspaceId: string; business: boolean; list: OwnMusic[]; usage: Record<string, number>;
  onListChange: (l: OwnMusic[]) => void; onSelect: (musicId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const send = (origem: OwnMusicOrigin) => {
    setPicking(false);
    setBusy(true);
    setMsg(null);
    // empresa: só pode enviar declarando uso comercial; pessoal: licença declarada vale para o perfil pessoal
    uploadOwnMusic(workspaceId, { origem, comercial: true })
      .then((m) => {
        if (!m) return;
        onListChange([m, ...list]);
        onSelect(ownMusicId(m.id));
        setMsg(`“${m.titulo}” salva em Minhas músicas e escolhida para este vídeo.`);
      })
      .catch((e: unknown) => { reportError(e, "own music"); setMsg(e instanceof Error ? e.message : String(e)); })
      .finally(() => setBusy(false));
  };

  const saveName = () => {
    if (!editing) return;
    const { id, name } = editing;
    renameOwnMusic(workspaceId, id, name)
      .then(() => { onListChange(list.map((m) => (m.id === id ? { ...m, titulo: name.trim().slice(0, 120) } : m))); setEditing(null); })
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : String(e)));
  };

  const remove = (m: OwnMusic) => Alert.alert(`Tirar “${m.titulo}” da biblioteca?`, "Vídeos já prontos não mudam. Vídeo ainda não montado que usa esta música passa a usar a automática.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Tirar", style: "destructive", onPress: () => void deleteOwnMusic(workspaceId, m).then(() => onListChange(list.filter((x) => x.id !== m.id))).catch((e: unknown) => setMsg(e instanceof Error ? e.message : String(e))) },
  ]);

  const usable = list.filter((m) => !business || m.comercial);
  return (
    <View style={{ gap: 8 }} testID="own-music">
      {usable.map((m) => (
        <View key={m.id} style={[s.row, { alignItems: "center", gap: 6, flexWrap: "wrap" }]} testID={`own-manage-${m.id}`}>
          {editing?.id === m.id ? (
            <>
              <TextInput value={editing.name} onChangeText={(name) => setEditing({ id: m.id, name })} style={[s.input, { flex: 1, minWidth: 140 }]} autoFocus testID={`own-name-${m.id}`} accessibilityLabel="Nome da música" />
              <Button compact label="SALVAR" onPress={saveName} testID={`own-save-${m.id}`} />
            </>
          ) : (
            <>
              <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{`🎤 ${m.titulo}${usage[ownMusicId(m.id)] ? ` · em ${usage[ownMusicId(m.id)]} vídeo(s)` : ""}`}</Text>
              <Button compact variant="ghost" label="RENOMEAR" onPress={() => setEditing({ id: m.id, name: m.titulo })} testID={`own-rename-${m.id}`} />
              <Button compact variant="ghost" label="TIRAR" onPress={() => remove(m)} testID={`own-delete-${m.id}`} />
            </>
          )}
        </View>
      ))}
      {picking ? (
        <View style={{ gap: 6 }} testID="own-origin">
          <Text style={s.label}>De onde veio essa música?</Text>
          <Text style={s.muted}>{business ? "Perfil de empresa: só música sua ou com licença de uso COMERCIAL." : "Música de artista sem licença faz a rede tirar o som ou o vídeo."}</Text>
          {ORIGINS.map((o) => <Button key={o.origem} compact variant="secondary" label={business ? o.business : o.label} onPress={() => send(o.origem)} testID={`own-origin-${o.origem}`} />)}
          <Button compact variant="ghost" label="CANCELAR" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button compact variant="secondary" label="＋ ENVIAR MINHA MÚSICA" loading={busy} onPress={() => setPicking(true)} testID="upload-own-music" />
          <Button compact variant="ghost" label="♫ ABRIR BIBLIOTECA DE ÁUDIO DO YOUTUBE" onPress={() => void Linking.openURL("https://www.youtube.com/audiolibrary")} testID="youtube-audio-library" />
        </View>
      )}
      <Text style={s.muted}>MP3, M4A, AAC ou WAV (até 20 MB). Da Biblioteca de Áudio do YouTube: baixe lá e envie aqui. O app não baixa nem separa áudio de vídeos do YouTube.</Text>
      {msg ? <Text style={{ color: colors.info, fontWeight: "700" }}>{msg}</Text> : null}
    </View>
  );
}
