import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "takes";
const PAGE = 100;

/** Apaga tudo dentro de uma pasta do storage (vídeos, finais, capas), inclusive subpastas. */
async function removeFolder(db: SupabaseClient, prefix: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: PAGE });
    if (error) throw new Error(`listar ${prefix}: ${error.message}`);
    if (!data?.length) return removed;
    // pasta vem sem id; arquivo vem com id
    for (const dir of data.filter((o) => !o.id)) removed += await removeFolder(db, `${prefix}/${dir.name}`);
    const files = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (!files.length) return removed;
    const rm = await db.storage.from(BUCKET).remove(files);
    if (rm.error) throw new Error(`apagar ${prefix}: ${rm.error.message}`);
    removed += files.length;
  }
}

/**
 * LGPD: atende UM pedido de exclusão de conta (privacy_requests). Apaga os arquivos e os dados dos
 * workspaces que só essa pessoa usa e, por fim, a conta (o resto sai em cascata). Workspace com
 * outros membros continua para eles; só a participação da pessoa some. Falhou no meio: o pedido
 * volta para a fila e é tentado de novo (apagar é idempotente).
 */
export async function processDeletionRequest(db: SupabaseClient): Promise<boolean> {
  const next = await db.from("privacy_requests").select("id, user_id").eq("kind", "delete_account").eq("status", "requested")
    .order("created_at").limit(1).maybeSingle();
  if (next.error) throw new Error(next.error.message);
  if (!next.data) return false;
  const req = next.data as { id: string; user_id: string };
  const claim = await db.from("privacy_requests").update({ status: "processing" }).eq("id", req.id).eq("status", "requested").select("id");
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data?.length) return true; // outro worker pegou

  try {
    const mine = await db.from("workspace_members").select("workspace_id").eq("user_id", req.user_id);
    if (mine.error) throw new Error(mine.error.message);
    let files = 0;
    let workspaces = 0;
    for (const { workspace_id: ws } of (mine.data ?? []) as { workspace_id: string }[]) {
      const others = await db.from("workspace_members").select("user_id").eq("workspace_id", ws).neq("user_id", req.user_id).limit(1);
      if (others.error) throw new Error(others.error.message);
      if (others.data?.length) continue;
      files += await removeFolder(db, ws);
      const del = await db.from("workspaces").delete().eq("id", ws);
      if (del.error) throw new Error(`apagar workspace: ${del.error.message}`);
      workspaces++;
    }
    await db.from("audit_logs").insert({ action: "privacy.delete_done", target: `${req.id} workspaces=${workspaces} arquivos=${files}` });
    // a conta por último: leva junto o pedido e as participações (on delete cascade)
    const gone = await db.auth.admin.deleteUser(req.user_id);
    if (gone.error) throw new Error(`apagar conta: ${gone.error.message}`);
    return true;
  } catch (e) {
    await db.from("privacy_requests").update({ status: "requested" }).eq("id", req.id);
    throw e;
  }
}
