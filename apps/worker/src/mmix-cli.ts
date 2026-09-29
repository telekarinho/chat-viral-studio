import { createClient } from "@supabase/supabase-js";
import { forwardOne, mmixConfigFromEnv, syncOrders } from "./mmix";

const MAX_SENDS_PER_RUN = 10;

/** One cron tick: mirror MMIX recording orders, then forward queued takes. */
async function main() {
  const cfg = mmixConfigFromEnv(process.env);
  if (!cfg) return void process.stdout.write("MMIX não configurado (MMIX_API_KEY / POSTAI_MMIX_WORKSPACE_ID) — nada a fazer.\n");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const orders = await syncOrders(db, cfg);
  let sent = 0;
  while (sent < MAX_SENDS_PER_RUN && (await forwardOne(db, cfg))) sent++;
  process.stdout.write(JSON.stringify({ level: "info", msg: "mmix.tick", orders, sent }) + "\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
