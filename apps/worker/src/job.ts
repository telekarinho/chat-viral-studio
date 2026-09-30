import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTION_STYLES, MOOD_LABEL, RETOUCH_LEVELS, SHORT_ROLES, assignBroll, buildAss, buildEditPlan, buildSegments, cuesFromWords, moodForPillar, parseDraft, pickTrack,
  planCuts, trackById, wholeTakeSegment, withClips,
  type CaptionStyle, type EditClip, type EditPlan, type MusicMood, type PlanMusic, type RenderVariant, type Retouch,
} from "@postai/domain";
import { fetchTrack, transcribeClip } from "./media-extras";
import { probe, render } from "./ffmpeg";

const run = promisify(execFile);

export interface RenderJobRow {
  id: string;
  workspace_id: string;
  content_item_id: string;
  attempts: number;
  /** enviado pelo aparelho; só `variant` é lido (e validado) — o plano em si é refeito no servidor */
  plan?: { variant?: unknown } | null;
}

/** O que a montagem fez e o que não conseguiu fazer — mostrado ao criador (nada falha em silêncio). */
export interface RenderResult {
  variant: RenderVariant;
  warnings: string[];
  transcript: string;
  cover_key: string | null;
  cuts: { removedMs: number; pauses: number; repeats: number; fillers: number };
  broll: number;
  music: string | null;
  spokenCaptions: boolean;
}

export const MAX_RENDER_ATTEMPTS = 3;
const MAX_BROLL = 3;

/** Parts not synced yet: retry later without consuming an attempt. */
export class NotReadyError extends Error {}

export interface ServerChoices {
  captionStyle: CaptionStyle; music: PlanMusic | null; accentColor?: string; retouch: Retouch; stabilize: boolean;
  autoCut: boolean; voiceClean: boolean; broll: boolean; hook: boolean;
}

/**
 * Escolhas do criador para a montagem (content_items.structured_payload.edit), validadas no servidor.
 * Tudo que não vier (ou vier inválido) cai no padrão automático.
 */
export function editChoices(payload: Record<string, unknown> | null | undefined, pillarSlug: string, business: boolean, seed: string): ServerChoices {
  const edit = (payload?.edit ?? {}) as Record<string, unknown>;
  const flag = (k: string) => (typeof edit[k] === "boolean" ? (edit[k] as boolean) : true);
  // pessoal: "forte" (tipo iPhone); empresa: "leve" (não alisa a textura do produto que aparece junto)
  const retouch: Retouch = RETOUCH_LEVELS.includes(edit.retouch as Retouch) ? (edit.retouch as Retouch) : business ? "leve" : "forte";
  const captionStyle = CAPTION_STYLES.includes(edit.captionStyle as CaptionStyle) ? (edit.captionStyle as CaptionStyle) : "manuscrito";
  const accentColor = typeof edit.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(edit.accentColor) ? edit.accentColor : undefined;
  const volume = typeof edit.musicVolume === "number" && edit.musicVolume >= 0.05 && edit.musicVolume <= 0.6 ? edit.musicVolume : 0.22;
  const base = { captionStyle, accentColor, retouch, stabilize: flag("stabilize"), autoCut: flag("autoCut"), voiceClean: flag("voiceClean"), broll: flag("broll"), hook: flag("hook") };
  const choice = typeof edit.music === "string" ? edit.music : "auto";
  if (choice === "none") return { ...base, music: null };
  const exact = trackById(choice);
  const mood: MusicMood = exact?.mood ?? (choice in MOOD_LABEL ? (choice as MusicMood) : moodForPillar(pillarSlug, business));
  const track = exact ?? pickTrack(mood, seed);
  return { ...base, music: { trackId: track.id, mood, volume } };
}

export const jobVariant = (job: Pick<RenderJobRow, "plan">): RenderVariant => (job.plan?.variant === "curto" ? "curto" : "completo");

type MediaRef = { storage_key: string | null; duration_ms: number | null; state: string } | null;
type TakeRow = { id: string; workspace_id: string; segment_index: number | null; tags: string[] | null; media_files: MediaRef };
const ready = (m: MediaRef): m is { storage_key: string; duration_ms: number | null; state: string } => Boolean(m?.storage_key) && m!.state === "uploaded_original";

export interface ServerPlan {
  plan: EditPlan;
  keys: string[];
  prompt: string;
  choices: ServerChoices;
  variant: RenderVariant;
  freeSpeech: boolean;
  /** cenas de apoio gravadas no mesmo dia, já sincronizadas */
  brolls: { takeId: string; key: string; durationMs: number }[];
  /** refaz o plano com a duração REAL medida nos arquivos (vídeo importado não traz duração do aparelho) */
  replan: (durationsMs: number[]) => EditPlan;
}

/**
 * Rebuilds the edit plan from server data (never trusts the plan sent by the device), downloads the
 * chosen originals, renders the final 9:16 and uploads it next to the takes.
 */
export async function buildServerPlan(db: SupabaseClient, job: RenderJobRow): Promise<ServerPlan> {
  const [content, script, profile, takes] = await Promise.all([
    db.from("content_items").select("id, workspace_id, pillar_slug, plan_date, structured_payload").eq("id", job.content_item_id).single(),
    db.from("scripts").select("draft, user_edited, model").eq("content_item_id", job.content_item_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
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
  const variant = jobVariant(job);
  const freeSpeech = script.data?.model === "fala-livre";
  const prompt = freeSpeech ? "" : parsed.draft.script.slice(0, 600);
  const hookText = choices.hook && !freeSpeech ? parsed.draft.screen_text.trim() || null : null;
  const signature = profile.data.signature ?? "";
  const planOpts = { signature, hookText, captionStyle: choices.captionStyle, accentColor: choices.accentColor, music: choices.music, retouch: choices.retouch, stabilize: choices.stabilize, voiceClean: choices.voiceClean };

  const brolls = choices.broll && variant === "completo" ? await findBrolls(db, job.workspace_id, content.data.plan_date as string | null) : [];
  const own = ((takes.data ?? []) as unknown as TakeRow[]).filter((t) => t.workspace_id === job.workspace_id && !(t.tags ?? []).includes("descartado"));
  const latest = new Map<number, TakeRow>();
  for (const t of own) {
    if (t.segment_index !== null && !latest.has(t.segment_index)) latest.set(t.segment_index, t);
  }
  // recorded in one go (no parts): enhance the latest whole take as a single clip
  if (latest.size === 0) {
    const whole = own.find((t) => t.segment_index === null);
    if (!whole) throw new Error("nenhum take gravado para este conteúdo");
    if (!ready(whole.media_files)) throw new NotReadyError("take ainda não sincronizado");
    if (variant === "curto") throw new Error("a versão curta precisa do vídeo gravado por partes");
    const replan = (d: number[]) => buildEditPlan({ ...planOpts, segments: [wholeTakeSegment(parsed.draft)], takes: [{ segmentIndex: 0, takeId: whole.id, durationMs: d[0] ?? 0 }] });
    return { plan: replan([whole.media_files.duration_ms ?? 0]), keys: [whole.media_files.storage_key], prompt, choices, variant, freeSpeech, brolls, replan };
  }
  const all = buildSegments(parsed.draft, {
    selectedHook: Number(content.data.structured_payload?.selected_hook ?? 0),
    userEdited: Boolean(script.data?.user_edited),
    closingPhrase: profile.data.closing_phrase ?? "",
  });
  const segments = variant === "curto" ? all.filter((s) => SHORT_ROLES.includes(s.role)) : all;
  if (segments.length < 2) throw new Error("a versão curta precisa de gancho e chamada gravados por partes");
  const chosen = segments.map((s) => latest.get(s.index));
  const notReady = segments.filter((_, i) => !ready(chosen[i]?.media_files ?? null)).map((s) => s.index + 1);
  if (notReady.length) throw new NotReadyError(`partes ainda não sincronizadas: ${notReady.join(", ")}`);
  const replan = (d: number[]) => buildEditPlan({ ...planOpts, segments, takes: segments.map((s, i) => ({ segmentIndex: s.index, takeId: chosen[i]!.id, durationMs: d[i] ?? 0 })) });
  return { plan: replan(chosen.map((t) => t!.media_files!.duration_ms ?? 0)), keys: chosen.map((t) => t!.media_files!.storage_key!), prompt, choices, variant, freeSpeech, brolls, replan };
}

/** Cenas de apoio (B-roll) do mesmo dia do conteúdo, mais recentes primeiro. */
async function findBrolls(db: SupabaseClient, workspaceId: string, planDate: string | null): Promise<ServerPlan["brolls"]> {
  if (!planDate) return [];
  // dia local de Brasília (UTC-3)
  const from = new Date(`${planDate}T00:00:00-03:00`).toISOString();
  const to = new Date(new Date(`${planDate}T00:00:00-03:00`).getTime() + 24 * 3600_000).toISOString();
  const { data, error } = await db.from("takes").select("id, workspace_id, tags, category, created_at, media_files(storage_key, duration_ms, state)")
    .eq("workspace_id", workspaceId).eq("category", "broll").gte("created_at", from).lt("created_at", to).order("created_at", { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as TakeRow[])
    .filter((t) => !(t.tags ?? []).includes("descartado") && ready(t.media_files))
    .slice(0, MAX_BROLL)
    .map((t) => ({ takeId: t.id, key: t.media_files!.storage_key!, durationMs: t.media_files!.duration_ms ?? 0 }));
}

interface Edited { plan: EditPlan; transcript: string; cuts: RenderResult["cuts"]; spoken: boolean }

/**
 * Escuta cada parte (Whisper): legenda segue a FALA REAL e, com corte automático ligado, saem pausas longas,
 * falsos começos e muletas. Sem transcrição, fica a legenda estimada pelo roteiro e nada é cortado.
 */
export async function editFromSpeech(sp: Pick<ServerPlan, "plan" | "choices" | "prompt">, inputs: string[], dir: string, transcribe = transcribeClip): Promise<Edited> {
  const { plan, choices } = sp;
  const cuts = { removedMs: 0, pauses: 0, repeats: 0, fillers: 0 };
  const said: string[] = [];
  let spoken = 0;
  const clips: EditClip[] = [];
  for (const [i, clip] of plan.clips.entries()) {
    const words = await transcribe(inputs[i]!, clip.trimStartMs, clip.durationMs, sp.prompt, dir);
    if (!words?.length) {
      clips.push(clip);
      continue;
    }
    spoken++;
    if (!choices.autoCut) {
      said.push(words.map((w) => w.text).join(" "));
      clips.push({ ...clip, captions: cuesFromWords(words, plan.captionStyle, clip.durationMs) });
      continue;
    }
    const c = planCuts(words, clip.durationMs);
    cuts.removedMs += c.removedMs;
    cuts.pauses += c.pauses;
    cuts.repeats += c.repeats;
    cuts.fillers += c.fillers;
    said.push(c.words.map((w) => w.text).join(" "));
    const durationMs = c.keep.reduce((a, k) => a + k.endMs - k.startMs, 0);
    clips.push({
      ...clip, durationMs,
      keep: c.keep.map((k) => ({ startMs: clip.trimStartMs + k.startMs, endMs: clip.trimStartMs + k.endMs })),
      captions: cuesFromWords(c.words, plan.captionStyle, durationMs),
    });
  }
  return { plan: withClips(plan, clips), transcript: said.join(" ").replace(/\s+/g, " ").trim(), cuts, spoken: spoken === plan.clips.length };
}

async function download(db: SupabaseClient, key: string, file: string): Promise<void> {
  const dl = await db.storage.from("takes").download(key);
  if (dl.error) throw new Error(`download ${key}: ${dl.error.message}`);
  writeFileSync(file, Buffer.from(await dl.data.arrayBuffer()));
}

export async function processJob(db: SupabaseClient, job: RenderJobRow, fontFile: string): Promise<{ outputKey: string; size: number; result: RenderResult }> {
  const dir = mkdtempSync(join(tmpdir(), `render-${job.id}-`));
  try {
    const sp = await buildServerPlan(db, job);
    const warnings: string[] = [];
    const inputs: string[] = [];
    for (const [i, key] of sp.keys.entries()) {
      const f = join(dir, `part${i}.mp4`);
      await download(db, key, f);
      inputs.push(f);
    }
    // duração real medida no arquivo (metadado do aparelho pode faltar ou errar)
    const durations = await Promise.all(inputs.map(async (f) => (await probe(f)).durationMs));
    if (durations.some((d) => d < 300)) throw new Error("um dos vídeos está vazio ou corrompido — grave essa parte de novo");
    const measured = { ...sp, plan: sp.replan(durations) };
    const edited = await editFromSpeech(measured, inputs, dir);
    if (!edited.spoken) warnings.push("Não consegui ouvir a fala de todas as partes: a legenda seguiu o roteiro e nada foi cortado nessas partes.");

    // cenas de apoio: só depois dos cortes (as durações mudam)
    let plan = edited.plan;
    const brollFiles: Record<string, string> = {};
    if (sp.brolls.length) {
      plan = withClips(plan, assignBroll(plan.clips, sp.brolls));
      for (const c of plan.clips) {
        const b = c.broll && sp.brolls.find((x) => x.takeId === c.broll!.takeId);
        if (!b) continue;
        try {
          const f = join(dir, `broll-${b.takeId}.mp4`);
          await download(db, b.key, f);
          brollFiles[b.takeId] = f;
        } catch {
          warnings.push("Uma cena de apoio não pôde ser baixada e ficou de fora.");
        }
      }
    }

    const assFile = join(dir, "legendas.ass");
    writeFileSync(assFile, buildAss(plan), "utf8");
    const track = plan.music ? trackById(plan.music.trackId) : undefined;
    const musicFile = track ? await fetchTrack(track, process.env.MUSIC_CACHE ?? join(tmpdir(), "postai-music")) : null;
    if (track && !musicFile) warnings.push("A música não pôde ser baixada agora: o vídeo saiu sem música. Toque em REFAZER para tentar de novo.");

    const output = join(dir, "final.mp4");
    const probed = await render({ plan: musicFile ? plan : { ...plan, music: null }, inputs, fontFile, output, assFile, fontsDir: process.env.FONTS_DIR ?? null, musicFile, brollFiles });
    if (probed.width !== plan.width || probed.height !== plan.height) throw new Error(`saída inesperada ${probed.width}x${probed.height}`);
    if (Math.abs(probed.durationMs - plan.totalMs) > 1500) warnings.push("A duração final ficou diferente do planejado — confira o vídeo antes de postar.");

    const base = `${job.workspace_id}/finals/${job.content_item_id}-${job.id}`;
    const bytes = readFileSync(output);
    const up = await db.storage.from("takes").upload(`${base}.mp4`, bytes, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload final: ${up.error.message}`);

    // capa: quadro do gancho (já com o texto na tela)
    let coverKey: string | null = null;
    try {
      const cover = join(dir, "capa.jpg");
      await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (Math.min(1200, plan.totalMs / 3) / 1000).toFixed(2), "-i", output, "-frames:v", "1", "-q:v", "3", cover]);
      const cu = await db.storage.from("takes").upload(`${base}.jpg`, readFileSync(cover), { contentType: "image/jpeg", upsert: true });
      if (cu.error) throw new Error(cu.error.message);
      coverKey = `${base}.jpg`;
    } catch {
      warnings.push("Não consegui gerar a capa.");
    }

    const result: RenderResult = {
      variant: sp.variant, warnings, transcript: edited.transcript, cover_key: coverKey, cuts: edited.cuts,
      broll: Object.keys(brollFiles).length, music: musicFile && track ? `${track.title} — ${track.artist}` : null, spokenCaptions: edited.spoken,
    };
    const row = { status: "done", output_key: `${base}.mp4`, output_size: bytes.length, error: null, updated_at: new Date().toISOString() };
    let done = await db.from("render_jobs").update({ ...row, result }).eq("id", job.id);
    // banco ainda sem a coluna `result` (migration pendente): o vídeo é entregue do mesmo jeito
    if (done.error && /result/.test(done.error.message)) {
      process.stdout.write(JSON.stringify({ level: "warn", msg: "render.result_column_missing", job: job.id }) + "
");
      done = await db.from("render_jobs").update(row).eq("id", job.id);
    }
    if (done.error) throw new Error(`gravar resultado: ${done.error.message}`);
    return { outputKey: `${base}.mp4`, size: bytes.length, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const notReady = e instanceof NotReadyError;
    const status = !notReady && job.attempts >= MAX_RENDER_ATTEMPTS ? "failed" : "queued";
    const upd = await db.from("render_jobs")
      .update({ status, attempts: notReady ? Math.max(0, job.attempts - 1) : job.attempts, error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (upd.error) process.stdout.write(JSON.stringify({ level: "error", msg: "render.status_not_saved", job: job.id, error: upd.error.message }) + "\n");
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
