import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTION_STYLES, MOOD_LABEL, RETOUCH_LEVELS, buildAss, buildEditPlan, buildSegments, cuesFromWords, moodForPillar, parseDraft, pickTrack, trackById, wholeTakeSegment,
  type CaptionStyle, type EditPlan, type MusicMood, type PlanMusic, type Retouch,
} from "@postai/domain";
import { fetchTrack, transcribeClip } from "./media-extras";
import { render } from "./ffmpeg";

export interface RenderJobRow {
  id: string;
  workspace_id: string;
  content_item_id: string;
  attempts: number;
}

export const MAX_RENDER_ATTEMPTS = 3;

/** Parts not synced yet: retry later without consuming an attempt. */
export class NotReadyError extends Error {}

/**
 * Rebuilds the edit plan from server data (never trusts the plan sent by the device), downloads the
 * chosen originals, renders the final 9:16 and uploads it next to the takes.
 */
/**
 * Escolhas do criador para a montagem (content_items.structured_payload.edit), validadas no servidor:
 * estilo da legenda e música (auto = clima do pilar, none = sem música, ou um clima/faixa da biblioteca).
 */
export function editChoices(payload: Record<string, unknown> | null | undefined, pillarSlug: string, business: boolean, seed: string): {
  captionStyle: CaptionStyle; music: PlanMusic | null; accentColor?: string; retouch: Retouch; stabilize: boolean;
} {
  const edit = (payload?.edit ?? {}) as { captionStyle?: unknown; music?: unknown; musicVolume?: unknown; accentColor?: unknown; retouch?: unknown; stabilize?: unknown };
  // pessoal: "forte" (tipo iPhone); empresa: "leve" (não alisa a textura do produto que aparece junto)
  const retouch: Retouch = RETOUCH_LEVELS.includes(edit.retouch as Retouch) ? (edit.retouch as Retouch) : business ? "leve" : "forte";
  const stabilize = typeof edit.stabilize === "boolean" ? edit.stabilize : true;
  const captionStyle = CAPTION_STYLES.includes(edit.captionStyle as CaptionStyle) ? (edit.captionStyle as CaptionStyle) : "manuscrito";
  const accentColor = typeof edit.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(edit.accentColor) ? edit.accentColor : undefined;
  const volume = typeof edit.musicVolume === "number" && edit.musicVolume >= 0.05 && edit.musicVolume <= 0.6 ? edit.musicVolume : 0.22;
  const choice = typeof edit.music === "string" ? edit.music : "auto";
  if (choice === "none") return { captionStyle, music: null, accentColor, retouch, stabilize };
  const exact = trackById(choice);
  const mood: MusicMood = exact?.mood ?? (choice in MOOD_LABEL ? (choice as MusicMood) : moodForPillar(pillarSlug, business));
  const track = exact ?? pickTrack(mood, seed);
  return { captionStyle, music: { trackId: track.id, mood, volume }, accentColor, retouch, stabilize };
}

export async function buildServerPlan(db: SupabaseClient, job: RenderJobRow): Promise<{ plan: EditPlan; keys: string[]; prompt: string }> {
  const [content, script, profile, takes] = await Promise.all([
    db.from("content_items").select("id, workspace_id, pillar_slug, structured_payload").eq("id", job.content_item_id).single(),
    db.from("scripts").select("draft, user_edited").eq("content_item_id", job.content_item_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("creator_profiles").select("signature, closing_phrase, tone").eq("workspace_id", job.workspace_id).single(),
    db.from("takes").select("id, workspace_id, segment_index, tags, created_at, media_files(storage_key, duration_ms, state)").eq("content_item_id", job.content_item_id).order("created_at", { ascending: false }),
  ]);
  const err = content.error ?? script.error ?? profile.error ?? takes.error;
  if (err) throw new Error(err.message);
  if (!content.data || !profile.data) throw new Error("conteúdo ou perfil não encontrado");
  if (content.data.workspace_id !== job.workspace_id) throw new Error("conteúdo de outro workspace");
  const parsed = parseDraft(script.data?.draft);
  if (!parsed.ok) throw new Error("roteiro inválido ou ausente");
  const business = (profile.data.tone as { kind?: string } | null)?.kind === "empresa";
  const choices = editChoices(content.data.structured_payload, content.data.pillar_slug ?? "", business, job.content_item_id);
  const prompt = parsed.draft.script.slice(0, 600);
  const segments = buildSegments(parsed.draft, {
    selectedHook: Number(content.data.structured_payload?.selected_hook ?? 0),
    userEdited: Boolean(script.data?.user_edited),
    closingPhrase: profile.data.closing_phrase ?? "",
  });
  type TakeRow = { id: string; workspace_id: string; segment_index: number | null; tags: string[] | null; media_files: { storage_key: string | null; duration_ms: number | null; state: string } | null };
  const own = ((takes.data ?? []) as unknown as TakeRow[]).filter((t) => t.workspace_id === job.workspace_id && !(t.tags ?? []).includes("descartado"));
  const latest = new Map<number, TakeRow>();
  for (const t of own) {
    if (t.segment_index !== null && !latest.has(t.segment_index)) latest.set(t.segment_index, t);
  }
  // recorded in one go (no parts): enhance the latest whole take as a single clip
  if (latest.size === 0) {
    const whole = own.find((t) => t.segment_index === null);
    if (!whole) throw new Error("nenhum take gravado para este conteúdo");
    if (!whole.media_files?.storage_key || whole.media_files.state !== "uploaded_original") throw new NotReadyError("take ainda não sincronizado");
    const plan = buildEditPlan({
      segments: [wholeTakeSegment(parsed.draft)],
      signature: profile.data!.signature ?? "",
      takes: [{ segmentIndex: 0, takeId: whole.id, durationMs: whole.media_files.duration_ms ?? 0 }],
      ...choices,
    });
    return { plan, keys: [whole.media_files.storage_key], prompt };
  }
  const chosen = segments.map((s) => latest.get(s.index));
  const notReady = segments.filter((s, i) => !chosen[i]?.media_files?.storage_key || chosen[i]!.media_files!.state !== "uploaded_original").map((s) => s.index + 1);
  if (notReady.length) throw new NotReadyError(`partes ainda não sincronizadas: ${notReady.join(", ")}`);
  const plan = buildEditPlan({
    segments,
    signature: profile.data!.signature ?? "",
    takes: segments.map((s, i) => ({ segmentIndex: s.index, takeId: chosen[i]!.id, durationMs: chosen[i]!.media_files!.duration_ms ?? 0 })),
    ...choices,
  });
  return { plan, keys: chosen.map((t) => t!.media_files!.storage_key!), prompt };
}

/** Troca a legenda estimada pelo roteiro pela legenda da FALA REAL (Whisper), parte por parte. */
async function withSpokenCaptions(plan: EditPlan, inputs: string[], prompt: string, dir: string): Promise<EditPlan> {
  if (plan.captionStyle === "nenhuma") return plan;
  const clips = [];
  for (const [i, clip] of plan.clips.entries()) {
    const words = await transcribeClip(inputs[i]!, clip.trimStartMs, clip.durationMs, prompt, dir);
    clips.push(words && words.length ? { ...clip, captions: cuesFromWords(words, plan.captionStyle, clip.durationMs) } : clip);
  }
  return { ...plan, clips };
}

export async function processJob(db: SupabaseClient, job: RenderJobRow, fontFile: string): Promise<{ outputKey: string; size: number }> {
  const dir = mkdtempSync(join(tmpdir(), `render-${job.id}-`));
  try {
    const { plan: basePlan, keys, prompt } = await buildServerPlan(db, job);
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
    const plan = await withSpokenCaptions(basePlan, inputs, prompt, dir);
    const assFile = join(dir, "legendas.ass");
    writeFileSync(assFile, buildAss(plan), "utf8");
    const track = plan.music ? trackById(plan.music.trackId) : undefined;
    const musicFile = track ? await fetchTrack(track, process.env.MUSIC_CACHE ?? join(tmpdir(), "postai-music")) : null;
    const probed = await render({ plan: musicFile ? plan : { ...plan, music: null }, inputs, fontFile, output, assFile, fontsDir: process.env.FONTS_DIR ?? null, musicFile });
    if (probed.width !== plan.width || probed.height !== plan.height) throw new Error(`saída inesperada ${probed.width}x${probed.height}`);
    const outputKey = `${job.workspace_id}/finals/${job.content_item_id}-${job.id}.mp4`;
    const bytes = readFileSync(output);
    const up = await db.storage.from("takes").upload(outputKey, bytes, { contentType: "video/mp4", upsert: false });
    if (up.error) throw new Error(`upload final: ${up.error.message}`);
    await db.from("render_jobs").update({ status: "done", output_key: outputKey, output_size: bytes.length, error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return { outputKey, size: bytes.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const notReady = e instanceof NotReadyError;
    const status = !notReady && job.attempts >= MAX_RENDER_ATTEMPTS ? "failed" : "queued";
    await db.from("render_jobs")
      .update({ status, attempts: notReady ? job.attempts - 1 : job.attempts, error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", job.id);
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
