import { Text, View } from "react-native";
import { validatePillarTargets, type Pillar } from "@postai/domain";
import { Button, Card, colors, s } from "../ui";

const STEP = 5;

export function PillarEditor({ pillars, onChange }: { pillars: Pillar[]; onChange: (p: Pillar[]) => void }) {
  const total = pillars.filter((p) => p.active !== false).reduce((a, p) => a + p.targetPercent, 0);
  const errors = validatePillarTargets(pillars);
  const set = (slug: string, delta: number) =>
    onChange(pillars.map((p) => (p.slug === slug ? { ...p, targetPercent: Math.max(0, Math.min(100, p.targetPercent + delta)) } : p)));
  return (
    <Card style={{ gap: 12 }} testID="pillar-editor">
      {pillars.map((p) => (
        <View key={p.slug} style={{ gap: 6 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ flex: 1, fontWeight: "700", color: colors.ink }}>{p.name}</Text>
            <Button compact variant="secondary" label="−" onPress={() => set(p.slug, -STEP)} hint={`Diminuir ${p.name}`} testID={`pillar-minus-${p.slug}`} />
            <Text style={{ width: 48, textAlign: "center", fontWeight: "900", color: colors.ink }} accessibilityLabel={`${p.name} ${p.targetPercent} por cento`}>{p.targetPercent}%</Text>
            <Button compact variant="secondary" label="+" onPress={() => set(p.slug, STEP)} hint={`Aumentar ${p.name}`} testID={`pillar-plus-${p.slug}`} />
          </View>
          <View style={{ height: 6, backgroundColor: colors.line, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${p.targetPercent}%`, backgroundColor: colors.ink, borderRadius: 3 }} />
          </View>
        </View>
      ))}
      <Text style={{ fontWeight: "800", color: errors.length ? colors.bad : colors.good }} accessibilityLiveRegion="polite">
        Total: {total}% {errors.length ? "— precisa somar 100%" : "✓"}
      </Text>
    </Card>
  );
}
