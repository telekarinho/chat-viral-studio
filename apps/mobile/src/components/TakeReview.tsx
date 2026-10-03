import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { recommendTake, takeChecks } from "@postai/domain";
import { updateTakeMeta, type Take } from "../db/repo";
import { reportError } from "../telemetry";
import { Button, Chip, colors, s } from "../ui";

const tech = (t: Take) => ({ durationMs: t.media.durationMs, width: t.media.width, height: t.media.height });

/**
 * Revisão logo depois de gravar: primeiro o vídeo, depois o diagnóstico técnico (só o que o app mede — sem
 * "chance de viralizar") e as ações. Vários takes da mesma parte: Take 1 / Take 2… com a recomendação técnica.
 * Nenhum take é apagado: o que não for usado fica como reserva.
 */
export function TakeReview({ takes, text, title, useLabel, useTestID, retakeLabel, retakeTestID, onUse, onRetake, children }: {
  /** takes desta parte, mais novos primeiro (o primeiro é o que acabou de gravar) */
  takes: Take[]; text: string; title: string;
  useLabel: string; useTestID: string; retakeLabel: string; retakeTestID: string;
  onUse: (take: Take) => void; onRetake: () => void; children?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(takes[0]?.id);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const ordered = [...takes].reverse(); // Take 1 = o mais antigo
  const sel = takes.find((t) => t.id === selectedId) ?? takes[0];
  if (!sel) return null;
  const recommended = takes.length > 1 ? recommendTake(takes.map((t) => ({ ...tech(t), id: t.id })), text)?.id : undefined;
  const checks = takeChecks(tech(sel), text);
  const fav = favs[sel.id] ?? sel.favorite;
  const toggleFav = () => {
    setFavs((f) => ({ ...f, [sel.id]: !fav }));
    void updateTakeMeta(sel.id, { favorite: !fav }).catch((e) => reportError(e, "favoritar take"));
  };

  return (
    <View style={{ gap: 12 }}>
      <ReviewPlayer key={sel.media.localUri} uri={sel.media.localUri} />
      <Text style={{ fontSize: 20, fontWeight: "900", color: colors.good }} testID="saved-local">{title}</Text>
      {takes.length > 1 ? (
        <View style={[s.row, { flexWrap: "wrap", gap: 8 }]} testID="take-switcher">
          {ordered.map((t, i) => (
            <Chip key={t.id} label={`Take ${i + 1}${t.id === recommended ? " ★" : ""}`} selected={t.id === sel.id} onPress={() => setSelectedId(t.id)} testID={`take-option-${i + 1}`} />
          ))}
        </View>
      ) : null}
      {recommended ? <Text style={s.muted}>{"★ = recomendação técnica (menos alertas). A escolha é sua."}</Text> : null}
      <View style={{ gap: 4 }} testID="take-checks">
        {checks.map((c) => (
          <Text key={c.key} style={[s.body, { fontWeight: "700" }]} testID={`check-${c.key}`}>{`${c.ok ? "🟢" : "🟡"} ${c.label}`}</Text>
        ))}
        <Text style={s.muted}>Áudio e estabilidade: confira ouvindo e vendo o vídeo acima (o app ainda não mede).</Text>
      </View>
      <Button label={useLabel} onPress={() => onUse(sel)} testID={useTestID} />
      <View style={[s.row, { gap: 8 }]}>
        <View style={{ flex: 1 }}><Button variant="secondary" label={retakeLabel} onPress={onRetake} testID={retakeTestID} /></View>
        <Button variant="ghost" label={fav ? "★ FAVORITO" : "☆ FAVORITAR"} onPress={toggleFav} testID="favorite-take" />
      </View>
      {children}
    </View>
  );
}

/** Toca o take em loop, com som, para julgar na hora. */
function ReviewPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView player={player} style={{ width: "72%", alignSelf: "center", aspectRatio: 9 / 16, borderRadius: 18, backgroundColor: "#000" }}
      nativeControls contentFit="cover" testID="review-player" />
  );
}
