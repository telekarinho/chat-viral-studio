import {
  PROMPT_VERSION, avoidanceInstructions, buildPrompt, checkRepetition, contentDraftJsonSchema, describeAvoidance, finalizeDraft, fingerprintsFor, parseDraft,
  type ContentDraft, type CreatorProfile, type Fingerprint, type GenerateRequest, type GenerationMeta, type RepetitionReport,
} from "@postai/domain";

export interface LlmClient {
  readonly model: string;
  readonly source?: "openai" | "gemini";
  complete(input: { system: string; user: string; schema: Record<string, unknown> }): Promise<unknown>;
}

/** Workspace-scoped memory. The Supabase implementation uses the caller's JWT, so RLS applies. */
export interface MemoryStore {
  canWrite(workspaceId: string): Promise<boolean>;
  profile(workspaceId: string): Promise<CreatorProfile>;
  pillarName(workspaceId: string, slug: string): Promise<string>;
  recentFingerprints(workspaceId: string): Promise<Fingerprint[]>;
  recentSummaries(workspaceId: string): Promise<string[]>;
  saveRun(run: {
    workspaceId: string; contentItemId: string | null; model: string; promptVersion: string; request: unknown; response: unknown;
    accepted: boolean; rejectionReason: string | null; repetition: RepetitionReport | null; latencyMs: number;
  }): Promise<void>;
}

export interface GenerateResponse {
  draft: ContentDraft;
  fingerprints: Fingerprint[];
  meta: GenerationMeta;
  notices: string[];
}

export class LlmUnavailableError extends Error {}

export const MAX_ATTEMPTS = 3;

export async function generateContent(req: GenerateRequest, llm: LlmClient, memory: MemoryStore): Promise<GenerateResponse> {
  if (!(await memory.canWrite(req.workspace_id))) throw Object.assign(new Error("forbidden"), { status: 403 });
  const [profile, pillarName, recent, summaries] = await Promise.all([
    memory.profile(req.workspace_id),
    memory.pillarName(req.workspace_id, req.pillar_slug),
    memory.recentFingerprints(req.workspace_id),
    memory.recentSummaries(req.workspace_id),
  ]);
  const schema = contentDraftJsonSchema();
  let avoid = "";
  const avoided: string[] = [];
  let fallback: { draft: ContentDraft; report: RepetitionReport } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildPrompt({ profile, pillarName, format: req.format, eventText: req.event_text, recentSummaries: summaries, avoid });
    const started = Date.now();
    let raw: unknown;
    try {
      raw = await llm.complete({ system: prompt.system, user: prompt.user, schema });
    } catch (e) {
      throw new LlmUnavailableError(e instanceof Error ? e.message : "llm error");
    }
    const base = { workspaceId: req.workspace_id, contentItemId: req.content_item_id, model: llm.model, promptVersion: prompt.promptVersion, request: { ...req, attempt }, response: raw, latencyMs: Date.now() - started };
    const parsed = parseDraft(raw);
    if (!parsed.ok) {
      await memory.saveRun({ ...base, accepted: false, rejectionReason: `schema: ${parsed.errors.slice(0, 5).join("; ")}`, repetition: null });
      continue;
    }
    const draft = finalizeDraft(parsed.draft, profile);
    const report = checkRepetition(fingerprintsFor(draft), recent);
    if (report.repeated) {
      await memory.saveRun({ ...base, accepted: false, rejectionReason: "repetition", repetition: report });
      avoided.push(...describeAvoidance(report));
      avoid = avoidanceInstructions(report);
      if (!fallback || report.hits.length < fallback.report.hits.length) fallback = { draft, report };
      continue;
    }
    await memory.saveRun({ ...base, accepted: true, rejectionReason: null, repetition: report });
    return respond(draft, llm, attempt, avoided, []);
  }
  if (fallback) {
    return respond(fallback.draft, llm, MAX_ATTEMPTS, avoided, ["Não consegui um ângulo 100% inédito; revise o texto antes de gravar."]);
  }
  throw new LlmUnavailableError("A IA não retornou um roteiro válido.");
}

function respond(draft: ContentDraft, llm: LlmClient, attempts: number, avoided: string[], extra: string[]): GenerateResponse {
  const model = llm.model;
  const unique = [...new Set(avoided)];
  return {
    draft,
    fingerprints: fingerprintsFor(draft),
    meta: { source: llm.source ?? "openai", model, prompt_version: PROMPT_VERSION, attempts, avoided: unique },
    notices: [...unique, ...extra],
  };
}
