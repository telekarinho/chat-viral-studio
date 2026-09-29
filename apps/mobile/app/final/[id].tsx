import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@postai/domain";
import { getContent, type ContentItem } from "../../src/db/repo";
import { localFinal } from "../../src/finalRender";
import { SHARE_TARGETS, shareVideoTo, type ShareTarget } from "../../src/share";
import { reportError } from "../../src/telemetry";
import { Button, Card, Chip, Eyebrow, H1, Loading, Screen, colors, s } from "../../src/ui";

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: "78%", alignSelf: "center", aspectRatio: 9 / 16, borderRadius: 16, backgroundColor: "#000" }} nativeControls contentFit="contain" />;
}

const BUTTON_ORDER: ShareTarget[] = ["tiktok", "instagram", "youtube", "whatsapp"];

/** Vídeo final pronto: 1 toque para cada rede (legenda da rede copiada, vídeo já anexado). */
export default function FinalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [c, setC] = useState<ContentItem | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    void localFinal(id).then(setUri);
    void getContent(id).then(setC);
  }, [id]));

  if (!uri || !c?.draft) return <Screen><Loading label="Abrindo vídeo final…" /></Screen>;
  const draft = c.draft;
  const caption = draft.caption[platform];

  async function share(target: ShareTarget | null) {
    try {
      const how = await shareVideoTo(target, uri!, draft);
      const label = target ? SHARE_TARGETS[target].label : "o app";
      setNotice(how === "app"
        ? `Abrindo ${label} com o vídeo. A legenda já está copiada — é só colar.`
        : `Escolha ${label} na lista. A legenda já está copiada — é só colar.`);
    } catch (e) {
      reportError(e, "share");
      setNotice("Não consegui abrir o app. Tente OUTROS APPS.");
    }
  }

  return (
    <Screen testID="final-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Pronto para postar</Eyebrow>
      <H1>{draft.title}</H1>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {BUTTON_ORDER.map((t) => (
          <View key={t} style={{ flexBasis: "47%", flexGrow: 1 }}>
            <Button label={`POSTAR NO ${SHARE_TARGETS[t].label.toUpperCase()}`} onPress={() => void share(t)} testID={`share-${t}`} />
          </View>
        ))}
      </View>
      <Button variant="secondary" label="OUTROS APPS" onPress={() => void share(null)} testID="share-final" />
      {notice ? <Text style={{ color: colors.good, fontWeight: "800" }} accessibilityLiveRegion="polite">{notice}</Text> : null}
      <Player uri={uri} />
      <Text style={s.label}>Legenda de cada rede (copiada sozinha ao postar)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PLATFORMS.map((p) => <Chip key={p} label={PLATFORM_LABEL[p]} selected={platform === p} onPress={() => { setPlatform(p); setCopied(false); }} />)}
      </View>
      <Card style={{ gap: 8 }}>
        <Text style={s.body} selectable>{caption}</Text>
      </Card>
      <Button variant="ghost" label={copied ? "LEGENDA COPIADA ✓" : "COPIAR ESTA LEGENDA"} onPress={async () => { await Clipboard.setStringAsync(caption); setCopied(true); }} />
    </Screen>
  );
}
