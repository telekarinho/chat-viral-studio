import { getDb } from "./db/database";

const key = (workspaceId?: string) => `music:favorites:${workspaceId ?? "local"}`;

export async function loadMusicFavorites(workspaceId?: string): Promise<string[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key(workspaceId));
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function toggleMusicFavorite(trackId: string, workspaceId?: string): Promise<string[]> {
  const current = await loadMusicFavorites(workspaceId);
  const next = current.includes(trackId) ? current.filter((id) => id !== trackId) : [trackId, ...current];
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)", key(workspaceId), JSON.stringify(next));
  return next;
}
