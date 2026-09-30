import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "takes";
const PAGE = 100;
/** pedido "processing" parado há mais que isso = o servidor caiu no meio: volta para a fila */
const STALE_MS = 30 * 60 * 1000;
/** depois de uma falha, espera antes de tentar de novo (não trava os outros pedidos) */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/** Apaga tudo dentro de uma pasta do storage (vídeos, finais, capas), inclusive subpastas. */
async function removeFolder(db: SupabaseClient, prefix: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: PAGE });
    if (error) throw new Error(`listar ${prefix}: ${error.message}`);
    if (!data?.length) return removed;
    // pasta vem sem id; arquivo vem com id
    const dirs = data.filter((o) => !o.id);
    for (const dir of dirs) removed += await removeFolder(db, `${prefix}/${dir.name}`);
    const files = data.filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
    if (files.length) {
      const rm = await db.storage.from(BUCKET).remove(files);
      if (rm.error) throw new Error(`apagar ${prefix}: ${rm.error.message}`);
      removed += files.length;
    }
    // página só com pastas já esvaziadas: a próxima listagem vem vazia (ou com o que faltava)
    if (!files.length && data.length < PAGE) return removed;
  }
}

async function audit(db: SupabaseClient, action: string, target: string): Promise<void> {
  const { error } = await db.from("audit_logs").insert({ action, target: target.slice(0, 200) });
  if (error) throw new Error(`audit_logs: ${error.message}`);
}

async function failedAttempts(db: SupabaseClient, reqId: string): Promise<number> {
  const { count, error } = await db.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "privacy.delete_failed").like("target", `${reqId}%`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * LGPD: atende UM pedido de exclusão de conta (privacy_requests). Apaga os arquivos e os dados dos
 * workspaces que só essa pessoa usa e, por fim, a conta (o resto sai em cascata). Workspace com
 * outros membros continua para eles; só a participação da pessoa some.
 * Falhou: registra, espera 10 min e tenta de novo (apagar é idempotente); na 3ª falha vira "rejected"
 * para revisão manual — nunca trava a fila. Parado em "processing" (servidor caiu) volta sozinho.
 */
export async function processDeletionRequest(db: SupabaseClient, now = Date.now()): Promise<boolean> {
  const stale = new Date(now - STALE_MS).toISOString();
  const retry = new Date(now - RETRY_AFTER_MS).toISOString();
  const next = await db.from("privacy_requests").select("id, user_id, status, processed_at").eq("kind", "delete_account")
    .or(`and(status.eq.requested,processed_at.is.null),and(status.eq.requested,processed_at.lt.${retry}),and(status.eq.processing,processed_at.lt.${stale})`)
    .order("processed_at", { ascending: true, nullsFirst: true }).order("created_at").limit(1).maybeSingle();
  if (next.error) throw new Error(next.error.message);
  if (!next.data) return false;
  const req = next.data as { id: string; user_id: string; status: string; processed_at: string | null };
  // pega o pedido só se ninguém mexeu nele desde a leitura
  let claim = db.from("privacy_requests").update({ status: "processing", processed_at: new Date(now).toISOString() }).eq("id", req.id).eq("status", req.status);
  claim = req.processed_at === null ? claim.is("processed_at", null) : claim.eq("processed_at", req.processed_at);
  const claimed = await claim.select("id");
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data?.length) return true; // outro worker pegou

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
      // um envio que chegou entre a limpeza e a exclusão do workspace não fica para trás
      files += await removeFolder(db, ws);
      workspaces++;
    }
    // a conta por último: leva junto o pedido e as participações (on delete cascade)
    const gone = await db.auth.admin.deleteUser(req.user_id);
    if (gone.error) throw new Error(`apagar conta: ${gone.error.message}`);
    await audit(db, "privacy.delete_done", `${req.id} workspaces=${workspaces} arquivos=${files}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(db, "privacy.delete_failed", `${req.id} ${msg}`);
    const giveUp = (await failedAttempts(db, req.id)) >= MAX_ATTEMPTS;
    await db.from("privacy_requests").update({ status: giveUp ? "rejected" : "requested", processed_at: new Date(now).toISOString() }).eq("id", req.id);
    throw new Error(giveUp ? `exclusão ${req.id} falhou ${MAX_ATTEMPTS} vezes — revisar à mão: ${msg}` : msg);
  }
}
