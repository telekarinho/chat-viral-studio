import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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
