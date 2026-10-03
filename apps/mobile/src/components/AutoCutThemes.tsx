import { ScrollView, Text, View } from "react-native";
import { AUTOCUT_THEMES, activeAutoCutTheme, applyAutoCutTheme, autoCutTheme, type EditChoices } from "@postai/domain";
import { Chip, colors, s } from "../ui";

/**
 * AutoCut: um toque escolhe o estilo da montagem inteira (cortes, pausas, zoom, transição, ritmo na batida,
 * legenda, música, volume). O servidor monta pelo tema. Mudou algo depois? Vira "Personalizado" (o tema
 * escolhido continua guardado e o servidor segue o ritmo dele).
 */
export function AutoCutThemes({ value, onChange }: { value: EditChoices; onChange: (v: EditChoices) => void }) {
  const active = activeAutoCutTheme(value);
  const chosen = autoCutTheme(value.autocut);
  return (
    <View style={{ gap: 8 }} testID="autocut-themes">
      <Text style={s.label}>AutoCut — estilo da montagem</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {AUTOCUT_THEMES.map((theme) => (
          <Chip key={theme.id} label={theme.label} selected={active === theme.id} onPress={() => onChange(applyAutoCutTheme(value, theme.id))} testID={`autocut-theme-${theme.id}`} />
        ))}
      </ScrollView>
      <Text style={active ? s.muted : { color: colors.info, fontWeight: "700" }} testID="autocut-status">
        {active ? chosen!.description
          : chosen ? `Personalizado (base: ${chosen.label.replace(/^\S+\s/, "")}) — você mudou uma ou mais opções.`
            : "Escolha um estilo — ou deixe a montagem padrão."}
      </Text>
    </View>
  );
}
