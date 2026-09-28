import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegArgs, type RenderInput } from "./render";

const run = promisify(execFile);

export interface ProbeResult { durationMs: number; width: number; height: number; hasAudio: boolean }

export async function probe(file: string, ffprobe = "ffprobe"): Promise<ProbeResult> {
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file]);
  const j = JSON.parse(stdout) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration?: string } };
  const video = j.streams.find((s) => s.codec_type === "video");
  return {
    durationMs: Math.round(Number(j.format.duration ?? 0) * 1000),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

export async function render(input: Omit<RenderInput, "hasAudio">, ffmpeg = "ffmpeg", ffprobe = "ffprobe"): Promise<ProbeResult> {
  const hasAudio = await Promise.all(input.inputs.map(async (f) => (await probe(f, ffprobe)).hasAudio));
  await run(ffmpeg, ffmpegArgs({ ...input, hasAudio }), { maxBuffer: 16 * 1024 * 1024 });
  return probe(input.output, ffprobe);
}
