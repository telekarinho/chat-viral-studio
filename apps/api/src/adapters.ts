import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RODRIGO_PROFILE, summarizeForMemory, type CreatorProfile, type Fingerprint, type FingerprintType } from "@postai/domain";
import type { LlmClient, MemoryStore } from "./generation.service";

export function openAiClient(apiKey: string, model: string): LlmClient {
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
  return {
    model,
    async complete({ system, user, schema }) {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name: "content_draft", strict: true, schema } },
      });
      const content = res.choices[0]?.message?.content;
      if (!content) throw new Error("empty completion");
      return JSON.parse(content);
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
        workspace_id: run.workspaceId, content_item_id: null, source: "openai", model: run.model, prompt_version: run.promptVersion,
        request: run.request, response: run.response, accepted: run.accepted, rejection_reason: run.rejectionReason,
        repetition: run.repetition ?? {}, latency_ms: run.latencyMs, created_by: userId,
      });
      if (error) console.warn(JSON.stringify({ level: "warn", msg: "generation_run not saved", code: error.code }));
    },
  };
}
