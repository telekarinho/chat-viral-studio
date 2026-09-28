import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-state";
import { startSyncEngine } from "../src/sync/engine";
import { initTelemetry, reportError, wrapRoot } from "../src/telemetry";

initTelemetry();

function SyncBoot() {
  const { workspace } = useApp();
  useEffect(() => {
    if (workspace) startSyncEngine().catch((e) => reportError(e, "sync boot"));
  }, [workspace]);
  return null;
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <SyncBoot />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F3EF" } }}>
          <Stack.Screen name="record" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);
