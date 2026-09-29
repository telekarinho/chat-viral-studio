import { Directory, File, Paths } from "expo-file-system";
import type { EditPlan } from "@postai/domain";
import { getDb } from "./db/database";
import { latestTakesBySegment, listTakes } from "./db/repo";
import { newId } from "./config";
import { supabase } from "./supabase";

export interface RenderJob { id: string; status: "queued" | "rendering" | "done" | "failed"; output_key: string | null; error: string | null }

/** Montagem final: the server rebuilds the plan from synced data and renders with FFmpeg. */
export async function requestFinalRender(workspaceId: string, contentId: string, plan: EditPlan): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supabase) return { ok: false, reason: "A montagem final precisa da nuvem configurada (modo local grava as partes, mas não monta)." };
  const parts = [...(await latestTakesBySegment(contentId)).values()];
  const takes = parts.length ? parts : (await listTakes({ contentItemId: contentId })).filter((t) => !t.tags.includes("descartado")).slice(0, 1);
  const pending = takes.filter((t) => t.media.state !== "uploaded_original").length;
  if (pending) return { ok: false, reason: `Aguardando ${pending} vídeo(s) terminarem de sincronizar. Conecte na internet e tente de novo.` };
  const { error } = await supabase.from("render_jobs").insert({ id: newId(), workspace_id: workspaceId, content_item_id: contentId, plan });
  if (error) return { ok: false, reason: `Não consegui pedir a montagem: ${error.message}` };
  return { ok: true };
}

export async function latestRenderJob(contentId: string): Promise<RenderJob | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("render_jobs").select("id,status,output_key,error").eq("content_item_id", contentId).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as RenderJob | undefined) ?? null;
}

function finalsDir(): Directory {
  const d = new Directory(Paths.document, "finals");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export async function localFinal(contentId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", `final:${contentId}`);
  return row && new File(row.value).exists ? row.value : null;
}

export async function downloadFinal(contentId: string, job: RenderJob): Promise<string> {
  if (!supabase || !job.output_key) throw new Error("Vídeo final ainda não está pronto.");
  const { data, error } = await supabase.storage.from("takes").createSignedUrl(job.output_key, 600);
  if (error || !data) throw new Error(error?.message ?? "sem URL");
  const dest = new File(finalsDir(), `${contentId}.mp4`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(data.signedUrl, dest);
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", `final:${contentId}`, file.uri);
  return file.uri;
}
