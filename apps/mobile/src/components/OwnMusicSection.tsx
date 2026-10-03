import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { ownMusicId, type OwnMusic } from "@postai/domain";
import { listOwnMusic, uploadOwnMusic } from "../ownMusic";
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
  const load = useCallback(() => void listOwnMusic(workspaceId).then(setList).catch(() => undefined), [workspaceId]);
  useEffect(load, [load]);

  const send = (origem: "minha" | "licenciada", comercial: boolean) => {
    setBusy(true);
    setMsg(null);
    uploadOwnMusic(workspaceId, { origem, comercial })
      .then((m) => {
        if (!m) return;
        setList((l) => [m, ...l]);
        onSelect(ownMusicId(m.id));
        setMsg(`“${m.titulo}” enviada e escolhida para este vídeo.`);
      })
      .catch((e: unknown) => { reportError(e, "own music"); setMsg(e instanceof Error ? e.message : String(e)); })
      .finally(() => setBusy(false));
  };

  // a licença é do criador: o app só registra a declaração (e empresa precisa de licença comercial)
  const ask = () => Alert.alert(
    "Essa música é sua ou você tem licença?",
    business
      ? "Perfil de empresa: só envie música sua ou com licença de uso COMERCIAL (ex.: Biblioteca de Áudio do YouTube, faixas compradas). Música de artista sem licença derruba o vídeo."
      : "Envie música sua ou com licença de uso (ex.: Biblioteca de Áudio do YouTube). Música de artista sem licença faz a rede tirar o som ou o vídeo.",
    [
      { text: "Cancelar", style: "cancel" },
      { text: "É minha", onPress: () => send("minha", true) },
      { text: business ? "Tenho licença comercial" : "Tenho licença", onPress: () => send("licenciada", true) },
    ],
  );

  const usable = list.filter((m) => !business || m.comercial);
  return (
    <View style={{ gap: 8 }} testID="own-music">
      <Text style={s.label}>Minhas músicas</Text>
      {usable.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {usable.map((m) => <Chip key={m.id} label={`🎤 ${m.titulo}`} selected={selected === ownMusicId(m.id)} onPress={() => onSelect(ownMusicId(m.id))} testID={`own-${m.id}`} />)}
        </View>
      ) : null}
      <Button compact variant="secondary" label="＋ ENVIAR MINHA MÚSICA" loading={busy} onPress={ask} testID="upload-own-music" />
      {msg ? <Text style={{ color: colors.info, fontWeight: "700" }}>{msg}</Text> : null}
    </View>
  );
}
