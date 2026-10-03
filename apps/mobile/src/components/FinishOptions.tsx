import { Text, View } from "react-native";
import { DEFAULT_EDIT_CHOICES, type CaptionStyle, type Direction, type EditChoices, type Retouch } from "@postai/domain";
import { Chip, s } from "../ui";
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

/** Opções finais do AutoCut. Música abre em uma gaveta estilo TikTok com mini player e favoritas. */
export function FinishOptions({ value, onChange, pillarSlug: _pillarSlug, business, workspaceId, contentId: _contentId, direction: _direction, voiceUri }: {
  value: EditChoices | null | undefined; onChange: (v: EditChoices) => void; pillarSlug: string; business: boolean;
  workspaceId?: string;
  contentId?: string;
  direction?: Direction | null;
  voiceUri?: string | null;
}) {
  const v = value ?? { ...DEFAULT_EDIT_CHOICES, retouch: business ? "leve" : "forte" };
  const retouch = v.retouch ?? (business ? "leve" : "forte");
  const set = (patch: Partial<EditChoices>) => onChange({ ...v, ...patch });

  return (
    <View style={{ gap: 12 }} testID="finish-options">
      <AutoCutThemes value={v} onChange={onChange} />

      <Text style={s.label}>Embelezamento do rosto (só na pele — olhos, barba e boca ficam naturais)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(RETOUCH_LABEL) as Retouch[]).map((k) => (
          <Chip key={k} label={RETOUCH_LABEL[k]} selected={retouch === k} onPress={() => set({ retouch: k })} testID={`retouch-${k}`} />
        ))}
        <Chip label={v.stabilize === false ? "Tirar tremido: não" : "✓ Tirar tremido (gravei andando)"} selected={v.stabilize !== false} onPress={() => set({ stabilize: v.stabilize === false })} testID="stabilize" />
      </View>

      <Text style={s.label}>Edição automática (tudo ligado — desligue o que não quiser)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {AUTO.map((o) => (
          <Chip key={o.key} label={`${v[o.key] === false ? "○" : "✓"} ${o.label}`} selected={v[o.key] !== false} onPress={() => set({ [o.key]: v[o.key] === false })} testID={`auto-${o.key}`} />
        ))}
      </View>

      <Text style={s.label}>Legenda (sincronizada com a sua fala)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(CAPTION_LABEL) as CaptionStyle[]).map((k) => (
          <Chip key={k} label={CAPTION_LABEL[k]} selected={v.captionStyle === k} onPress={() => set({ captionStyle: k })} testID={`caption-${k}`} />
        ))}
      </View>

      <Text style={s.label}>Música de fundo</Text>
      <MusicDrawer value={v} onChange={onChange} workspaceId={workspaceId} business={business} voiceUri={voiceUri} />
      {v.music !== "none" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([["Baixinha", 0.12], ["Normal", 0.22], ["Mais alta", 0.35]] as const).map(([l, vol]) => (
            <Chip key={l} label={`Volume: ${l}`} selected={Math.abs((v.musicVolume ?? 0.22) - vol) < 0.01} onPress={() => set({ musicVolume: vol })} />
          ))}
        </View>
      ) : null}
      <Text style={s.muted}>A música abaixa automaticamente quando você fala. Faixas internas usam a biblioteca licenciada do app; músicas próprias ficam salvas no perfil para reutilizar.</Text>
    </View>
  );
}
