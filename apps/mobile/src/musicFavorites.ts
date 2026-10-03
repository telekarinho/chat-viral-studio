import { getDb } from "./db/database";
import { supabase } from "./supabase";

/**
 * Músicas favoritas por perfil. Guarda no aparelho (funciona sem internet) e, com o perfil na nuvem, sincroniza
 * com a tabela musicas_favoritas: favoritou no Android → aparece no iPhone. Mudança feita offline fica na fila
 * e sobe quando a internet volta. Favoritas antigas (só do aparelho) sobem na primeira sincronização.
 */
const key = (workspaceId?: string) => `music:favorites:${workspaceId ?? "local"}`;
const pendingKey = (workspaceId: string) => `music:favorites:pending:${workspaceId}`;
const migratedKey = (workspaceId: string) => `music:favorites:migrated:${workspaceId}`;

type PendingOp = { trackId: string; op: "add" | "del" };

async function readJson<T>(k: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", k);
  if (!row?.value) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(k: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", k, JSON.stringify(value));
}

export async function loadMusicFavorites(workspaceId?: string): Promise<string[]> {
  const list = await readJson<unknown>(key(workspaceId), []);
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
}

export async function toggleMusicFavorite(trackId: string, workspaceId?: string): Promise<string[]> {
  const current = await loadMusicFavorites(workspaceId);
  const adding = !current.includes(trackId);
  const next = adding ? [trackId, ...current] : current.filter((id) => id !== trackId);
  await writeJson(key(workspaceId), next);
  if (workspaceId) {
    // a última mudança da faixa vale (favoritar e desfavoritar offline = nada a enviar)
    const pending = (await readJson<PendingOp[]>(pendingKey(workspaceId), [])).filter((p) => p.trackId !== trackId);
    await writeJson(pendingKey(workspaceId), [...pending, { trackId, op: adding ? "add" : "del" }]);
    void syncMusicFavorites(workspaceId).catch(() => undefined);
  }
  return next;
}

/** Quantas mudanças de favoritas ainda não subiram (para avisar "falta sincronizar"). */
export async function pendingFavoriteCount(workspaceId: string): Promise<number> {
  return (await readJson<PendingOp[]>(pendingKey(workspaceId), [])).length;
}

/**
 * Envia o que ficou na fila e traz a lista da nuvem. Sem nuvem/internet: devolve a lista do aparelho.
 * Resultado = favoritas da nuvem + as do aparelho que ainda estão na fila para subir.
 */
export async function syncMusicFavorites(workspaceId: string): Promise<string[]> {
  const local = await loadMusicFavorites(workspaceId);
  if (!supabase) return local;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return local;
  // primeira vez: as favoritas que só existiam no aparelho sobem
  if (!(await readJson<boolean>(migratedKey(workspaceId), false))) {
    const pending = await readJson<PendingOp[]>(pendingKey(workspaceId), []);
    const seeded = local.filter((id) => !pending.some((p) => p.trackId === id)).map((trackId): PendingOp => ({ trackId, op: "add" }));
    await writeJson(pendingKey(workspaceId), [...seeded, ...pending]);
    await writeJson(migratedKey(workspaceId), true);
  }
  let pending = await readJson<PendingOp[]>(pendingKey(workspaceId), []);
  for (const p of [...pending]) {
    const r = p.op === "add"
      ? await supabase.from("musicas_favoritas").upsert({ workspace_id: workspaceId, user_id: auth.user.id, track_id: p.trackId }, { onConflict: "workspace_id,user_id,track_id", ignoreDuplicates: true })
      : await supabase.from("musicas_favoritas").delete().eq("workspace_id", workspaceId).eq("user_id", auth.user.id).eq("track_id", p.trackId);
    if (r.error) break; // sem internet ou erro: o resto fica na fila
    pending = pending.filter((x) => x !== p);
  }
  await writeJson(pendingKey(workspaceId), pending);
  const { data, error } = await supabase.from("musicas_favoritas").select("track_id, created_at").eq("workspace_id", workspaceId).eq("user_id", auth.user.id).order("created_at", { ascending: false });
  if (error) return local;
  const server = (data ?? []).map((r) => r.track_id as string);
  const waiting = pending.filter((p) => p.op === "add").map((p) => p.trackId);
  const removing = new Set(pending.filter((p) => p.op === "del").map((p) => p.trackId));
  const merged = [...new Set([...waiting, ...server])].filter((id) => !removing.has(id));
  await writeJson(key(workspaceId), merged);
  return merged;
}
