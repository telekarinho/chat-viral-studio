import { reportError } from "./telemetry";
import { PRODUCTION_MODES, SHOT_LIBRARY, checkRepetition, describeAvoidance, directionIssues, fingerprintsFor, generateLocal, isBusiness, mentionsPrice, parseDraft, pendingClaimsIn, projectBrief, parseManualResponse, type ContentDraft, type Fingerprint, type GenerationMeta } from "@postai/domain";
import { config, generateEndpoint } from "./config";
import { currentSession } from "./supabase";
import { getContent, recentFingerprints, saveDraft, workspaceById, type ContentItem } from "./db/repo";

const API_TIMEOUT_MS = 45_000;

interface ApiResponse { draft: ContentDraft; fingerprints: Fingerprint[]; meta: GenerationMeta; notices: string[] }

async function viaApi(content: ContentItem, eventText: string | null): Promise<ApiResponse | null> {
  if (!generateEndpoint) return null;
  const session = await currentSession();
  if (!session) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(generateEndpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey },
      body: JSON.stringify({ workspace_id: content.workspaceId, content_item_id: content.id, format: content.format, pillar_slug: content.pillarSlug, event_text: eventText, brief: content.project ? projectBrief(content.project) : null }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiResponse;
    const parsed = parseDraft(body.draft); // never trust the network blindly
    return parsed.ok ? { ...body, draft: parsed.draft } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates the script for a content item: server (OpenAI) when available, offline bank otherwise.
 * Both paths are validated by the same contract and repetition guard.
 */
export async function generateForContent(contentId: string, eventText: string | null = null): Promise<ContentItem> {
  const content = await getContent(contentId);
  if (!content) throw new Error("Conteúdo não encontrado");
  if (content.format !== "thought" && content.format !== "main_video") throw new Error("Formato sem roteiro");
  const ws = await workspaceById(content.workspaceId);
  const remote = await viaApi(content, eventText);
  if (remote) return saveDraft(contentId, withShotList(content, remote.draft), { ...remote.meta, notices: remote.notices }, remote.fingerprints);

  const pillar = ws.pillars.find((p) => p.slug === content.pillarSlug);
  const local = generateLocal({
    profile: ws.profile, pillarSlug: content.pillarSlug, pillarName: pillar?.name ?? content.pillarSlug, format: content.format, eventText,
    recent: (await recentFingerprints(ws.id)).filter((f) => f.contentItemId !== contentId),
  });
  const notices = [...local.notices];
  if (generateEndpoint) notices.unshift("IA indisponível agora (sem internet ou não configurada): usei o gerador offline.");
  return saveDraft(contentId, withShotList(content, local.draft), { ...local.meta, notices }, fingerprintsFor(local.draft));
}

/** Estúdio: o plano de tomadas do modo vira as sugestões de gravação (lista de tomadas da gravação). */
function withShotList(content: ContentItem, draft: ContentDraft): ContentDraft {
  if (!content.project) return draft;
  const shots = PRODUCTION_MODES[content.project.mode].shots.map((k) => SHOT_LIBRARY[k]);
  return { ...draft, recording_suggestions: shots.map((s) => ({ scene: s.label, duration_seconds: s.seconds[1], location_hint: s.hint })) };
}

/** Paste-back from the user's own ChatGPT/Claude app. */
export async function importManualDraft(contentId: string, pasted: string): Promise<{ ok: true; content: ContentItem } | { ok: false; errors: string[] }> {
  const content = await getContent(contentId);
  if (!content) return { ok: false, errors: ["Conteúdo não encontrado"] };
  const ws = await workspaceById(content.workspaceId);
  const r = parseManualResponse(pasted, ws.profile);
  if (!r.ok) return r;
  const draft = { ...r.draft, format: content.format };
  if (isBusiness(ws.profile) && ws.profile.business.noPrice && mentionsPrice(draft)) {
    return { ok: false, errors: ["O roteiro fala preço/valor. Neste perfil de empresa preço não aparece no vídeo — peça para o assistente reescrever sem preço."] };
  }
  const unproven = isBusiness(ws.profile) ? pendingClaimsIn(`${draft.script} ${draft.cta}`, ws.profile.business.pendingClaims ?? []) : [];
  if (unproven.length) return { ok: false, errors: [`O roteiro afirma algo ainda sem prova: ${unproven.join("; ")}. Peça para reescrever sem isso.`] };
  const direction = draft.direcao ? directionIssues(draft.direcao, { durationSeconds: draft.duration_seconds, spoken: true, business: isBusiness(ws.profile) }) : [];
  if (direction.length) return { ok: false, errors: direction };
  const fps = fingerprintsFor(draft);
  const report = checkRepetition(fps, (await recentFingerprints(ws.id)).filter((f) => f.contentItemId !== contentId));
  const notices = report.repeated ? describeAvoidance(report).map((n) => n.replace("Evitei repetir", "Atenção: parece repetir")) : [];
  const saved = await saveDraft(contentId, draft, { source: "local", model: "manual-assistant", prompt_version: r.promptVersion, attempts: 1, avoided: [], notices }, fps);
  return { ok: true, content: saved };
}

/** User edits are first-class feedback: saved as user_edited without changing memory fingerprints. */
export async function saveUserEdit(contentId: string, script: string): Promise<ContentItem> {
  const c = await getContent(contentId);
  if (!c?.draft || !c.meta) throw new Error("Sem roteiro para editar");
  const draft = { ...c.draft, script };
  return saveDraft(contentId, draft, c.meta, [], true);
}

const autoRunning = new Set<string>();

/**
 * "O app faz sozinho": fills every planned Thought/Main video of the day with a script, one at a time,
 * so opening Hoje already shows what to record. Safe to call repeatedly.
 */
export async function autoGenerateDay(contents: readonly ContentItem[], onEach?: () => void): Promise<number> {
  let done = 0;
  for (const c of contents) {
    if (c.draft || (c.format !== "thought" && c.format !== "main_video") || autoRunning.has(c.id)) continue;
    autoRunning.add(c.id);
    try {
      await generateForContent(c.id);
      done++;
      onEach?.();
    } catch (e) {
      // um roteiro que falhou não pode impedir os outros do dia
      reportError(e, "auto generate");
    } finally {
      autoRunning.delete(c.id);
    }
  }
  return done;
}
