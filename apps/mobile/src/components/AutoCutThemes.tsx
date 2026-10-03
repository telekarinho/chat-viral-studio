import { Text, View } from "react-native";
import type { EditChoices, MusicMood } from "@postai/domain";
import { Chip, s } from "../ui";

export type AutoCutThemeId =
  | "viral"
  | "longa"
  | "psicologica"
  | "engracada"
  | "suspense"
  | "dramatica"
  | "tiktok"
  | "calma"
  | "jovem";

interface AutoCutTheme {
  id: AutoCutThemeId;
  label: string;
  description: string;
  patch: Partial<EditChoices> & { music: MusicMood | "auto" };
}

/**
 * Presets do AutoCut definidos para o Post.ai. Eles só combinam controles que o renderizador já entende,
 * portanto continuam compatíveis com vídeos antigos e podem ser personalizados depois de aplicar o tema.
 */
export const AUTOCUT_THEMES: readonly AutoCutTheme[] = [
  {
    id: "viral",
    label: "🔥 Viral",
    description: "Cortes rápidos, gancho forte, destaque nas palavras e trilha com energia.",
    patch: { captionStyle: "destaque", music: "auto", musicVolume: 0.28, retouch: "forte", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "longa",
    label: "🎬 Longa",
    description: "Ritmo mais confortável para histórias maiores, com edição menos agressiva.",
    patch: { captionStyle: "limpo", music: "reflexao", musicVolume: 0.16, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "psicologica",
    label: "🧠 Psicológica",
    description: "Mais tensão e retenção, com texto em destaque e trilha de reflexão.",
    patch: { captionStyle: "destaque", music: "reflexao", musicVolume: 0.20, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "engracada",
    label: "😂 Engraçada",
    description: "Ritmo leve, cortes firmes e música de humor.",
    patch: { captionStyle: "destaque", music: "humor", musicVolume: 0.25, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "suspense",
    label: "👀 Suspense",
    description: "Segura a revelação e deixa a trilha mais baixa para a fala carregar a tensão.",
    patch: { captionStyle: "manuscrito", music: "reflexao", musicVolume: 0.14, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "dramatica",
    label: "🎭 Dramática",
    description: "História emocional, música presente e cortes sem tirar a respiração da fala.",
    patch: { captionStyle: "manuscrito", music: "familia", musicVolume: 0.18, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "tiktok",
    label: "⚡ Acelerada TikTok",
    description: "AutoCut forte, legenda acesa, B-roll e trilha energética.",
    patch: { captionStyle: "destaque", music: "treino", musicVolume: 0.30, retouch: "forte", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
  {
    id: "calma",
    label: "🌿 Calma",
    description: "Menos estímulo visual, fala limpa e música suave.",
    patch: { captionStyle: "limpo", music: "calmo", musicVolume: 0.12, retouch: "leve", stabilize: true, autoCut: true, voiceClean: true, broll: false, hook: true },
  },
  {
    id: "jovem",
    label: "✨ Jovem",
    description: "Visual limpo, ritmo vivo e trilha motivacional.",
    patch: { captionStyle: "destaque", music: "motivacional", musicVolume: 0.24, retouch: "forte", stabilize: true, autoCut: true, voiceClean: true, broll: true, hook: true },
  },
] as const;

const comparableKeys: (keyof EditChoices)[] = ["captionStyle", "music", "musicVolume", "retouch", "stabilize", "autoCut", "voiceClean", "broll", "hook"];

export function matchingAutoCutTheme(value: EditChoices): AutoCutThemeId | null {
  const found = AUTOCUT_THEMES.find((theme) => comparableKeys.every((key) => {
    const expected = theme.patch[key];
    return expected === undefined || value[key] === expected;
  }));
  return found?.id ?? null;
}

export function AutoCutThemes({ value, onChange }: { value: EditChoices; onChange: (v: EditChoices) => void }) {
  const selected = matchingAutoCutTheme(value);
  const apply = (theme: AutoCutTheme) => onChange({ ...value, ...theme.patch });

  return (
    <View style={{ gap: 8 }} testID="autocut-themes">
      <Text style={s.label}>AutoCut — escolha o estilo da montagem</Text>
      <Text style={s.muted}>Escolha um tema pronto e, se quiser, ajuste legenda, música, volume e efeitos logo abaixo.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {AUTOCUT_THEMES.map((theme) => (
          <Chip
            key={theme.id}
            label={theme.label}
            selected={selected === theme.id}
            onPress={() => apply(theme)}
            testID={`autocut-theme-${theme.id}`}
          />
        ))}
      </View>
      <Text style={s.muted}>{selected ? AUTOCUT_THEMES.find((t) => t.id === selected)?.description : "Personalizado: você alterou uma ou mais opções do tema."}</Text>
    </View>
  );
}
