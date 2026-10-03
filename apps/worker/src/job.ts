import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAPTION_STYLES, MOOD_LABEL, applyAutoCutToPlan, chosenTakes, pickAutoTrack, autoCutParams, clipStartsMs, type AutoCutParams, type AutoCutThemeId, RETOUCH_LEVELS, SHORT_ROLES, assignBroll, buildAss, buildEditPlan, buildSegments, cuesFromWords, moodForPillar, parseDraft,
  planCuts, trackById, watermarkCorner, wholeTakeSegment, withClips,
  ownMusicId, ownMusicUuid, type CaptionStyle, type Direction, type OwnMusic, type EditClip, type EditPlan, type MusicMood, type PlanMusic, type RenderVariant, type Retouch,
} from "@postai/domain";
import { detectFaceBottom, downloadOwnMusic, fetchTrack, loudestWindowStartS, transcribeClip } from "./media-extras";
import { probe, render } from "./ffmpeg";
import { filterPath } from "./render";

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
  /** id da faixa que entrou (para a automática não repetir nos próximos vídeos) */
  music_id?: string | null;
  spokenCaptions: boolean;
}

export const MAX_RENDER_ATTEMPTS = 3;
const MAX_BROLL = 3;

/** Parts not synced yet: retry later without consuming an attempt. */
export class NotReadyError extends Error {}

export interface ServerChoices {
  captionStyle: CaptionStyle; music: PlanMusic | null; accentColor?: string; retouch: Retouch; stabilize: boolean;
  autoCut: boolean; voiceClean: boolean; broll: boolean; hook: boolean;
  /** ritmo da montagem (tema do AutoCut ou o padrão) */
  autocut: AutoCutParams;
  /** título da capa escolhido pelo criador ("" = sem título); ausente = o do diretor */
  capaTexto?: string;
}

/**
 * Escolhas do criador para a montagem (content_items.structured_payload.edit), validadas no servidor.
 * Tudo que não vier (ou vier inválido) cai no padrão automático.
 */
export function editChoices(payload: Record<string, unknown> | null | undefined, pillarSlug: string, business: boolean, seed: string, direction?: Direction | null, own?: OwnMusic | null, recents: readonly string[] = []): ServerChoices {
  const ch = editChoicesBase(payload, pillarSlug, business, seed, direction, own, recents);
  // trecho da música escolhido pelo criador (a narração já tem o ponto certo: o começo da gravação)
  const start = ((payload?.edit ?? {}) as { musicStartS?: unknown }).musicStartS;
  if (ch.music && !ch.music.narration && typeof start === "number" && start >= 0 && start < MAX_MUSIC_START_S) {
    return { ...ch, music: { ...ch.music, seekMs: Math.round(start * 1000) } };
  }
  return ch;
}
const MAX_MUSIC_START_S = 600;

function editChoicesBase(payload: Record<string, unknown> | null | undefined, pillarSlug: string, business: boolean, seed: string, direction: Direction | null | undefined, own: OwnMusic | null | undefined, recents: readonly string[]): ServerChoices {
  const edit = (payload?.edit ?? {}) as Record<string, unknown>;
  const flag = (k: string) => (typeof edit[k] === "boolean" ? (edit[k] as boolean) : true);
  // pessoal: "forte" (tipo iPhone); empresa: "leve" (não alisa a textura do produto que aparece junto)
  const retouch: Retouch = RETOUCH_LEVELS.includes(edit.retouch as Retouch) ? (edit.retouch as Retouch) : business ? "leve" : "forte";
  const captionStyle = CAPTION_STYLES.includes(edit.captionStyle as CaptionStyle) ? (edit.captionStyle as CaptionStyle) : "manuscrito";
  const accentColor = typeof edit.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(edit.accentColor) ? edit.accentColor : undefined;
  const dm = direction?.musica ?? null;
  const volume = typeof edit.musicVolume === "number" && edit.musicVolume >= 0.05 && edit.musicVolume <= 0.6 ? edit.musicVolume : (dm?.volume ?? 0.22);
  const narration = edit.narracao === true;
  // narração: sem corte de pausas (a fala fica no tempo da música que tocava no fone)
  const autocut = autoCutParams({ autocut: typeof edit.autocut === "string" ? (edit.autocut as AutoCutThemeId) : undefined });
  const capaTexto = typeof edit.capaTexto === "string" ? edit.capaTexto.trim().slice(0, 60) : undefined;
  const base = { ...(capaTexto !== undefined ? { capaTexto } : {}), captionStyle, accentColor, retouch, stabilize: flag("stabilize"), autoCut: narration ? false : flag("autoCut"), voiceClean: flag("voiceClean"), broll: flag("broll"), hook: flag("hook"), autocut };
  const choice = typeof edit.music === "string" ? edit.music : "auto";
  if (choice === "none") return { ...base, music: null };
  // música própria do criador (escolhida no app ou pela direção); empresa só com licença comercial declarada
  const ownWanted = choice === "auto" ? dm?.id : choice;
  if (own && ownWanted === ownMusicId(own.id) && !(business && !own.comercial)) {
    const win = choice === "auto" && dm ? { startMs: Math.round(dm.entrada * 1000), endMs: dm.saida === null ? null : Math.round(dm.saida * 1000) } : {};
    return { ...base, music: { trackId: ownMusicId(own.id), mood: moodForPillar(pillarSlug, business), volume, storageKey: own.storageKey, title: own.titulo, ...win, ...(narration ? { narration: true } : {}) } };
  }
  const narrated = narration ? trackById(choice) : undefined;
  if (narrated) return { ...base, music: { trackId: narrated.id, mood: narrated.mood, volume, narration: true } };
  // "auto" + direção com música da biblioteca: a faixa, o volume e a janela que o diretor pediu
  const directed = choice === "auto" && dm ? trackById(dm.id) : undefined;
  if (directed && !(business && directed.license !== "comercial")) {
    return { ...base, music: { trackId: directed.id, mood: directed.mood, volume, startMs: Math.round(dm!.entrada * 1000), endMs: dm!.saida === null ? null : Math.round(dm!.saida * 1000) } };
  }
  const exact = trackById(choice);
  const mood: MusicMood = exact?.mood ?? (choice in MOOD_LABEL ? (choice as MusicMood) : moodForPillar(pillarSlug, business));
  // automática: do clima pedido, sem repetir as últimas trilhas usadas no perfil
  const track = exact ?? pickAutoTrack(mood, seed, recents, business);
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
  /** direção do roteiro (capa etc.), quando veio do assistente */
  direction: Direction | null;
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
  const tone = profile.data.tone as { kind?: string; watermark?: unknown } | null;
  const business = tone?.kind === "empresa";
  const direction = parsed.draft.direcao ?? null;
  const ownTrack = await ownMusicFor(db, job.workspace_id, content.data.structured_payload, direction);
  const recents = await recentMusicIds(db, job.workspace_id, job.content_item_id);
  const choices = editChoices(content.data.structured_payload, content.data.pillar_slug ?? "", business, job.content_item_id, direction, ownTrack, recents);
  const variant = jobVariant(job);
  const freeSpeech = script.data?.model === "fala-livre";
  const prompt = freeSpeech ? "" : parsed.draft.script.slice(0, 600);
  const hookText = choices.hook && !freeSpeech ? parsed.draft.screen_text.trim() || null : null;
  const signature = profile.data.signature ?? "";
  const overlays = choices.hook && !freeSpeech && variant === "completo"
    ? (direction?.legendas_na_tela ?? []).map((l) => ({ text: l.texto, startMs: Math.round(l.inicio * 1000), endMs: Math.round(l.fim * 1000), position: l.posicao }))
    : [];
  const planOpts = { signature, watermark: watermarkCorner(tone?.watermark), hookText, overlays, captionStyle: choices.captionStyle, accentColor: choices.accentColor, music: choices.music, retouch: choices.retouch, stabilize: choices.stabilize, voiceClean: choices.voiceClean };

  const brolls = choices.broll && variant === "completo" ? await findBrolls(db, job.workspace_id, content.data.plan_date as string | null) : [];
  const own = ((takes.data ?? []) as unknown as TakeRow[]).filter((t) => t.workspace_id === job.workspace_id && !(t.tags ?? []).includes("descartado"));
  // take escolhido de cada parte (ou o mais recente) — mesma regra do app
  const latest = new Map([...chosenTakes(own.map((t) => ({ ...t, segmentIndex: t.segment_index }))).entries()].map(([k, v]) => [k, v as TakeRow]));
  // recorded in one go (no parts): enhance the latest whole take as a single clip
  if (latest.size === 0) {
    const whole = own.find((t) => t.segment_index === null);
    if (!whole) throw new Error("nenhum take gravado para este conteúdo");
    if (!ready(whole.media_files)) throw new NotReadyError("take ainda não sincronizado");
    if (variant === "curto") throw new Error("versão curta indisponível: este vídeo foi gravado num take só. O vídeo completo monta normalmente; para a curta, grave por partes.");
    const replan = (d: number[]) => buildEditPlan({ ...planOpts, segments: [wholeTakeSegment(parsed.draft)], takes: [{ segmentIndex: 0, takeId: whole.id, durationMs: d[0] ?? 0 }] });
    return { plan: replan([whole.media_files.duration_ms ?? 0]), keys: [whole.media_files.storage_key], prompt, choices, variant, freeSpeech, brolls, replan, direction };
  }
  const all = buildSegments(parsed.draft, {
    selectedHook: Number(content.data.structured_payload?.selected_hook ?? 0),
    userEdited: Boolean(script.data?.user_edited),
    closingPhrase: profile.data.closing_phrase ?? "",
  });
  const segments = variant === "curto" ? all.filter((s) => SHORT_ROLES.includes(s.role)) : all;
  // só a versão curta exige gancho + chamada; o vídeo completo pode ter uma parte só (ex.: direção com um take)
  if (variant === "curto" && segments.length < 2) throw new Error("versão curta indisponível: precisa de gancho e chamada gravados em partes separadas. O vídeo completo monta normalmente.");
  if (!segments.length) throw new Error("nenhuma parte do roteiro para montar");
  const chosen = segments.map((s) => latest.get(s.index));
  const notReady = segments.filter((_, i) => !ready(chosen[i]?.media_files ?? null)).map((s) => s.index + 1);
  if (notReady.length) throw new NotReadyError(`partes ainda não sincronizadas: ${notReady.join(", ")}`);
  const replan = (d: number[]) => buildEditPlan({ ...planOpts, segments, takes: segments.map((s, i) => ({ segmentIndex: s.index, takeId: chosen[i]!.id, durationMs: d[i] ?? 0 })) });
  return { plan: replan(chosen.map((t) => t!.media_files!.duration_ms ?? 0)), keys: chosen.map((t) => t!.media_files!.storage_key!), prompt, choices, variant, freeSpeech, brolls, replan, direction };
}

/** Cenas de apoio (B-roll) do mesmo dia do conteúdo, mais recentes primeiro. */
/** Faixas que entraram nos últimos vídeos do perfil (outros conteúdos), mais recente primeiro. */
async function recentMusicIds(db: SupabaseClient, workspaceId: string, contentId: string): Promise<string[]> {
  const { data } = await db.from("render_jobs").select("content_item_id, result").eq("workspace_id", workspaceId).eq("status", "done").order("created_at", { ascending: false }).limit(12);
  const ids = ((data ?? []) as { content_item_id: string; result: { music_id?: string | null } | null }[])
    .filter((r) => r.content_item_id !== contentId).map((r) => r.result?.music_id).filter((x): x is string => Boolean(x));
  return [...new Set(ids)];
}

/** A música própria pedida (escolha do app ou da direção), só se for DESTE perfil. */
async function ownMusicFor(db: SupabaseClient, workspaceId: string, payload: Record<string, unknown> | null, direction: Direction | null): Promise<OwnMusic | null> {
  const edit = (payload?.edit ?? {}) as { music?: unknown };
  const wanted = typeof edit.music === "string" && edit.music !== "auto" ? edit.music : direction?.musica?.id ?? "";
  const uuid = ownMusicUuid(wanted);
  if (!uuid) return null;
  const { data } = await db.from("musicas_proprias").select("id, titulo, comercial, storage_key").eq("workspace_id", workspaceId).eq("id", uuid).maybeSingle();
  return data ? { id: data.id as string, titulo: data.titulo as string, comercial: Boolean(data.comercial), storageKey: data.storage_key as string } : null;
}

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
    const c = planCuts(words, clip.durationMs, choices.autocut);
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

/**
 * Rosto da fonte → altura no vídeo final: o quadro é ampliado até cobrir 9:16 e cortado no centro; o zoom do efeito
 * (e o "punch" dos cortes) afasta o queixo do centro — usa o maior zoom do trecho para nunca subestimar.
 */
export function faceBottomOnOutput(fb: number, srcW: number, srcH: number, clip: Pick<EditClip, "effect" | "keep">, outW = 1080, outH = 1920): number {
  const s = Math.max(outW / srcW, outH / srcH);
  const cropY = (srcH * s - outH) / 2;
  const y = (fb * srcH * s - cropY) / outH;
  const zoom = Math.max(clip.effect.fromScale, clip.effect.toScale) + ((clip.keep?.length ?? 0) > 1 ? JUMP_PUNCH : 0);
  return Math.min(1, Math.max(0, 0.5 + (y - 0.5) * zoom));
}
const JUMP_PUNCH = 0.1;

async function withFaces(plan: EditPlan, inputs: readonly string[]): Promise<EditPlan> {
  const clips = await Promise.all(plan.clips.map(async (c, i) => {
    const from = c.keep?.[0]?.startMs ?? c.trimStartMs;
    const to = c.keep?.length ? c.keep[c.keep.length - 1]!.endMs : c.trimStartMs + c.durationMs;
    const f = inputs[i] ? await detectFaceBottom(inputs[i]!, from, to) : null;
    return {
      ...c,
      faceBottom: f ? faceBottomOnOutput(f.faceBottom, f.width, f.height, c, plan.width, plan.height) : null,
      // o mesmo enquadramento/zoom vale para o alto da cabeça (o zoom o afasta do centro para cima)
      faceTop: f ? faceBottomOnOutput(f.faceTop, f.width, f.height, c, plan.width, plan.height) : null,
    };
  }));
  return { ...plan, clips };
}

/** Fonte da capa com texto: a mesma letra manuscrita das legendas. */
const COVER_FONT = "CoveredByYourGrace.ttf";
const COVER_MAX_FONT = 140;
const COVER_LINE_CHARS = 14;

/** Momento do vídeo final → parte gravada e segundo dentro do arquivo original (respeitando cortes). */
export function coverSource(plan: Pick<EditPlan, "clips" | "transitions">, atMs: number): { clip: number; ms: number } {
  const starts = clipStartsMs(plan);
  let k = plan.clips.length - 1;
  for (let i = 0; i < plan.clips.length; i++) if (atMs < starts[i]! + plan.clips[i]!.durationMs) { k = i; break; }
  const clip = plan.clips[k]!;
  let local = Math.max(0, Math.min(clip.durationMs - 1, atMs - starts[k]!));
  for (const seg of clip.keep ?? []) {
    const len = seg.endMs - seg.startMs;
    if (local < len) return { clip: k, ms: seg.startMs + local };
    local -= len;
  }
  return { clip: k, ms: clip.trimStartMs + local };
}

/** Texto da capa em até 2 linhas, em maiúsculas, com a fonte do maior tamanho que cabe na largura. */
export function coverTextLayout(text: string): { text: string; fontSize: number } {
  const words = text.toLocaleUpperCase("pt-BR").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= COVER_LINE_CHARS) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  // no máximo 2 linhas: junta o resto na segunda
  const two = lines.length > 2 ? [lines[0]!, lines.slice(1).join(" ")] : lines;
  const longest = Math.max(...two.map((l) => l.length), 1);
  // letra manuscrita ocupa ~0,5 da altura por caractere; 86% da largura do vídeo
  return { text: two.join("\n"), fontSize: Math.max(48, Math.min(COVER_MAX_FONT, Math.floor((1080 * 0.86) / (0.5 * longest)))) };
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

    // legenda abaixo do queixo: acha o rosto em cada parte (no quadro final, já com enquadramento e zoom)
    let plan = await withFaces(edited.plan, inputs);
    // cenas de apoio: só depois dos cortes (as durações mudam)
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

    // ritmo do tema do AutoCut (zoom, jump cut, transições) — por último, depois de cortes e cenas de apoio
    plan = applyAutoCutToPlan(plan, sp.choices.autocut);
    const track = plan.music ? trackById(plan.music.trackId) : undefined;
    const ownKey = plan.music?.storageKey ?? null;
    const musicFile = ownKey ? await downloadOwnMusic(db, job.workspace_id, ownKey, dir) : track ? await fetchTrack(track, process.env.MUSIC_CACHE ?? join(tmpdir(), "postai-music")) : null;
    if ((track || ownKey) && !musicFile) warnings.push("A música não pôde ser baixada agora: o vídeo saiu sem música. Toque em REFAZER para tentar de novo.");
    // trecho automático: sem trecho escolhido, os temas com batida usam a parte mais forte da faixa (refrão)
    if (plan.music && musicFile && !plan.music.narration && plan.music.seekMs === undefined && sp.choices.autocut.beatSync) {
      const startS = await loudestWindowStartS(musicFile, plan.totalMs / 1000);
      if (startS > 0) plan = { ...plan, music: { ...plan.music, seekMs: Math.round(startS * 1000) } };
    }
    // pulsos na batida: só com BPM e fase medidos (biblioteca); a cada 2 batidas
    if (plan.music && musicFile && sp.choices.autocut.beatSync && track?.bpm && track.beatS !== null) {
      const t0S = (plan.music.startMs ?? 0) / 1000 - (plan.music.seekMs ?? 0) / 1000 + track.beatS;
      plan = { ...plan, beat: { periodS: (2 * 60) / track.bpm, t0S } };
    }
    const assFile = join(dir, "legendas.ass");
    writeFileSync(assFile, buildAss(plan), "utf8");

    const output = join(dir, "final.mp4");
    const probed = await render({ plan: musicFile ? plan : { ...plan, music: null }, inputs, fontFile, output, assFile, fontsDir: process.env.FONTS_DIR ?? null, musicFile, brollFiles, denoiseModel: process.env.RNNOISE_MODEL ?? null });
    if (probed.width !== plan.width || probed.height !== plan.height) throw new Error(`saída inesperada ${probed.width}x${probed.height}`);
    if (Math.abs(probed.durationMs - plan.totalMs) > 1500) warnings.push("A duração final ficou diferente do planejado — confira o vídeo antes de postar.");

    const base = `${job.workspace_id}/finals/${job.content_item_id}-${job.id}`;
    const bytes = readFileSync(output);
    const up = await db.storage.from("takes").upload(`${base}.mp4`, bytes, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload final: ${up.error.message}`);

    // capa: sem texto do diretor = quadro do vídeo pronto (já com o gancho); com texto = quadro LIMPO da gravação
    // original (sem legenda) + o texto uma vez só, do tamanho que cabe — nunca texto em cima de texto
    let coverKey: string | null = null;
    try {
      const cover = join(dir, "capa.jpg");
      const capa = sp.direction?.capa ?? null;
      const atMs = capa ? Math.min(Math.max(0, plan.totalMs - 100), capa.frame * 1000) : Math.min(1200, plan.totalMs / 3);
      const coverText = sp.choices.capaTexto ?? capa?.texto.trim() ?? "";
      if (coverText) {
        const src = coverSource(plan, atMs);
        const layout = coverTextLayout(coverText);
        const tf = join(dir, "capa.txt");
        writeFileSync(tf, layout.text, "utf8");
        const font = process.env.FONTS_DIR && existsSync(join(process.env.FONTS_DIR, COVER_FONT)) ? join(process.env.FONTS_DIR, COVER_FONT) : fontFile;
        const vf = `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase,crop=${plan.width}:${plan.height},eq=contrast=1.06:gamma=0.98,` +
          `drawtext=fontfile='${filterPath(font)}':textfile='${filterPath(tf)}':fontsize=${layout.fontSize}:line_spacing=${Math.round(layout.fontSize * 0.15)}:` +
          `fontcolor=0xF3E9D2:borderw=5:bordercolor=black@0.75:shadowx=0:shadowy=6:shadowcolor=black@0.5:x=(w-text_w)/2:y=h*0.10`;
        await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (src.ms / 1000).toFixed(2), "-i", inputs[src.clip]!, "-vf", vf, "-frames:v", "1", "-q:v", "3", cover]);
      } else {
        await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (atMs / 1000).toFixed(2), "-i", output, "-frames:v", "1", "-q:v", "3", cover]);
      }
      const cu = await db.storage.from("takes").upload(`${base}.jpg`, readFileSync(cover), { contentType: "image/jpeg", upsert: true });
      if (cu.error) throw new Error(cu.error.message);
      coverKey = `${base}.jpg`;
    } catch {
      warnings.push("Não consegui gerar a capa.");
    }

    const result: RenderResult = {
      variant: sp.variant, warnings, transcript: edited.transcript, cover_key: coverKey, cuts: edited.cuts,
      broll: Object.keys(brollFiles).length, music: musicFile ? (track ? `${track.title} — ${track.artist}` : plan.music?.title ? `${plan.music.title} (sua)` : null) : null,
      music_id: musicFile ? (plan.music?.trackId ?? null) : null, spokenCaptions: edited.spoken,
    };
    const row = { status: "done", output_key: `${base}.mp4`, output_size: bytes.length, error: null, updated_at: new Date().toISOString() };
    let done = await db.from("render_jobs").update({ ...row, result }).eq("id", job.id);
    // banco ainda sem a coluna `result` (migration pendente): o vídeo é entregue do mesmo jeito
    if (done.error && /result/.test(done.error.message)) {
      process.stdout.write(JSON.stringify({ level: "warn", msg: "render.result_column_missing", job: job.id }) + "\n");
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
