import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../src/app-state";
import { cloudEnabled } from "../../src/config";
import { colors, Loading, Screen } from "../../src/ui";

const TABS: { name: string; title: string; glyph: string; href?: null }[] = [
  { name: "index", title: "Hoje", glyph: "●" },
  { name: "projetos", title: "Biblioteca", glyph: "▤" },
  // central e destacado: a ação principal do app
  { name: "gravar", title: "Gravar", glyph: "+" },
  { name: "resultados", title: "Resultados", glyph: "▲" },
  // Plano continua disponível via Hoje/Configurações, mas sai da navegação diária.
  { name: "plano", title: "Plano", glyph: "▦", href: null },
];

export default function TabsLayout() {
  const { ready, session, workspace } = useApp();
  // botões do Android (|||, ○, <) ficam por cima do app em tela cheia: a barra de abas sobe o tanto deles
  const bottom = useSafeAreaInsets().bottom;
  if (!ready) return <Screen><Loading /></Screen>;
  if (cloudEnabled && !session) return <Redirect href="/login" />;
  if (!workspace) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { height: 64 + bottom, paddingBottom: 8 + bottom, paddingTop: 6, backgroundColor: "#FFFFFF", borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "800" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: t.href,
            tabBarAccessibilityLabel: t.title,
            tabBarButtonTestID: `tab-${t.title}`,
            tabBarIcon: ({ color }) => (
              <Text style={{
                color: t.name === "gravar" ? "#FFFFFF" : color,
                fontSize: t.name === "gravar" ? 28 : 16,
                fontWeight: "900",
                width: t.name === "gravar" ? 38 : undefined,
                height: t.name === "gravar" ? 38 : undefined,
                lineHeight: t.name === "gravar" ? 36 : undefined,
                textAlign: "center",
                borderRadius: t.name === "gravar" ? 19 : undefined,
                backgroundColor: t.name === "gravar" ? colors.ink : "transparent",
                marginTop: t.name === "gravar" ? -10 : 0,
              }}>{t.glyph}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
