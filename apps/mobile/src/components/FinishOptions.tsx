import { useState } from "react";
import { Text, View } from "react-native";
import { DEFAULT_EDIT_CHOICES, type CaptionStyle, type Direction, type EditChoices, type Retouch } from "@postai/domain";
import { Button, Chip, s } from "../ui";
import { AutoCutThemes } from "./AutoCutThemes";
import { MusicDrawer } from "./MusicDrawer";

const RETOUCH_LABEL: Record<Retouch, string> = { forte: "✨ Forte (tipo câmera do iPhone)", leve: "Natural", off: "Desligado" };

const AUTO: { key: "autoCut" | "voiceClean" | "broll" | "hook"; label: string }[] = [
  { key: "autoCut", label: "Cortar erros, pausas e repetições" },
  { key: "voiceClean", label: "Voz limpa (menos ruído)" },
  { key: "broll", label: "Usar cenas de apoio do dia" },
  { key: "hook", label: "Gancho escrito na tela" },
];

const CAPTION_LABEL: Record<CaptionStyle, string> = {
  manuscrito: "✍️ Manuscrito (creme, pincel)", destaque: "🔆 Destaque (palavra acende)", limpo: "Limpo", nenhuma: "Sem legenda",
};

/**
 * Opções da montagem, do mais usado ao menos: estilo do AutoCut, música (gaveta estilo TikTok) e, recolhidas,
 * legenda, embelezamento e os automáticos. Tudo fica salvo no vídeo (não se perde ao sair da tela).
 */
export function FinishOptions({ value, onChange, pillarSlug, business, workspaceId, voiceUri }: {
  value: EditChoices | null | undefined; onChange: (v: EditChoices) => void; pillarSlug: string; business: boolean;
  workspaceId?: string;
  contentId?: string;
  direction?: Direction | null;
  /** 1ª parte gravada: para ouvir a música com a voz */
  voiceUri?: string | null;
}) {
  const [more, setMore] = useState(false);
  const v = value ?? { ...DEFAULT_EDIT_CHOICES, retouch: business ? "leve" : "forte" };
  const retouch = v.retouch ?? (business ? "leve" : "forte");
  const set = (patch: Partial<EditChoices>) => onChange({ ...v, ...patch });

  return (
    <View style={{ gap: 12 }} testID="finish-options">
      <AutoCutThemes value={v} onChange={onChange} />
      <MusicDrawer value={v} onChange={onChange} workspaceId={workspaceId} business={business} voiceUri={voiceUri} pillarSlug={pillarSlug} />
      <Button compact variant="ghost" label={more ? "▲ Menos opções" : `▼ Mais opções (legenda: ${CAPTION_SHORT[v.captionStyle]}, pele: ${RETOUCH_SHORT[retouch]})`} onPress={() => setMore(!more)} testID="more-options" />
      {more ? (
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Legenda (sincronizada com a sua fala)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(CAPTION_LABEL) as CaptionStyle[]).map((k) => (
              <Chip key={k} label={CAPTION_LABEL[k]} selected={v.captionStyle === k} onPress={() => set({ captionStyle: k })} testID={`caption-${k}`} />
            ))}
          </View>
          <Text style={s.label}>Embelezamento do rosto (só na pele — olhos, barba e boca ficam naturais)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(RETOUCH_LABEL) as Retouch[]).map((k) => (
              <Chip key={k} label={RETOUCH_LABEL[k]} selected={retouch === k} onPress={() => set({ retouch: k })} testID={`retouch-${k}`} />
            ))}
            <Chip label={v.stabilize === false ? "Tirar tremido: não" : "✓ Tirar tremido (gravei andando)"} selected={v.stabilize !== false} onPress={() => set({ stabilize: v.stabilize === false })} testID="stabilize" />
          </View>
          <Text style={s.label}>Automáticos (tudo ligado — desligue o que não quiser)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AUTO.map((o) => (
              <Chip key={o.key} label={`${v[o.key] === false ? "○" : "✓"} ${o.label}`} selected={v[o.key] !== false} onPress={() => set({ [o.key]: v[o.key] === false })} testID={`auto-${o.key}`} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const CAPTION_SHORT: Record<CaptionStyle, string> = { manuscrito: "manuscrito", destaque: "destaque", limpo: "limpo", nenhuma: "sem" };
const RETOUCH_SHORT: Record<Retouch, string> = { forte: "forte", leve: "natural", off: "sem" };
