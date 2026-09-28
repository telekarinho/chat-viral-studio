/**
 * Media sync state machine (docs/VIDEO_PIPELINE.md). Pure so it can be unit-tested and
 * shared: the device drives it, the file on disk is never touched here.
 */
export const MEDIA_STATES = ["local_only", "queued", "uploading", "uploaded_original", "dead_letter"] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

export interface MediaRecord {
  id: string;
  state: MediaState;
  sizeBytes: number;
  checksum: string; // md5 hex of the local original
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  remoteVerifiedAt: string | null;
}

export type SyncEvent =
  | { type: "enqueue" }
  | { type: "start" }
  | { type: "uploaded"; remoteSize: number; remoteChecksum: string | null }
  | { type: "failed"; error: string }
  /** network dropped: not the file's fault, so it doesn't consume an attempt */
  | { type: "interrupted"; error: string }
  /** connectivity is back: queued items become due immediately */
  | { type: "online" }
  | { type: "retry" };

export const SYNC_POLICY = { baseDelayMs: 5_000, maxDelayMs: 30 * 60_000, maxAttempts: 8 };

export function backoffMs(attempts: number): number {
  return Math.min(SYNC_POLICY.baseDelayMs * 2 ** Math.max(0, attempts - 1), SYNC_POLICY.maxDelayMs);
}

export function applySyncEvent(r: MediaRecord, ev: SyncEvent, now: Date): MediaRecord {
  const iso = now.toISOString();
  switch (ev.type) {
    case "enqueue":
      return r.state === "local_only" ? { ...r, state: "queued", nextAttemptAt: iso } : r;
    case "start":
      if (r.state !== "queued") throw new Error(`start inválido em ${r.state}`);
      return { ...r, state: "uploading" };
    case "uploaded": {
      if (r.state !== "uploading") throw new Error(`uploaded inválido em ${r.state}`);
      const sizeOk = ev.remoteSize === r.sizeBytes;
      const sumOk = ev.remoteChecksum === null || ev.remoteChecksum.toLowerCase() === r.checksum.toLowerCase();
      if (!sizeOk || !sumOk) return applySyncEvent(r, { type: "failed", error: `integridade remota divergente (tamanho ${ev.remoteSize}/${r.sizeBytes})` }, now);
      return { ...r, state: "uploaded_original", lastError: null, nextAttemptAt: null, remoteVerifiedAt: iso };
    }
    case "failed": {
      if (r.state !== "uploading" && r.state !== "queued") throw new Error(`failed inválido em ${r.state}`);
      const attempts = r.attempts + 1;
      if (attempts >= SYNC_POLICY.maxAttempts) return { ...r, state: "dead_letter", attempts, lastError: ev.error, nextAttemptAt: null };
      return { ...r, state: "queued", attempts, lastError: ev.error, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)).toISOString() };
    }
    case "interrupted":
      if (r.state !== "uploading" && r.state !== "queued") return r;
      return { ...r, state: "queued", lastError: ev.error, nextAttemptAt: new Date(now.getTime() + SYNC_POLICY.baseDelayMs).toISOString() };
    case "online":
      return r.state === "queued" ? { ...r, nextAttemptAt: iso } : r;
    case "retry":
      return r.state === "dead_letter" || r.state === "queued" ? { ...r, state: "queued", attempts: 0, nextAttemptAt: iso } : r;
  }
}

/** An upload interrupted by app kill stays "uploading" on disk; on boot it goes back to the queue. */
export function recoverAfterRestart(r: MediaRecord, now: Date): MediaRecord {
  return r.state === "uploading" ? { ...r, state: "queued", nextAttemptAt: now.toISOString() } : r;
}

export function isDue(r: MediaRecord, now: Date): boolean {
  return r.state === "queued" && (r.nextAttemptAt === null || new Date(r.nextAttemptAt).getTime() <= now.getTime());
}

/** Local original can only be removed after remote integrity is confirmed AND the retention policy allows it. */
export function canDeleteLocal(r: MediaRecord, policy: { allowCleanup: boolean; keepDays: number }, now: Date): boolean {
  if (!policy.allowCleanup || r.state !== "uploaded_original" || !r.remoteVerifiedAt) return false;
  return now.getTime() - new Date(r.remoteVerifiedAt).getTime() >= policy.keepDays * 86_400_000;
}

export const SYNC_LABEL: Record<MediaState, string> = {
  local_only: "Salvo no aparelho",
  queued: "Na fila para enviar",
  uploading: "Enviando…",
  uploaded_original: "Sincronizado",
  dead_letter: "Falhou — toque para tentar de novo",
};
