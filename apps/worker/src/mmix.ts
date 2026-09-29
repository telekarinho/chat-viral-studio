import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bridge to the MMIX video factory ("Gravar patrimônio"). The MMIX admin token stays on this worker:
 * the app only reads mirrored orders and queues takes through RLS-protected tables.
 */
export interface MmixConfig {
  baseUrl: string; // e.g. https://mmix.com.br/api-fabrica.php
  /** MMIX_ADMIN_TOKEN (sent as Bearer) or the MMIX API key CP_KEY (sent in the POST body, never in the URL). */
  token: string;
  kind: "bearer" | "key";
  workspaceId: string; // the Post.ai workspace (business profile) linked to MMIX
  fetch?: typeof fetch;
}

const ACTIVE = new Set(["pendente", "em_gravacao", "reprovada"]);
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 120_000;

interface OrdemResumo { id: number; codigo: string; produto_id: number | null; produto_nome: string; titulo: string | null; objetivo: string | null; prioridade: string | null; status: string }

/** Every call is a POST (api-fabrica reads $_REQUEST), so a key never ends up in a URL or access log. */
async function call(cfg: MmixConfig, acao: string, fields: Record<string, string | Blob> = {}, filename?: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) form.set(k, v, filename);
    else form.set(k, v);
  }
  if (cfg.kind === "key") form.set("key", cfg.token);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.kind === "bearer") headers.Authorization = `Bearer ${cfg.token}`;
  try {
    const res = await (cfg.fetch ?? fetch)(`${cfg.baseUrl}?acao=${encodeURIComponent(acao)}`, { method: "POST", body: form, signal: ctrl.signal, headers });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`MMIX respondeu ${res.status} sem JSON`);
    }
    if (res.status === 401 || res.status === 403) throw new Error(`MMIX recusou a credencial (${res.status})`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Mirrors the open recording orders (with clip plan and per-clip status) into the linked workspace. */
export async function syncOrders(db: SupabaseClient, cfg: MmixConfig): Promise<number> {
  const list = await call(cfg, "gravacao_solicitacoes_listar", { limit: "100" });
  if (list.ok !== true) throw new Error(`listar ordens: ${String(list.erro ?? "falhou")}`);
  const open = ((list.solicitacoes ?? []) as OrdemResumo[]).filter((o) => ACTIVE.has(o.status));
  const rows = [];
  for (const o of open) {
    const d = await call(cfg, "gravacao_solicitacao_detalhe", { id: String(o.id) });
    if (d.ok !== true) continue;
    const detalhe = { ...d, tentativas_historico: undefined }; // history can be large and is not needed on the phone
    rows.push({
      workspace_id: cfg.workspaceId, id: o.id, codigo: o.codigo, produto_id: o.produto_id, produto_nome: o.produto_nome, titulo: o.titulo, objetivo: o.objetivo,
      prioridade: o.prioridade, status: o.status, detalhe, synced_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const up = await db.from("mmix_gravacao_ordens").upsert(rows, { onConflict: "workspace_id,id" });
    if (up.error) throw new Error(up.error.message);
  }
  // closed/approved orders leave the phone list; keep ones that still have sends in flight (FK)
  const keep = rows.map((r) => r.id);
  const stale = await db.from("mmix_gravacao_ordens").select("id").eq("workspace_id", cfg.workspaceId);
  for (const s of (stale.data ?? []) as { id: number }[]) {
    if (keep.includes(s.id)) continue;
    const pending = await db.from("patrimonio_envios").select("id").eq("workspace_id", cfg.workspaceId).eq("ordem_id", s.id).in("status", ["queued", "sending"]).limit(1);
    if (!pending.data?.length) await db.from("mmix_gravacao_ordens").update({ status: "concluida" }).eq("workspace_id", cfg.workspaceId).eq("id", s.id);
  }
  return rows.length;
}

interface EnvioRow { id: string; workspace_id: string; take_id: string; ordem_id: number; clipe_num: number; attempts: number; requested_by: string | null }

async function finish(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  await db.from("patrimonio_envios").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Sends one queued take to MMIX. Returns false when the queue is empty. */
export async function forwardOne(db: SupabaseClient, cfg: MmixConfig): Promise<boolean> {
  const { data, error } = await db.rpc("claim_patrimonio_envio");
  if (error) throw new Error(error.message);
  const job = (Array.isArray(data) ? data[0] : data) as EnvioRow | null;
  if (!job?.id) return false;
  try {
    if (job.workspace_id !== cfg.workspaceId) {
      await finish(db, job.id, { status: "failed", error: "perfil não vinculado à fábrica MMIX" });
      return true;
    }
    const take = await db.from("takes").select("workspace_id, media_files(storage_key, state)").eq("id", job.take_id).single();
    type T = { workspace_id: string; media_files: { storage_key: string | null; state: string } | null };
    const t = take.data as unknown as T | null;
    if (!t || t.workspace_id !== job.workspace_id) {
      await finish(db, job.id, { status: "failed", error: "take não encontrado" });
      return true;
    }
    if (!t.media_files?.storage_key || t.media_files.state !== "uploaded_original") {
      // not synced yet: back to the queue without spending an attempt
      await finish(db, job.id, { status: "queued", attempts: job.attempts - 1 });
      return true;
    }
    const dl = await db.storage.from("takes").download(t.media_files.storage_key);
    if (dl.error) throw new Error(`download: ${dl.error.message}`);
    const res = await call(cfg, "gravacao_solicitacao_upload", {
      id: String(job.ordem_id), clipe_num: String(job.clipe_num), autor: `postai:${job.requested_by ?? "app"}`,
      video: new Blob([await dl.data.arrayBuffer()], { type: "video/mp4" }),
    }, `postai-${job.take_id}.mp4`);
    if (res.ok === true) await finish(db, job.id, { status: "aprovado", resultado: res, error: null });
    else if (res.qa_status === "reprovado") await finish(db, job.id, { status: "reprovado", resultado: res, error: String(res.motivo ?? "reprovado no QA") });
    else throw new Error(String(res.erro ?? "falha no envio"));
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await finish(db, job.id, { status: job.attempts >= MAX_ATTEMPTS ? "failed" : "queued", error: msg });
  }
  return true;
}

export function mmixConfigFromEnv(env: NodeJS.ProcessEnv): MmixConfig | null {
  const token = env.MMIX_ADMIN_TOKEN || env.MMIX_API_KEY;
  if (!token || !env.POSTAI_MMIX_WORKSPACE_ID) return null;
  return { baseUrl: env.MMIX_API_URL || "https://mmix.com.br/api-fabrica.php", token, kind: env.MMIX_ADMIN_TOKEN ? "bearer" : "key", workspaceId: env.POSTAI_MMIX_WORKSPACE_ID };
}
