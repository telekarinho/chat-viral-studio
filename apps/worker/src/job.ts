import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEditPlan, buildSegments, parseDraft, type EditPlan } from "@postai/domain";
import { render } from "./ffmpeg";

export interface RenderJobRow {
  id: string;
  workspace_id: string;
  content_item_id: string;
  attempts: number;
}

export const MAX_RENDER_ATTEMPTS = 3;

/**
 * Rebuilds the edit plan from server data (never trusts the plan sent by the device), downloads the
 * chosen originals, renders the final 9:16 and uploads it next to the takes.
 */
export async function buildServerPlan(db: SupabaseClient, job: RenderJobRow): Promise<{ plan: EditPlan; keys: string[] }> {
  const [content, script, profile, takes] = await Promise.all([
    db.from("content_items").select("id, workspace_id, structured_payload").eq("id", job.content_item_id).single(),
    db.from("scripts").select("draft, user_edited").eq("content_item_id", job.content_item_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("creator_profiles").select("signature, closing_phrase").eq("workspace_id", job.workspace_id).single(),
    db.from("takes").select("id, workspace_id, segment_index, created_at, media_files(storage_key, duration_ms, state)").eq("content_item_id", job.content_item_id).not("segment_index", "is", null).order("created_at", { ascending: false }),
  ]);
  const err = content.error ?? script.error ?? profile.error ?? takes.error;
  if (err) throw new Error(err.message);
  if (!content.data || !profile.data) throw new Error("conteúdo ou perfil não encontrado");
  if (content.data.workspace_id !== job.workspace_id) throw new Error("conteúdo de outro workspace");
  const parsed = parseDraft(script.data?.draft);
  if (!parsed.ok) throw new Error("roteiro inválido ou ausente");
  const segments = buildSegments(parsed.draft, {
    selectedHook: Number(content.data.structured_payload?.selected_hook ?? 0),
    userEdited: Boolean(script.data?.user_edited),
    closingPhrase: profile.data.closing_phrase ?? "",
  });
  type TakeRow = { id: string; workspace_id: string; segment_index: number; media_files: { storage_key: string | null; duration_ms: number | null; state: string } | null };
  const latest = new Map<number, TakeRow>();
  for (const t of (takes.data ?? []) as unknown as TakeRow[]) {
    if (t.workspace_id !== job.workspace_id) continue;
    if (!latest.has(t.segment_index)) latest.set(t.segment_index, t);
  }
  const chosen = segments.map((s) => latest.get(s.index));
  const notReady = segments.filter((s, i) => !chosen[i]?.media_files?.storage_key || chosen[i]!.media_files!.state !== "uploaded_original").map((s) => s.index + 1);
  if (notReady.length) throw new Error(`partes ainda não sincronizadas: ${notReady.join(", ")}`);
  const plan = buildEditPlan({
    segments,
    signature: profile.data!.signature ?? "",
    takes: segments.map((s, i) => ({ segmentIndex: s.index, takeId: chosen[i]!.id, durationMs: chosen[i]!.media_files!.duration_ms ?? 0 })),
  });
  return { plan, keys: chosen.map((t) => t!.media_files!.storage_key!) };
}

export async function processJob(db: SupabaseClient, job: RenderJobRow, fontFile: string): Promise<{ outputKey: string; size: number }> {
  const dir = mkdtempSync(join(tmpdir(), `render-${job.id}-`));
  try {
    const { plan, keys } = await buildServerPlan(db, job);
    const inputs: string[] = [];
    for (const [i, key] of keys.entries()) {
      const dl = await db.storage.from("takes").download(key);
      if (dl.error) throw new Error(`download ${key}: ${dl.error.message}`);
      const f = join(dir, `part${i}.mp4`);
      writeFileSync(f, Buffer.from(await dl.data.arrayBuffer()));
      inputs.push(f);
    }
    // real durations from the files (device metadata can be off by a few ms)
    const output = join(dir, "final.mp4");
    const probed = await render({ plan, inputs, fontFile, output });
    if (probed.width !== plan.width || probed.height !== plan.height) throw new Error(`saída inesperada ${probed.width}x${probed.height}`);
    const outputKey = `${job.workspace_id}/finals/${job.content_item_id}-${job.id}.mp4`;
    const bytes = readFileSync(output);
    const up = await db.storage.from("takes").upload(outputKey, bytes, { contentType: "video/mp4", upsert: false });
    if (up.error) throw new Error(`upload final: ${up.error.message}`);
    await db.from("render_jobs").update({ status: "done", output_key: outputKey, output_size: bytes.length, error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return { outputKey, size: bytes.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("render_jobs").update({ status: job.attempts >= MAX_RENDER_ATTEMPTS ? "failed" : "queued", error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.id);
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function runOnce(db: SupabaseClient, fontFile: string): Promise<boolean> {
  const { data, error } = await db.rpc("claim_render_job");
  if (error) throw new Error(error.message);
  const job = (Array.isArray(data) ? data[0] : data) as RenderJobRow | null;
  if (!job?.id) return false;
  await processJob(db, job, fontFile);
  return true;
}
