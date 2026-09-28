import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  bg: "#F4F3EF",
  card: "#FFFFFF",
  ink: "#15171C",
  inkSoft: "#4B5160",
  muted: "#6B7080",
  line: "#E4E2DB",
  hero: "#15171C",
  heroText: "#F5F3EE",
  accent: "#E8B04A",
  good: "#1F8A5B",
  warn: "#A15C07",
  bad: "#B42318",
  info: "#1D4ED8",
};

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]} testID={testID}>
      {scroll ? <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[s.container, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1} accessibilityRole="header">{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

export function Section({ children }: { children: ReactNode }) {
  return <Text style={s.section} accessibilityRole="header">{children}</Text>;
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View style={[s.card, style]} testID={testID}>{children}</View>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";

export function Button({ label, onPress, variant = "primary", disabled, loading, testID, hint, compact }: {
  label: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean; testID?: string; hint?: string; compact?: boolean;
}) {
  const v = variants[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, compact && s.btnCompact, { backgroundColor: v.bg, borderColor: v.border }, (disabled || loading) && { opacity: 0.45 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[s.btnText, compact && { fontSize: 13 }, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.ink, fg: "#FFFFFF", border: colors.ink },
  light: { bg: "#FFFFFF", fg: colors.ink, border: "#FFFFFF" },
  secondary: { bg: "#FFFFFF", fg: colors.ink, border: colors.line },
  ghost: { bg: "transparent", fg: colors.ink, border: "transparent" },
  danger: { bg: "#FFFFFF", fg: colors.bad, border: "#F2C9C5" },
};

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} onPress={onPress}
      style={[s.chip, selected && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
      <Text style={[s.chipText, selected && { color: "#FFFFFF" }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <View style={s.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.ink} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: "flex-start", gap: 8 }}>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.muted}>{body}</Text> : null}
      {children}
    </Card>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: "#F2C9C5", borderWidth: 1, gap: 8 }}>
      <Text style={{ color: colors.bad, fontWeight: "700" }} accessibilityRole="alert">{message}</Text>
      {onRetry ? <Button label="Tentar de novo" variant="secondary" onPress={onRetry} compact /> : null}
    </Card>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 48, gap: 14 },
  h1: { fontSize: 34, fontWeight: "900", color: colors.ink, letterSpacing: -0.5 },
  eyebrow: { fontSize: 12, letterSpacing: 1.6, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  section: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, color: colors.muted, marginTop: 10, textTransform: "uppercase" },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, gap: 6 },
  btn: { minHeight: 52, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  btnCompact: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12 },
  btnText: { fontWeight: "900", fontSize: 15, letterSpacing: 0.3 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: "#FFFFFF", justifyContent: "center" },
  chipText: { fontWeight: "700", color: colors.ink, fontSize: 13 },
  center: { alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, fontSize: 16, color: colors.ink, minHeight: 52 },
  label: { fontSize: 13, fontWeight: "800", color: colors.inkSoft },
});
