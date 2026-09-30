import * as Notifications from "expo-notifications";
import { getDb } from "./db/database";
import { getContent } from "./db/repo";
import { localFinal } from "./finalRender";
import { supabase } from "./supabase";

// só avisa de montagens recentes (um aparelho novo não recebe aviso de vídeos antigos)
const RECENT_MS = 24 * 60 * 60 * 1000;

// conteúdo aberto na tela agora: ele mesmo acompanha e baixa, então não precisa de aviso
let onScreen: string | null = null;
export const setContentOnScreen = (id: string | null): void => { onScreen = id; };

type Row = { id: string; content_item_id: string; status: "done" | "failed"; error: string | null; plan: { variant?: string } | null };

/**
 * Avisa no celular quando uma montagem termina ou falha. Roda com o app aberto (em qualquer tela)
 * e ao voltar para ele — o servidor não manda push, então com o app fechado o aviso vem ao abrir.
 */
export async function notifyFinishedRenders(workspaceId: string): Promise<number> {
  if (!supabase) return 0;
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const { data, error } = await supabase.from("render_jobs").select("id, content_item_id, status, error, plan")
    .eq("workspace_id", workspaceId).in("status", ["done", "failed"]).gte("updated_at", since).order("updated_at", { ascending: false }).limit(20);
  if (error || !data?.length) return 0;
  const db = await getDb();
  let sent = 0;
  for (const r of data as Row[]) {
    if (r.content_item_id === onScreen) continue;
    const key = `avisado:${r.id}`;
    if (await db.getFirstAsync("SELECT 1 FROM kv WHERE key = ?", key)) continue;
    await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", key, new Date().toISOString());
    const curto = r.plan?.variant === "curto";
    // já baixado no aparelho = a pessoa já viu (estava na tela quando ficou pronto)
    if (r.status === "done" && (await localFinal(r.content_item_id, curto ? "curto" : "completo"))) continue;
    // não pede permissão do nada (pode estar gravando): usa a que a pessoa já deu nos lembretes
    if (!(await Notifications.getPermissionsAsync()).granted) continue;
    const title = (await getContent(r.content_item_id))?.title ?? "seu vídeo";
    await Notifications.scheduleNotificationAsync({
      content: r.status === "done"
        ? { title: curto ? "Versão curta pronta! 🎬" : "Seu vídeo está pronto! 🎬", body: `${title} — toque para ver e postar.`, data: { contentId: r.content_item_id } }
        : { title: "A montagem do vídeo falhou", body: `${title}: ${r.error ?? "erro no servidor"}. Toque para pedir de novo.`, data: { contentId: r.content_item_id } },
      trigger: null,
    });
    sent++;
  }
  return sent;
}
