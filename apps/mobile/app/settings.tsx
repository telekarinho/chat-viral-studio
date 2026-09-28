import { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useApp } from "../src/app-state";
import { config } from "../src/config";
import { wipeLocalDatabase } from "../src/db/database";
import { getWorkspace, listRecentContent, listTakes, listTasks, updateSettings, type Workspace } from "../src/db/repo";
import { deleteAllLocalTakes } from "../src/media";
import { supabase } from "../src/supabase";
import { getSyncStatus, syncNow } from "../src/sync/engine";
import { recentErrors } from "../src/telemetry";
import { Button, Card, ErrorBox, Eyebrow, H1, Screen, Section, colors, s } from "../src/ui";
import { toLocalDateKey } from "@postai/domain";

export default function Settings() {
  const { session, reload } = useApp();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => void getWorkspace().then(setWs), []);
  const sync = getSyncStatus();

  async function exportData() {
    const payload: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      workspace: await getWorkspace(),
      content: await listRecentContent(1000),
      today_tasks: await listTasks(toLocalDateKey(new Date())),
      takes: (await listTakes()).map((t) => ({ ...t, media: { ...t.media, localUri: undefined } })),
    };
    if (supabase && session) {
      const { data } = await supabase.rpc("export_my_data");
      payload.server = data;
    }
    const file = new File(Paths.cache, `postai-export-${Date.now()}.json`);
    file.write(JSON.stringify(payload, null, 2));
    try {
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } finally {
      if (file.exists) file.delete(); // don't leave a full copy of personal data in cache
    }
  }

  function confirmDelete() {
    Alert.alert("Apagar meus dados", "Isso apaga todos os roteiros e vídeos deste celular e pede a exclusão da conta na nuvem. Não dá para desfazer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar tudo",
        style: "destructive",
        onPress: async () => {
          try {
            if (supabase && session) {
              const { error } = await supabase.rpc("request_account_deletion");
              if (error) throw error;
              await supabase.auth.signOut();
            }
            deleteAllLocalTakes();
            await wipeLocalDatabase();
            await reload();
            router.replace("/");
          } catch (e) {
            setMsg(`Não foi possível concluir: ${e instanceof Error ? e.message : String(e)}`);
          }
        },
      },
    ]);
  }

  return (
    <Screen testID="settings-screen">
      <Button variant="ghost" compact label="← Voltar" onPress={() => router.back()} />
      <Eyebrow>Post.ai {config.version} ({config.buildSha})</Eyebrow>
      <H1>Configurações</H1>
      {msg ? <ErrorBox message={msg} /> : null}

      <Section>Conta</Section>
      <Card>
        <Text style={s.body}>{ws?.cloud ? `Conectado: ${session?.user.email ?? "—"}` : "Modo local (sem nuvem configurada)"}</Text>
        <Text style={s.muted}>Workspace: {ws?.name}</Text>
      </Card>

      <Section>Sincronização</Section>
      <Card style={{ gap: 8 }}>
        <Text style={s.body}>{sync.online ? "Online" : "Offline"} · {sync.pendingMedia} vídeo(s) e {sync.pendingRows} registro(s) na fila</Text>
        {sync.lastError ? <Text style={s.muted}>Último erro: {sync.lastError}</Text> : null}
        <Button compact variant="secondary" label="SINCRONIZAR AGORA" onPress={() => void syncNow()} />
      </Card>

      <Section>Lembretes</Section>
      <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={s.body}>Avisar na hora de cada missão</Text>
        <Switch value={ws?.settings.reminders ?? true} onValueChange={async (v) => setWs(await updateSettings({ reminders: v }))} accessibilityLabel="Lembretes" />
      </Card>

      <Section>Privacidade (LGPD)</Section>
      <Card style={{ gap: 8 }}>
        <Text style={s.muted}>Vídeos originais ficam no celular e só são apagados daqui depois de confirmados na nuvem — e só se você permitir. Não usamos seus vídeos para treinar IA.</Text>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={s.body}>Liberar espaço após 30 dias na nuvem</Text>
          <Switch value={ws?.settings.allowLocalCleanup ?? false} onValueChange={async (v) => setWs(await updateSettings({ allowLocalCleanup: v }))} accessibilityLabel="Limpeza automática" />
        </View>
        <Button compact variant="secondary" label="EXPORTAR MEUS DADOS" onPress={() => exportData().catch((e) => setMsg(String(e)))} />
        <Button compact variant="danger" label="APAGAR MEUS DADOS E CONTA" onPress={confirmDelete} />
      </Card>

      {session ? <Button variant="secondary" label="SAIR" onPress={async () => { await supabase?.auth.signOut(); await reload(); router.replace("/"); }} /> : null}

      <Section>Diagnóstico</Section>
      <Card>
        {recentErrors().length === 0 ? <Text style={s.muted}>Nenhum erro recente.</Text> : recentErrors().slice(0, 8).map((e) => <Text key={e.at} style={{ color: colors.muted, fontSize: 12 }}>{e.at.slice(11, 19)} {e.message}</Text>)}
      </Card>
    </Screen>
  );
}
