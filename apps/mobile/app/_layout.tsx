import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { Stack, router, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../src/app-state";
import { notifyFinishedRenders } from "../src/renderWatch";
import { startSyncEngine } from "../src/sync/engine";
import { refreshProfilesFromCloud } from "../src/workspace-setup";
import { initTelemetry, reportError, wrapRoot } from "../src/telemetry";

initTelemetry();

function SyncBoot() {
  const { workspace } = useApp();
  useEffect(() => {
    if (workspace) startSyncEngine().catch((e) => reportError(e, "sync boot"));
  }, [workspace]);
  return null;
}

/** Perfis que o Claude criou/alterou pelo conector aparecem no app ao abrir ou voltar para ele. */
function ProfileRefresh() {
  const { workspace, reload } = useApp();
  useEffect(() => {
    if (!workspace?.cloud) return;
    const run = () => void refreshProfilesFromCloud().then((changed) => (changed ? reload() : undefined)).catch((e) => reportError(e, "profile refresh"));
    run();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") run(); });
    return () => sub.remove();
  }, [workspace?.cloud, reload]);
  return null;
}

const RENDER_CHECK_MS = 60_000;

/** Avisa quando o vídeo fica pronto (app aberto em qualquer tela, ou ao voltar para ele); tocar no aviso abre o conteúdo. */
function RenderWatch() {
  const { workspace } = useApp();
  const tapped = Notifications.useLastNotificationResponse();
  const navReady = Boolean(useRootNavigationState()?.key);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    // app aberto pelo aviso: espera a navegação montar e abre o conteúdo uma vez só
    const id = tapped?.notification.request.content.data?.contentId;
    const key = tapped?.notification.request.identifier ?? null;
    if (!navReady || typeof id !== "string" || !key || handled.current === key) return;
    handled.current = key;
    router.push(`/content/${id}`);
  }, [tapped, navReady]);
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
        <ProfileRefresh />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F3EF" } }}>
          <Stack.Screen name="record" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);
