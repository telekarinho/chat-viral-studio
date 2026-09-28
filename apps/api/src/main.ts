import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import { openAiClient, supabaseMemory, userSupabase } from "./adapters";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = required("SUPABASE_URL");
  const anonKey = required("SUPABASE_ANON_KEY");
  const openAiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

  const app = await createApp({
    async verifyToken(token) {
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, accessToken: token };
    },
    memoryFor: (user) => supabaseMemory(userSupabase(supabaseUrl, anonKey, user.accessToken), user.id),
    llm: openAiKey ? openAiClient(openAiKey, model) : null,
    rateLimit: { max: Number(process.env.RATE_LIMIT_MAX ?? 30), windowMs: 10 * 60_000 },
  });
  const port = Number(process.env.PORT ?? 3333);
  await app.listen(port, "0.0.0.0");
  process.stdout.write(JSON.stringify({ level: "info", msg: "api.started", port, llm: openAiKey ? model : null }) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
