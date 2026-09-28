/**
 * Supabase Edge Function `generate` (Deno). Same contract/validation/memory as the NestJS API, with
 * Google Gemini as the model. GEMINI_API_KEY is an Edge Function secret — never shipped in the app.
 * Built by `npm run build:edge -w @postai/api` into supabase/functions/generate/index.ts.
 */
import { GenerateRequestSchema } from "@postai/domain";
import { createClient } from "@supabase/supabase-js";
import { geminiClient, supabaseMemory, userSupabase } from "./adapters";
import { generateContent, LlmUnavailableError } from "./generation.service";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL")!;
  // public (publishable/anon) key: from env on older projects, else the one the app sends in `apikey`
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const key = Deno.env.get("GEMINI_API_KEY");
  const token = /^Bearer (.+)$/.exec(req.headers.get("Authorization") ?? "")?.[1];
  if (!token) return json(401, { code: "unauthorized" });
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return json(401, { code: "unauthorized" });
  const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { code: "invalid_request" });
  if (!key) return json(503, { code: "llm_not_configured" });
  try {
    const llm = geminiClient(key, Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest");
    return json(200, await generateContent(parsed.data, llm, supabaseMemory(userSupabase(url, anon, token), data.user.id)));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 403 || status === 404) return json(404, { code: "workspace_not_found" });
    if (e instanceof LlmUnavailableError) return json(502, { code: "llm_unavailable" });
    console.error(JSON.stringify({ msg: "generate.failed", error: e instanceof Error ? e.message : String(e) }));
    return json(500, { code: "internal_error" });
  }
});
