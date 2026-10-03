import { Text, View } from "react-native";
import { DEFAULT_EDIT_CHOICES, MOOD_LABEL, moodForPillar, ownMusicUuid, type CaptionStyle, type Direction, type EditChoices, type MusicMood, type Retouch } from "@postai/domain";
import { chosenTrack, nextTrack } from "../musicChoice";
import { Chip, s } from "../ui";
import { AutoCutThemes } from "./AutoCutThemes";
import { OwnMusicSection } from "./OwnMusicSection";

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

/** Legenda, AutoCut e música da montagem final. "Automática" escolhe o clima pelo pilar do vídeo. */
export function FinishOptions({ value, onChange, pillarSlug, business, workspaceId, contentId, direction }: {
  value: EditChoices | null | undefined; onChange: (v: EditChoices) => void; pillarSlug: string; business: boolean;
  /** perfil na nuvem: mostra "Minhas músicas" (enviar e escolher) */
  workspaceId?: string;
  /** usado para mostrar/trocar a faixa exata que o renderizador escolherá */
  contentId?: string;
  direction?: Direction | null;
}) {
  const v = value ?? { ...DEFAULT_EDIT_CHOICES, retouch: business ? "leve" : "forte" };
  const retouch = v.retouch ?? (business ? "leve" : "forte");
  const auto = moodForPillar(pillarSlug, business);
  const set = (patch: Partial<EditChoices>) => onChange({ ...v, ...patch });
  const track = contentId ? chosenTrack(v, contentId, pillarSlug, business, direction) : null;
  const isOwnMusic = ownMusicUuid(v.music) !== null;

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

      <Text style={s.label}>Música de fundo (abaixa sozinha quando você fala)</Text>
      {track ? <Text style={s.muted}>{`Faixa atual: ${track.title} — ${track.artist}`}</Text> : null}
      {isOwnMusic ? <Text style={s.muted}>Faixa atual: música enviada por você.</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={`🎵 Automática: ${MOOD_LABEL[auto]}`} selected={v.music === "auto"} onPress={() => set({ music: "auto" })} testID="music-auto" />
        {(Object.keys(MOOD_LABEL) as MusicMood[]).filter((m) => m !== auto).map((m) => (
          <Chip key={m} label={MOOD_LABEL[m]} selected={v.music === m} onPress={() => set({ music: m })} testID={`music-${m}`} />
        ))}
        <Chip label="Sem música" selected={v.music === "none"} onPress={() => set({ music: "none" })} testID="music-none" />
        {track ? <Chip label="🔁 Trocar faixa" selected={false} onPress={() => set({ music: nextTrack(track).id })} testID="music-next-track" /> : null}
      </View>
      {workspaceId ? <OwnMusicSection workspaceId={workspaceId} business={business} selected={v.music} onSelect={(music) => set({ music })} /> : null}
      {v.music !== "none" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([["Baixinha", 0.12], ["Normal", 0.22], ["Mais alta", 0.35]] as const).map(([l, vol]) => (
            <Chip key={l} label={`Volume: ${l}`} selected={Math.abs((v.musicVolume ?? 0.22) - vol) < 0.01} onPress={() => set({ musicVolume: vol })} />
          ))}
        </View>
      ) : null}
      <Text style={s.muted}>As músicas da lista têm licença para vídeo nas redes (Mixkit). Quer um áudio em alta do TikTok/Instagram? Escolha “Sem música” e adicione o áudio no app da rede ao postar — lá ele é licenciado.</Text>
    </View>
  );
}
