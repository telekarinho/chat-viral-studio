import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MusicTrack, SpokenWord } from "@postai/domain";

const run = promisify(execFile);

/**
 * Palavras faladas de um trecho [startMs, startMs+durationMs] do take, com tempo relativo ao início do trecho.
 * null = transcrição indisponível (sem Whisper no servidor): o chamador cai para a legenda pelo roteiro.
 */
export async function transcribeClip(input: string, startMs: number, durationMs: number, script: string, workDir: string): Promise<SpokenWord[] | null> {
  const py = process.env.WHISPER_PYTHON;
  if (!py) return null;
  const wav = join(workDir, `clip-${startMs}-${durationMs}.wav`);
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (startMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3), "-i", input, "-vn", "-ac", "1", "-ar", "16000", wav]);
    const script_ = fileURLToPath(new URL("../scripts/transcribe.py", import.meta.url));
    const { stdout } = await run(py, [script_, wav, script], { maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60_000 });
    const raw = JSON.parse(stdout) as { text: string; start: number; end: number }[];
    return raw.map((w) => ({ text: w.text, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) })).filter((w) => w.endMs > w.startMs);
  } catch (e) {
    const stderr = String((e as { stderr?: unknown }).stderr ?? "");
    process.stdout.write(JSON.stringify({ level: "warn", msg: "transcribe.failed", error: e instanceof Error ? e.message.slice(0, 200) : String(e), stderr: stderr.slice(-1500) }) + "\n");
    return null;
  }
}

/** Baixa a faixa da origem (licença não permite redistribuir) e confere o sha256; cache local entre jobs. */
export async function fetchTrack(track: MusicTrack, cacheDir: string): Promise<string | null> {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${track.id}.mp3`);
  const ok = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex") === track.sha256;
  if (existsSync(file) && ok(file)) return file;
  try {
    const res = await fetch(track.url, { headers: { "User-Agent": "PostAI-render/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    if (!ok(file)) throw new Error("sha256 não confere");
    return file;
  } catch (e) {
    process.stdout.write(JSON.stringify({ level: "warn", msg: "music.unavailable", track: track.id, error: e instanceof Error ? e.message : String(e) }) + "\n");
    return null;
  }
}

/** Música própria do criador: baixa do armazenamento do perfil (só arquivos dentro da pasta do próprio workspace). */
export async function downloadOwnMusic(db: SupabaseClient, workspaceId: string, key: string, dir: string): Promise<string | null> {
  if (!key.startsWith(`${workspaceId}/music/`)) return null;
  try {
    const { data, error } = await db.storage.from("takes").download(key);
    if (error || !data) throw new Error(error?.message ?? "sem arquivo");
    const file = join(dir, `musica-propria${key.slice(key.lastIndexOf("."))}`);
    writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    return file;
  } catch (e) {
    process.stdout.write(JSON.stringify({ level: "warn", msg: "own_music.unavailable", key, error: e instanceof Error ? e.message : String(e) }) + "\n");
    return null;
  }
}

/** Onde termina o rosto no trecho [startMs, endMs] do arquivo (fração da altura do quadro); null sem modelo/rosto. */
export async function detectFaceBottom(file: string, startMs: number, endMs: number): Promise<{ width: number; height: number; faceBottom: number; faceTop: number } | null> {
  const py = process.env.WHISPER_PYTHON;
  if (!py || !process.env.FACE_MODEL) return null;
  try {
    const script = fileURLToPath(new URL("../scripts/face.py", import.meta.url));
    const { stdout } = await run(py, [script, file, (startMs / 1000).toFixed(2), (endMs / 1000).toFixed(2)], { timeout: 60_000 });
    const r = JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as { width?: number; height?: number; faceBottom?: number | null; faceTop?: number | null };
    return r.faceBottom != null && r.faceTop != null && r.width && r.height ? { width: r.width, height: r.height, faceBottom: r.faceBottom, faceTop: r.faceTop } : null;
  } catch (e) {
    process.stdout.write(JSON.stringify({ level: "warn", msg: "face.failed", error: e instanceof Error ? e.message.slice(0, 200) : String(e) }) + "\n");
    return null;
  }
}

/**
 * Início (s) da janela de `lengthS` segundos mais forte da faixa (o refrão costuma ser a parte mais alta).
 * Mede o volume (RMS) de cada segundo com o FFmpeg; sem medida, 0 (começo da faixa).
 */
export async function loudestWindowStartS(file: string, lengthS: number, ffmpeg = "ffmpeg"): Promise<number> {
  try {
    const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-af", "aresample=8000,asetnsamples=n=8000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"], { maxBuffer: 32 * 1024 * 1024 });
    const rms = [...stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
    return bestWindow(rms, Math.ceil(lengthS));
  } catch {
    return 0;
  }
}

/** Índice (segundo) onde começa a janela de `len` segundos com maior volume médio. */
export function bestWindow(rmsPerSecond: readonly number[], len: number): number {
  if (rmsPerSecond.length <= len) return 0;
  let sum = rmsPerSecond.slice(0, len).reduce((a, v) => a + v, 0);
  let best = sum;
  let at = 0;
  for (let i = len; i < rmsPerSecond.length; i++) {
    sum += rmsPerSecond[i]! - rmsPerSecond[i - len]!;
    if (sum > best) { best = sum; at = i - len + 1; }
  }
  return at;
}
