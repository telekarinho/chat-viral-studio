import { useCallback, useState } from "react";
import { Image, Text, View } from "react-native";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@postai/domain";
import { getContent, type ContentItem } from "../../src/db/repo";
import { describeResult, localCover, localFinal, localResult, type RenderResult } from "../../src/finalRender";
import { FREE_SPEECH_MODEL } from "../../src/freeSpeech";
import { MetricsCard } from "../../src/components/MetricsCard";
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
  const { id, v } = useLocalSearchParams<{ id: string; v?: string }>();
  const variant = v === "curto" ? "curto" : "completo";
  const [cover, setCover] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [c, setC] = useState<ContentItem | null>(null);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    void localFinal(id, variant).then(setUri);
    void localCover(id, variant).then(setCover);
    void localResult(id, variant).then(setResult);
    void getContent(id).then(setC);
  }, [id, variant]));

  if (!uri || !c?.draft) return <Screen><Loading label="Abrindo vídeo final…" /></Screen>;
  // fala livre: a legenda do post é o que foi dito (transcrição), com a assinatura
  const free = c.meta?.model === FREE_SPEECH_MODEL && Boolean(result?.transcript);
  const signature = c.draft.caption.instagram.split("\n").pop() ?? "";
  const spoken = free ? `${result!.transcript}\n\n${signature}`.trim() : null;
  const draft = spoken ? { ...c.draft, caption: { instagram: spoken, tiktok: spoken, facebook: spoken, youtube_shorts: spoken } } : c.draft;
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
      <Eyebrow>{variant === "curto" ? "Versão curta — pronta para postar" : "Pronto para postar"}</Eyebrow>
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
      {describeResult(result) ? <Text style={s.muted}>{describeResult(result)}</Text> : null}
      {result?.warnings?.map((w) => <Text key={w} style={{ color: colors.warn, fontWeight: "700" }}>{`⚠ ${w}`}</Text>)}
      <Player uri={uri} />
      {cover ? (
        <Card style={{ gap: 8 }}>
          <Text style={s.label}>Capa do vídeo</Text>
          <Image source={{ uri: cover }} style={{ width: "50%", alignSelf: "center", aspectRatio: 9 / 16, borderRadius: 12 }} accessibilityLabel="Capa do vídeo" />
          <Button compact variant="secondary" label="COMPARTILHAR / SALVAR CAPA" onPress={() => void Sharing.shareAsync(cover, { mimeType: "image/jpeg", dialogTitle: "Capa do vídeo" }).catch((e: unknown) => setNotice(`Não consegui abrir a capa: ${e instanceof Error ? e.message : String(e)}`))} testID="share-cover" />
        </Card>
      ) : null}
      <Text style={s.label}>Legenda de cada rede (copiada sozinha ao postar)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PLATFORMS.map((p) => <Chip key={p} label={PLATFORM_LABEL[p]} selected={platform === p} onPress={() => { setPlatform(p); setCopied(false); }} />)}
      </View>
      <Card style={{ gap: 8 }}>
        <Text style={s.body} selectable>{caption}</Text>
      </Card>
      <Button variant="ghost" label={copied ? "LEGENDA COPIADA ✓" : "COPIAR ESTA LEGENDA"} onPress={async () => { await Clipboard.setStringAsync(caption); setCopied(true); }} />
      <MetricsCard content={c} onSaved={setC} />
    </Screen>
  );
}
