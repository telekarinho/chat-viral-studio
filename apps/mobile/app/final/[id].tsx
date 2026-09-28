import { useCallback, useState } from "react";
import { Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@postai/domain";
import { getContent, type ContentItem } from "../../src/db/repo";
import { localFinal } from "../../src/finalRender";
import { Button, Card, Chip, Eyebrow, H1, Loading, Screen, s } from "../../src/ui";

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: "#000" }} nativeControls contentFit="contain" />;
}

/** Final edited video + caption: everything needed to post. */
export default function FinalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [c, setC] = useState<ContentItem | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copied, setCopied] = useState(false);
  useFocusEffect(useCallback(() => {
    void localFinal(id).then(setUri);
    void getContent(id).then(setC);
  }, [id]));

  if (!uri || !c?.draft) return <Screen><Loading label="Abrindo vídeo final…" /></Screen>;
  const caption = c.draft.caption[platform];
  return (
    <Screen testID="final-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Pronto para postar</Eyebrow>
      <H1>{c.draft.title}</H1>
      <Player uri={uri} />
      <Button label="COMPARTILHAR / POSTAR VÍDEO" onPress={() => Sharing.shareAsync(uri, { mimeType: "video/mp4", dialogTitle: "Postar vídeo" })} testID="share-final" />
      <Text style={s.label}>Legenda</Text>
      <Card style={{ gap: 8 }}>
        <Text style={s.body} selectable>{caption}</Text>
      </Card>
      {PLATFORMS.map((p) => <Chip key={p} label={PLATFORM_LABEL[p]} selected={platform === p} onPress={() => { setPlatform(p); setCopied(false); }} />)}
      <Button variant="secondary" label={copied ? "LEGENDA COPIADA ✓" : "COPIAR LEGENDA"} onPress={async () => { await Clipboard.setStringAsync(caption); setCopied(true); }} />
      <Text style={s.muted}>Dica: copie a legenda antes de compartilhar — cole no app da rede social.</Text>
    </Screen>
  );
}
