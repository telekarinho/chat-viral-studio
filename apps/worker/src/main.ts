import { createClient } from "@supabase/supabase-js";
import { runOnce } from "./job";

const IDLE_MS = 5_000;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

/** Render worker: needs ffmpeg on PATH. Service role stays on this server only. */
async function main() {
  const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const font = required("FONT_FILE");
  const once = process.argv.includes("--once");
  // jobs travados sem tentativas sobrando viram falha visível (o app mostra e deixa pedir de novo)
  const stale = await db.rpc("fail_stale_jobs");
  if (stale.error) process.stdout.write(JSON.stringify({ level: "error", msg: "stale.check_failed", error: stale.error.message }) + "\n");
  else if (stale.data) process.stdout.write(JSON.stringify({ level: "warn", msg: "stale.failed", jobs: stale.data }) + "\n");
  for (;;) {
    let worked = false;
    try {
      worked = await runOnce(db, font);
      if (worked) process.stdout.write(JSON.stringify({ level: "info", msg: "render.done", at: new Date().toISOString() }) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ level: "error", msg: "render.failed", error: e instanceof Error ? e.message : String(e) }) + "\n");
    }
    if (once) return;
    if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
