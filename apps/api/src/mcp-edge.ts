/**
 * Supabase Edge Function `mcp` (Deno): conector MCP do Post.ai para o Claude (e ChatGPT Business).
 * URL: https://<projeto>.supabase.co/functions/v1/mcp/<token> — o token é o link criado no app
 * (Configurações → Conectar meu Claude); o banco guarda só o hash. Publicar com "Verify JWT" DESLIGADO.
 * Built by `npm run build:mcp -w @postai/api` into supabase/functions/mcp/index.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { handleMcp } from "./mcp";
import { resolveMcpToken, supabaseMcpContext } from "./mcp-store";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const MAX_BODY = 256 * 1024;
const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "GET" || req.method === "DELETE") return new Response(null, { status: 405, headers: { Allow: "POST" } }); // sem stream/sessão
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const token = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const who = await resolveMcpToken(db, token).catch(() => null);
  if (!who) return json(404, { error: "link do conector inválido ou desligado — crie outro no app (Configurações)" });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const ctx = supabaseMcpContext(db, who.userId, who.workspaceId);
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => handleMcp(m, ctx)))).filter(Boolean);
    return out.length ? json(200, out) : new Response(null, { status: 202 });
  }
  const res = await handleMcp(msg, ctx);
  return res ? json(200, res) : new Response(null, { status: 202 });
});
