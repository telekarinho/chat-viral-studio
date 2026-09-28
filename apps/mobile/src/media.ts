import { Directory, File, Paths } from "expo-file-system";

/** Originals live in the app's document dir (not cache): the OS doesn't purge it and it survives app kill. */
export function takesDir(): Directory {
  const dir = new Directory(Paths.document, "takes");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export interface PersistedFile {
  uri: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Moves the finished recording from the camera temp path into durable storage and computes its checksum.
 * Only after this returns is the recording considered "saved".
 */
export function persistRecording(tempPath: string, mediaId: string): PersistedFile {
  const src = new File(tempPath.startsWith("file://") ? tempPath : `file://${tempPath}`);
  if (!src.exists) throw new Error("O arquivo gravado não foi encontrado.");
  const dest = new File(takesDir(), `${mediaId}.mp4`);
  if (dest.exists) dest.delete();
  src.move(dest);
  const saved = new File(takesDir(), `${mediaId}.mp4`);
  const size = saved.size ?? 0;
  const md5 = saved.md5;
  if (!saved.exists || size <= 0 || !md5) throw new Error("Falha ao confirmar o vídeo salvo no aparelho.");
  return { uri: saved.uri, sizeBytes: size, checksum: md5 };
}

export function fileExists(uri: string): boolean {
  return new File(uri).exists;
}

export function freeDiskBytes(): number {
  return Paths.availableDiskSpace;
}

export function deleteAllLocalTakes(): void {
  const dir = new Directory(Paths.document, "takes");
  if (dir.exists) dir.delete();
}
