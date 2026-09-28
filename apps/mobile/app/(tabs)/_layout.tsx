import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useApp } from "../../src/app-state";
import { cloudEnabled } from "../../src/config";
import { colors, Loading, Screen } from "../../src/ui";

const TABS: { name: string; title: string; glyph: string }[] = [
  { name: "index", title: "Hoje", glyph: "●" },
  { name: "plano", title: "Plano", glyph: "▦" },
  { name: "gravar", title: "Gravar", glyph: "◉" },
  { name: "projetos", title: "Projetos", glyph: "▤" },
  { name: "resultados", title: "Resultados", glyph: "▲" },
];

export default function TabsLayout() {
  const { ready, session, workspace } = useApp();
  if (!ready) return <Screen><Loading /></Screen>;
  if (cloudEnabled && !session) return <Redirect href="/login" />;
  if (!workspace) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6, backgroundColor: "#FFFFFF", borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "800" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarButtonTestID: `tab-${t.title}`,
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 16 }}>{t.glyph}</Text>,
          }}
        />
      ))}
    </Tabs>
  );
}
