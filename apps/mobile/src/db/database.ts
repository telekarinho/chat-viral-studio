import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, date TEXT NOT NULL, format TEXT NOT NULL, pillar_slug TEXT NOT NULL,
  title TEXT NOT NULL, status TEXT NOT NULL, scheduled_for TEXT NOT NULL, draft TEXT, meta TEXT, selected_hook INTEGER, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_items_date ON content_items(date);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, date TEXT NOT NULL, content_item_id TEXT, scheduled_for TEXT NOT NULL,
  title TEXT NOT NULL, kind TEXT NOT NULL, hint TEXT, duration INTEGER, optional INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
  notes TEXT, take_id TEXT, superseded_by TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_date ON tasks(date);
CREATE TABLE IF NOT EXISTS task_events (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, local_uri TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum TEXT NOT NULL,
  state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT, remote_verified_at TEXT,
  storage_key TEXT, width INTEGER, height INTEGER, duration_ms INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS takes (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, task_id TEXT, content_item_id TEXT, media_id TEXT NOT NULL REFERENCES media(id),
  category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', camera TEXT, favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fingerprints (
  id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, content_item_id TEXT, type TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fingerprints_created ON fingerprints(created_at);
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, row_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
`;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("postai.db");
      await db.execAsync(SCHEMA);
      // v2: gravação por partes
      const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(takes)");
      if (!cols.some((c) => c.name === "segment_index")) await db.execAsync("ALTER TABLE takes ADD COLUMN segment_index INTEGER");
      // v3: estúdio da fábrica (metadados do clipe, projeto, peça derivada)
      if (!cols.some((c) => c.name === "meta")) await db.execAsync("ALTER TABLE takes ADD COLUMN meta TEXT");
      const ccols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(content_items)");
      if (!ccols.some((c) => c.name === "project")) await db.execAsync("ALTER TABLE content_items ADD COLUMN project TEXT; ALTER TABLE content_items ADD COLUMN derived_from TEXT; ALTER TABLE content_items ADD COLUMN precisa_revisao TEXT;");
      return db;
    })();
  }
  return dbPromise;
}

/** LGPD: erase everything local (files are removed by the caller). */
export async function wipeLocalDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM outbox; DELETE FROM fingerprints; DELETE FROM takes; DELETE FROM media; DELETE FROM task_events; DELETE FROM tasks; DELETE FROM content_items; DELETE FROM kv;");
}
