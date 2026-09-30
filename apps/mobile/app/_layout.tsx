import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-state";
import { notifyFinishedRenders } from "../src/renderWatch";
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

const RENDER_CHECK_MS = 60_000;

/** Avisa quando o vídeo fica pronto (app aberto em qualquer tela, ou ao voltar para ele); tocar no aviso abre o conteúdo. */
function RenderWatch() {
  const { workspace } = useApp();
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const id = tapped?.notification.request.content.data?.contentId;
    if (typeof id === "string") router.push(`/content/${id}`);
  }, [tapped]);
  useEffect(() => {
    if (!workspace?.cloud) return;
    const check = () => void notifyFinishedRenders(workspace.id).catch((e) => reportError(e, "render watch"));
    check();
    const t = setInterval(() => { if (AppState.currentState === "active") check(); }, RENDER_CHECK_MS);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") check(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [workspace?.id, workspace?.cloud]);
  return null;
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <SyncBoot />
        <RenderWatch />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F3EF" } }}>
          <Stack.Screen name="record" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);
