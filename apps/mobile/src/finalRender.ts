import { Directory, File, Paths } from "expo-file-system";
import type { EditPlan, RenderVariant } from "@postai/domain";
import { getDb } from "./db/database";
import { contentRowForServer, latestTakesBySegment, listTakes } from "./db/repo";
import { newId } from "./config";
import { supabase } from "./supabase";

/** O que a montagem fez e o que não conseguiu (vem do servidor; mostrado na tela, nada falha escondido). */
export interface RenderResult {
  variant?: RenderVariant;
  warnings?: string[];
  transcript?: string;
  cover_key?: string | null;
  cuts?: { removedMs: number; pauses: number; repeats: number; fillers: number };
  broll?: number;
  music?: string | null;
  spokenCaptions?: boolean;
}

export interface RenderJob {
  id: string; status: "queued" | "rendering" | "done" | "failed"; output_key: string | null; error: string | null; result: RenderResult | null;
  variant: RenderVariant;
}

const ACTIVE = ["queued", "rendering"];
const kvKey = (contentId: string, variant: RenderVariant, what: "final" | "capa" | "resultado") => `${what}:${contentId}${variant === "curto" ? ":curto" : ""}`;

/** Montagem final: the server rebuilds the plan from synced data and renders with FFmpeg. */
export async function requestFinalRender(workspaceId: string, contentId: string, plan: EditPlan, variant: RenderVariant = "completo"): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supabase) return { ok: false, reason: "A montagem final precisa da nuvem configurada (modo local grava as partes, mas não monta)." };
  const parts = [...(await latestTakesBySegment(contentId)).values()];
  const takes = parts.length ? parts : (await listTakes({ contentItemId: contentId })).filter((t) => !t.tags.includes("descartado")).slice(0, 1);
  const pending = takes.filter((t) => t.media.state !== "uploaded_original");
  const dead = pending.filter((t) => t.media.state === "dead_letter");
  if (dead.length) return { ok: false, reason: `${dead.length} vídeo(s) não conseguiram subir (${dead[0]!.media.lastError ?? "erro de envio"}). Abra Projetos e toque em tentar de novo.` };
  if (pending.length) return { ok: false, reason: `Aguardando ${pending.length} vídeo(s) terminarem de subir. Deixe o app aberto com internet.` };
  // já existe um pedido em andamento para esta versão? então não duplica
  const active = await supabase.from("render_jobs").select("id").eq("content_item_id", contentId).in("status", ACTIVE).limit(5);
  if (active.error) return { ok: false, reason: `Sem conexão com o servidor de montagem: ${active.error.message}` };
  const mine = await activeOfVariant(contentId, variant);
  if (mine) return { ok: true };
  // a legenda/música escolhidas precisam estar no servidor ANTES da montagem (a fila de sync é assíncrona)
  const row = await contentRowForServer(contentId);
  if (row) {
    const up = await supabase.from("content_items").update({ structured_payload: row.structured_payload, updated_at: row.updated_at }).eq("id", contentId);
    if (up.error) return { ok: false, reason: `Não consegui salvar as opções escolhidas: ${up.error.message}` };
  }
  const { error } = await supabase.from("render_jobs").insert({ id: newId(), workspace_id: workspaceId, content_item_id: contentId, plan: { variant, clips: plan.clips.length } });
  // 23505 = outro pedido igual entrou no mesmo instante (índice único): está tudo certo
  if (error && error.code !== "23505") return { ok: false, reason: `Não consegui pedir a montagem: ${error.message}` };
  // nova montagem pedida: o final antigo deixa de ser "o final" (o arquivo continua no aparelho até baixar o novo)
  const db = await getDb();
  await db.runAsync("DELETE FROM kv WHERE key IN (?, ?, ?)", kvKey(contentId, variant, "final"), kvKey(contentId, variant, "capa"), kvKey(contentId, variant, "resultado"));
  return { ok: true };
}

type JobRow = { id: string; status: RenderJob["status"]; output_key: string | null; error: string | null; result: RenderResult | null; plan: { variant?: string } | null };
const toJob = (r: JobRow): RenderJob => ({ id: r.id, status: r.status, output_key: r.output_key, error: r.error, result: r.result, variant: r.plan?.variant === "curto" ? "curto" : "completo" });

async function jobsOf(contentId: string): Promise<RenderJob[]> {
  const q = (cols: string) => supabase!.from("render_jobs").select(cols).eq("content_item_id", contentId).order("created_at", { ascending: false }).limit(10);
  let res = await q("id,status,output_key,error,result,plan");
  // 42703 = banco ainda sem a coluna `result` (migration pendente): segue sem o resumo da edição
  if (res.error?.code === "42703") res = await q("id,status,output_key,error,plan");
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as unknown as JobRow[]).map((r) => toJob({ ...r, result: r.result ?? null }));
}

async function activeOfVariant(contentId: string, variant: RenderVariant): Promise<RenderJob | null> {
  return (await jobsOf(contentId)).find((j) => j.variant === variant && ACTIVE.includes(j.status)) ?? null;
}

/**
 * Acorda o servidor de edição na hora (sem esperar o agendamento do GitHub, que atrasa horas).
 * Sem a função `kick-worker` publicada, não faz nada: o agendamento continua como reserva.
 */
export async function kickRenderWorker(): Promise<void> {
  if (!supabase) return;
  await supabase.functions.invoke("kick-worker", { body: {} }).catch(() => undefined);
}

/** Lança erro quando não dá para consultar (quem chama decide mostrar) — null = nunca foi pedida. */
export async function latestRenderJob(contentId: string, variant: RenderVariant = "completo"): Promise<RenderJob | null> {
  if (!supabase) return null;
  return (await jobsOf(contentId)).find((j) => j.variant === variant) ?? null;
}

function finalsDir(): Directory {
  const d = new Directory(Paths.document, "finals");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key))?.value ?? null;
}

export async function localFinal(contentId: string, variant: RenderVariant = "completo"): Promise<string | null> {
  const uri = await kvGet(kvKey(contentId, variant, "final"));
  return uri && new File(uri).exists ? uri : null;
}

export async function localCover(contentId: string, variant: RenderVariant = "completo"): Promise<string | null> {
  const uri = await kvGet(kvKey(contentId, variant, "capa"));
  return uri && new File(uri).exists ? uri : null;
}

export async function localResult(contentId: string, variant: RenderVariant = "completo"): Promise<RenderResult | null> {
  const raw = await kvGet(kvKey(contentId, variant, "resultado"));
  return raw ? (JSON.parse(raw) as RenderResult) : null;
}

async function fetchTo(key: string, dest: File): Promise<string> {
  const { data, error } = await supabase!.storage.from("takes").createSignedUrl(key, 600);
  if (error || !data) throw new Error(error?.message ?? "sem URL");
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(data.signedUrl, dest);
  if (!file.exists || (file.size ?? 0) <= 0) throw new Error("download vazio");
  return file.uri;
}

export async function downloadFinal(contentId: string, job: RenderJob): Promise<string> {
  if (!supabase || !job.output_key) throw new Error("Vídeo final ainda não está pronto.");
  const suffix = job.variant === "curto" ? "-curto" : "";
  const uri = await fetchTo(job.output_key, new File(finalsDir(), `${contentId}${suffix}.mp4`));
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", kvKey(contentId, job.variant, "final"), uri);
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", kvKey(contentId, job.variant, "resultado"), JSON.stringify(job.result ?? {}));
  if (job.result?.cover_key) {
    // a capa é um extra: se falhar, o vídeo continua disponível
    try {
      const cover = await fetchTo(job.result.cover_key, new File(finalsDir(), `${contentId}${suffix}.jpg`));
      await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", kvKey(contentId, job.variant, "capa"), cover);
    } catch {
      await db.runAsync("DELETE FROM kv WHERE key = ?", kvKey(contentId, job.variant, "capa"));
    }
  }
  return uri;
}

/** Resumo em uma linha do que a edição automática fez. */
export function describeResult(r: RenderResult | null | undefined): string | null {
  if (!r) return null;
  const bits: string[] = [];
  const c = r.cuts;
  if (c && c.removedMs >= 300) {
    const what = [c.pauses ? `${c.pauses} pausa(s)` : "", c.repeats ? `${c.repeats} repetição(ões)` : "", c.fillers ? `${c.fillers} muleta(s)` : ""].filter(Boolean).join(", ");
    bits.push(`cortei ${(c.removedMs / 1000).toFixed(1)}s${what ? ` (${what})` : " de silêncio"}`);
  }
  if (r.spokenCaptions) bits.push("legenda pela sua fala");
  if (r.broll) bits.push(`${r.broll} cena(s) de apoio`);
  if (r.music) bits.push(`música: ${r.music}`);
  return bits.length ? `Edição automática: ${bits.join(" · ")}.` : null;
}
