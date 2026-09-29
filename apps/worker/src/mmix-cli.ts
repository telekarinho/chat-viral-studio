import { createClient } from "@supabase/supabase-js";
import { countOpenOrders, forwardOne, mmixConfigFromEnv, syncOrders, syncProdutos } from "./mmix";

const MAX_SENDS_PER_RUN = 10;

/** One cron tick: mirror MMIX recording orders, then forward queued takes. */
async function main() {
  const cfg = mmixConfigFromEnv(process.env);
  if (!cfg) return void process.stdout.write("MMIX não configurado (MMIX_API_KEY) — nada a fazer.\n");
  if (!cfg.workspaceId) {
    process.stdout.write(`Credencial MMIX OK — ${await countOpenOrders(cfg)} pedido(s) de gravação abertos. Falta vincular o perfil (POSTAI_MMIX_WORKSPACE_ID).\n`);
    return;
  }
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const orders = await syncOrders(db, cfg);
  const produtos = await syncProdutos(db, cfg).catch((e) => { process.stdout.write(`catálogo: ${e instanceof Error ? e.message : e}
`); return -1; });
  let sent = 0;
  while (sent < MAX_SENDS_PER_RUN && (await forwardOne(db, cfg))) sent++;
  process.stdout.write(JSON.stringify({ level: "info", msg: "mmix.tick", orders, produtos, sent }) + "\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
