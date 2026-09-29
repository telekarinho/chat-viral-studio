import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as LegacyFS from "expo-file-system/legacy";
import { applySyncEvent, canDeleteLocal, isDue, recoverAfterRestart } from "@postai/domain";
import { File } from "expo-file-system";
import { supabase } from "../supabase";
import { fileExists } from "../media";
import {
  deleteOutbox, enqueue, failOutbox, getWorkspace, listMedia, listOutbox, mediaServerRow, outboxCount, saveMedia, type MediaRow, type OutboxPayload,
} from "../db/repo";

export interface SyncStatus {
  running: boolean;
  online: boolean;
  pendingRows: number;
  pendingMedia: number;
  failedMedia: number;
  lastRunAt: string | null;
  lastError: string | null;
}

let status: SyncStatus = { running: false, online: true, pendingRows: 0, pendingMedia: 0, failedMedia: 0, lastRunAt: null, lastError: null };
const listeners = new Set<(s: SyncStatus) => void>();
const emit = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
};
export const getSyncStatus = () => status;
export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

class OfflineError extends Error {}

const isNetworkError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  return /network|fetch|timeout|abort|connect|resolve host|Unable to resolve/i.test(msg);
};

async function flushOutbox(): Promise<void> {
  if (!supabase) return;
  for (let round = 0; round < 20; round++) {
    const batch = await listOutbox(50);
    if (batch.length === 0) return;
    for (const item of batch) {
      const payload = JSON.parse(item.payload) as OutboxPayload;
      try {
        if (payload.replaceFor) {
          const del = await supabase.from(item.table_name).delete().eq(payload.replaceFor.column, payload.replaceFor.value);
          if (del.error) throw del.error;
        }
        for (const row of payload.update ? payload.rows : []) {
          const { error } = await supabase.from(item.table_name).update(row).eq("id", row.id as string);
          if (error) throw error;
        }
        if (!payload.update && payload.rows.length > 0) {
          const q = payload.replaceFor || payload.insertOnly ? supabase.from(item.table_name).insert(payload.rows) : supabase.from(item.table_name).upsert(payload.rows, payload.onConflict ? { onConflict: payload.onConflict } : undefined);
          const { error } = await q;
          // insert-only rows (queues the client may create but not change): a replay of an already-sent row is fine
          if (error && !(payload.insertOnly && error.code === "23505")) throw error;
        }
        await deleteOutbox(item.seq);
      } catch (e) {
        if (isNetworkError(e)) throw new OfflineError(String(e));
        // data error (e.g. parent row not synced yet): keep it, retry next pass, don't block the queue
        await failOutbox(item.seq, (e as { message?: string }).message ?? String(e));
      }
    }
    if (batch.length < 50) return;
  }
}

async function remoteObjectInfo(workspaceId: string, name: string): Promise<{ size: number; md5: string | null } | null> {
  const { data, error } = await supabase!.storage.from("takes").list(workspaceId, { search: name, limit: 5 });
  if (error) throw error;
  const obj = data?.find((o) => o.name === name);
  if (!obj?.metadata) return null;
  const etag = String(obj.metadata.eTag ?? "").replace(/"/g, "");
  return { size: Number(obj.metadata.size ?? obj.metadata.contentLength ?? -1), md5: /^[a-f0-9]{32}$/i.test(etag) ? etag : null };
}

async function uploadOne(m: MediaRow): Promise<MediaRow> {
  const now = () => new Date();
  let r = applySyncEvent(m, { type: "start" }, now()) as MediaRow;
  await saveMedia(r);
  try {
    if (!fileExists(m.localUri)) throw new Error("arquivo local ausente");
    const key = m.storageKey ?? `${m.workspaceId}/${m.id}.mp4`;
    const name = key.split("/")[1]!;
    // idempotent: if a previous attempt already uploaded the same bytes, just verify
    let info = await remoteObjectInfo(m.workspaceId, name);
    if (!info || info.size !== m.sizeBytes) {
      const signed = await supabase!.storage.from("takes").createSignedUploadUrl(key);
      if (signed.error) throw signed.error;
      const res = await LegacyFS.uploadAsync(signed.data.signedUrl, m.localUri, {
        httpMethod: "PUT",
        uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "video/mp4" },
      });
      if (res.status === 413) throw new Error("vídeo maior que o limite por arquivo do armazenamento (plano Free: 50 MB) — grave por partes ou em 1080p");
      if (res.status < 200 || res.status >= 300) throw new Error(`upload HTTP ${res.status}`);
      info = await remoteObjectInfo(m.workspaceId, name);
    }
    r = applySyncEvent(r, { type: "uploaded", remoteSize: info?.size ?? -1, remoteChecksum: info?.md5 ?? null }, now()) as MediaRow;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const offline = isNetworkError(e);
    r = applySyncEvent(r, offline ? { type: "interrupted", error } : { type: "failed", error }, now()) as MediaRow;
    await saveMedia(r);
    if (offline) throw new OfflineError(error);
    return r;
  }
  await saveMedia(r);
  const ws = await getWorkspace();
  if (ws) await enqueue(ws, "media_files", r.id, { rows: [mediaServerRow(r)] });
  return r;
}

let inFlight: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const ws = await getWorkspace();
    if (!supabase || !ws?.cloud) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    emit({ running: true, lastError: null });
    try {
      await flushOutbox();
      for (const m of await listMedia()) {
        if (isDue(m, new Date())) await uploadOne(m);
        else if (canDeleteLocal(m, { allowCleanup: ws.settings.allowLocalCleanup, keepDays: ws.settings.keepLocalDays }, new Date())) {
          const f = new File(m.localUri);
          if (f.exists) f.delete(); // only after verified remote integrity + user opt-in + retention window
        }
      }
      await flushOutbox();
      emit({ online: true });
    } catch (e) {
      emit({ online: !(e instanceof OfflineError), lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      await refreshCounts();
      emit({ running: false, lastRunAt: new Date().toISOString() });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function refreshCounts(): Promise<void> {
  const media = await listMedia();
  emit({
    pendingRows: await outboxCount(),
    pendingMedia: media.filter((m) => m.state === "queued" || m.state === "uploading").length,
    failedMedia: media.filter((m) => m.state === "dead_letter").length,
  });
}

export async function retryMedia(m: MediaRow): Promise<void> {
  await saveMedia(applySyncEvent(m, { type: "retry" }, new Date()) as MediaRow);
  await syncNow();
}

let started = false;

/** Boot: uploads interrupted by an app kill go back to the queue; then sync on connectivity/foreground/interval. */
export async function startSyncEngine(): Promise<void> {
  if (started) return;
  started = true;
  for (const m of await listMedia()) {
    const rec = recoverAfterRestart(m, new Date()) as MediaRow;
    if (rec.state !== m.state) await saveMedia(rec);
  }
  await refreshCounts();
  NetInfo.addEventListener((s) => {
    const online = Boolean(s.isConnected) && s.isInternetReachable !== false;
    const cameBack = online && !status.online;
    emit({ online });
    if (!online) return;
    void (async () => {
      if (cameBack) for (const m of await listMedia()) if (m.state === "queued") await saveMedia(applySyncEvent(m, { type: "online" }, new Date()) as MediaRow);
      await syncNow();
    })();
  });
  AppState.addEventListener("change", (s) => {
    if (s === "active") void syncNow();
  });
  setInterval(() => void syncNow(), 30_000);
  void syncNow();
}
