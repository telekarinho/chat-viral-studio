import { useCallback, useState } from "react";
import { Text, TextInput } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { SYNC_LABEL } from "@postai/domain";
import { getTake, updateTakeMeta, type Take } from "../../src/db/repo";
import { fileExists } from "../../src/media";
import { retryMedia } from "../../src/sync/engine";
import { Button, Card, Eyebrow, H1, Loading, Screen, colors, s } from "../../src/ui";

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: "#000" }} nativeControls contentFit="contain" />;
}

export default function TakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [take, setTake] = useState<Take | null>(null);
  const [tags, setTags] = useState("");
  const load = useCallback(async () => {
    const t = await getTake(id);
    setTake(t);
    setTags(t?.tags.join(", ") ?? "");
  }, [id]);
  useFocusEffect(useCallback(() => void load(), [load]));

  if (!take) return <Screen><Loading /></Screen>;
  const m = take.media;
  const exists = fileExists(m.localUri);
  return (
    <Screen testID="take-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>{take.category} · {take.camera === "back" ? "câmera traseira" : "câmera frontal"}</Eyebrow>
      <H1>Take {new Date(take.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</H1>
      {exists ? <Player uri={m.localUri} /> : <Card><Text style={{ color: colors.bad, fontWeight: "700" }}>Arquivo local removido (já estava sincronizado e verificado).</Text></Card>}
      <Card testID="take-info">
        <Text style={s.body} testID="take-sync-state">{SYNC_LABEL[m.state]}</Text>
        <Text style={s.muted}>{(m.sizeBytes / 1_048_576).toFixed(1)} MB · {Math.round((m.durationMs ?? 0) / 1000)}s · {m.width ?? "?"}×{m.height ?? "?"}</Text>
        <Text style={s.muted} selectable testID="take-checksum">MD5 {m.checksum}</Text>
        {m.remoteVerifiedAt ? <Text style={{ color: colors.good, fontWeight: "700" }}>Integridade na nuvem confirmada em {new Date(m.remoteVerifiedAt).toLocaleString("pt-BR")}</Text> : null}
        {m.lastError && m.state !== "uploaded_original" ? <Text style={s.muted}>Última tentativa: {m.lastError}</Text> : null}
      </Card>
      {m.state === "dead_letter" || (m.state === "queued" && m.attempts > 0) ? <Button label="TENTAR ENVIAR DE NOVO" onPress={async () => { await retryMedia(m); await load(); }} /> : null}
      <Text style={s.label}>Tags (separadas por vírgula)</Text>
      <TextInput style={s.input} value={tags} onChangeText={setTags} accessibilityLabel="Tags" placeholder="café, manhã, rua" />
      <Button variant="secondary" label="SALVAR TAGS" onPress={() => updateTakeMeta(take.id, { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }).then(load)} />
      <Button variant="secondary" label={take.favorite ? "★ FAVORITO" : "☆ MARCAR FAVORITO"} onPress={() => updateTakeMeta(take.id, { favorite: !take.favorite }).then(load)} />
      {take.contentItemId ? <Button variant="ghost" label="VER ROTEIRO / LEGENDA" onPress={() => router.push(`/content/${take.contentItemId}`)} /> : null}
    </Screen>
  );
}
