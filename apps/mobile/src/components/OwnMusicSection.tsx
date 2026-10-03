import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import { ownMusicId, type OwnMusic } from "@postai/domain";
import { listOwnMusic, ownMusicUrl, uploadOwnMusic, type OwnMusicOrigin } from "../ownMusic";
import { reportError } from "../telemetry";
import { Button, Chip, colors, s } from "../ui";

/**
 * Músicas próprias do perfil: escolher uma já enviada ou enviar outra (o criador declara a licença).
 * Empresa: só aparece/usa faixa com licença comercial declarada.
 */
export function OwnMusicSection({ workspaceId, business, selected, onSelect }: {
  workspaceId: string; business: boolean; selected: string; onSelect: (musicId: string) => void;
}) {
  const [list, setList] = useState<OwnMusic[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const preview = useRef<VideoPlayer | null>(null);
  const load = useCallback(() => void listOwnMusic(workspaceId).then(setList).catch(() => undefined), [workspaceId]);
  useEffect(load, [load]);
  useEffect(() => () => {
    try { preview.current?.pause(); preview.current?.release(); } catch { /* já liberado */ }
    preview.current = null;
  }, []);

  const send = (origem: OwnMusicOrigin, comercial: boolean) => {
    setBusy(true);
    setMsg(null);
    uploadOwnMusic(workspaceId, { origem, comercial })
      .then((m) => {
        if (!m) return;
        setList((l) => [m, ...l]);
        onSelect(ownMusicId(m.id));
        setMsg(`“${m.titulo}” enviada, salva em Minhas músicas e escolhida para este vídeo.`);
      })
      .catch((e: unknown) => { reportError(e, "own music"); setMsg(e instanceof Error ? e.message : String(e)); })
      .finally(() => setBusy(false));
  };

  const ask = () => Alert.alert(
    "De onde veio essa música?",
    business
      ? "Perfil de empresa: use somente música sua ou com licença de uso comercial. Para YouTube, use um arquivo obtido legalmente na Biblioteca de Áudio do YouTube; o app não extrai áudio de vídeos comuns."
      : "Use música sua, licenciada ou um arquivo obtido legalmente na Biblioteca de Áudio do YouTube. O app não extrai áudio de vídeos comuns.",
    [
      { text: "Cancelar", style: "cancel" },
      { text: "É minha", onPress: () => send("minha", true) },
      { text: business ? "Tenho licença comercial" : "Tenho licença", onPress: () => send("licenciada", true) },
      { text: "Biblioteca do YouTube", onPress: () => send("youtube_audio_library", true) },
    ],
  );

  const stopPreview = () => {
    try { preview.current?.pause(); preview.current?.release(); } catch { /* já liberado */ }
    preview.current = null;
    setPreviewing(null);
  };

  const playPreview = async (m: OwnMusic) => {
    if (previewing === m.id) return stopPreview();
    stopPreview();
    setMsg(null);
    try {
      const url = await ownMusicUrl(m.storageKey);
      if (!url) throw new Error("não consegui abrir a prévia");
      const p = createVideoPlayer(url);
      p.volume = 0.5;
      preview.current = p;
      setPreviewing(m.id);
      p.play();
    } catch (e) {
      setMsg(`Prévia indisponível: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openYouTubeLibrary = () => void Linking.openURL("https://www.youtube.com/audiolibrary");

  const usable = list.filter((m) => !business || m.comercial);
  return (
    <View style={{ gap: 8 }} testID="own-music">
      <Text style={s.label}>Minhas músicas</Text>
      <Text style={s.muted}>Envie uma vez e reutilize em outros vídeos do mesmo perfil.</Text>
      {usable.length ? (
        <View style={{ gap: 8 }}>
          {usable.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Chip label={`🎤 ${m.titulo}`} selected={selected === ownMusicId(m.id)} onPress={() => onSelect(ownMusicId(m.id))} testID={`own-${m.id}`} />
              <Button compact variant="secondary" label={previewing === m.id ? "■ PARAR" : "▶ OUVIR"} onPress={() => void playPreview(m)} testID={`preview-own-${m.id}`} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button compact variant="secondary" label="＋ ENVIAR MINHA MÚSICA" loading={busy} onPress={ask} testID="upload-own-music" />
        <Button compact variant="ghost" label="♫ ABRIR BIBLIOTECA DO YOUTUBE" onPress={openYouTubeLibrary} testID="youtube-audio-library" />
      </View>
      <Text style={s.muted}>Vídeo comum do YouTube pode ser usado como referência, mas o app não baixa, separa o áudio nem toca escondido em segundo plano. Para colocar a música no vídeo, use arquivo seu/licenciado ou a Biblioteca de Áudio do YouTube.</Text>
      {msg ? <Text style={{ color: colors.info, fontWeight: "700" }}>{msg}</Text> : null}
    </View>
  );
}
