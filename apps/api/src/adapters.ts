import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RODRIGO_PROFILE, summarizeForMemory, type CreatorProfile, type Fingerprint, type FingerprintType } from "@postai/domain";
import type { LlmClient, MemoryStore } from "./generation.service";

/**
 * Google Gemini (free tier available via Google AI Studio). Structured output through responseJsonSchema;
 * if the schema dialect is rejected, retries with JSON mode only — Zod validates the result either way.
 */
export function geminiClient(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): LlmClient {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  type GeminiJson = { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string; status?: string } };
  let keyInQuery = false; // some newer key formats are only accepted as ?key=
  async function send(body: Record<string, unknown>) {
    const target = keyInQuery ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!keyInQuery) headers["x-goog-api-key"] = apiKey;
    const res = await fetchImpl(target, { method: "POST", headers, body: JSON.stringify(body) });
    return { res, json: (await res.json().catch(() => ({}))) as GeminiJson };
  }
  async function call(body: Record<string, unknown>) {
    let r = await send(body);
    if ((r.res.status === 401 || r.res.status === 403) && !keyInQuery) {
      keyInQuery = true;
      r = await send(body);
    }
    return r;
  }
  return {
    model,
    source: "gemini",
    async complete({ system, user, schema }) {
      const base = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] };
      let r = await call({ ...base, generationConfig: { temperature: 0.9, responseMimeType: "application/json", responseJsonSchema: schema } });
      if (r.res.status === 400) r = await call({ ...base, generationConfig: { temperature: 0.9, responseMimeType: "application/json" } });
      if (!r.res.ok) throw new Error(`gemini HTTP ${r.res.status} ${r.json.error?.status ?? ""}: ${r.json.error?.message ?? ""}`.slice(0, 300));
      const text = r.json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("empty gemini response");
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    },
  };
}

export function userSupabase(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const MEMORY_WINDOW = 120; // fingerprints (≈ last 15–20 contents)

export function supabaseMemory(db: SupabaseClient, userId: string): MemoryStore {
  return {
    async canWrite(ws) {
      const { data, error } = await db.rpc("can_write_workspace", { ws });
      if (error) throw error;
      return data === true;
    },
    async profile(ws) {
      const { data, error } = await db.from("creator_profiles").select("*").eq("workspace_id", ws).maybeSingle();
      if (error) throw error;
      if (!data) throw Object.assign(new Error("workspace not found"), { status: 404 });
      return {
        displayName: data.display_name,
        handle: data.handle ?? data.display_name,
        positioning: data.positioning ?? "",
        signature: data.signature ?? data.handle ?? "",
        closingPhrase: data.closing_phrase ?? "",
        voiceRules: data.voice_rules?.length ? data.voice_rules : RODRIGO_PROFILE.voiceRules,
        // kind + sales strategy of a business profile live in creator_profiles.tone
        kind: data.tone?.kind === "empresa" ? "empresa" : "pessoal",
        business: data.tone?.kind === "empresa" ? data.tone.business : undefined,
        ...(data.tone?.extras ? { extras: data.tone.extras } : {}),
      } satisfies CreatorProfile;
    },
    async pillarName(ws, slug) {
      const { data } = await db.from("content_pillars").select("name").eq("workspace_id", ws).eq("slug", slug).maybeSingle();
      return data?.name ?? slug;
    },
    async recentFingerprints(ws) {
      const { data, error } = await db
        .from("content_fingerprints")
        .select("fingerprint_type, fingerprint, content_item_id, created_at")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false })
        .limit(MEMORY_WINDOW);
      if (error) throw error;
      return (data ?? []).map((r): Fingerprint => ({ type: r.fingerprint_type as FingerprintType, value: r.fingerprint, contentItemId: r.content_item_id, createdAt: r.created_at }));
    },
    async recentSummaries(ws) {
      const { data } = await db.from("scripts").select("draft").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10);
      return (data ?? []).filter((r) => r.draft?.topic).map((r) => summarizeForMemory(r.draft));
    },
    async saveRun(run) {
      const { error } = await db.from("generation_runs").insert({
        workspace_id: run.workspaceId, content_item_id: null, source: run.model.startsWith("gemini") ? "gemini" : "openai", model: run.model, prompt_version: run.promptVersion,
        request: run.request, response: run.response, accepted: run.accepted, rejection_reason: run.rejectionReason,
        repetition: run.repetition ?? {}, latency_ms: run.latencyMs, created_by: userId,
      });
      if (error) console.warn(JSON.stringify({ level: "warn", msg: "generation_run not saved", code: error.code }));
    },
  };
}
