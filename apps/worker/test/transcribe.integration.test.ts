/** Legenda da fala real: voz sintética (espeak-ng) → Whisper → palavras com tempo. Só roda com WHISPER_PYTHON (CI). */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cuesFromWords } from "@postai/domain";
import { transcribeClip } from "../src/media-extras";

const ready = Boolean(process.env.WHISPER_PYTHON) && (() => {
  try {
    execFileSync("espeak-ng", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!ready)("transcrição da fala (Whisper)", () => {
  it("devolve as palavras ditas com tempo, e a legenda segue a fala (não o roteiro)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "postai-whisper-"));
    const wav = join(dir, "fala.wav");
    const mp4 = join(dir, "take.mp4");
    // 1s de silêncio antes da fala: a legenda tem que começar quando a pessoa FALA
    execFileSync("espeak-ng", ["-v", "pt-br", "-s", "150", "-w", wav, "Porque eu sou contigo. Hoje eu escolhi não desistir."]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=6", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
      "-i", wav, "-filter_complex", "[1:a]atrim=duration=1[s];[s][2:a]concat=n=2:v=0:a=1[a]", "-map", "0:v", "-map", "[a]", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4]);

    const words = await transcribeClip(mp4, 0, 5500, "roteiro diferente do que foi falado", dir);
    expect(words).not.toBeNull();
    const text = words!.map((w) => w.text.toLowerCase()).join(" ");
    expect(text).toMatch(/contigo/);
    expect(text).toMatch(/desistir/);
    expect(words![0]!.startMs).toBeGreaterThan(400); // 1s de silêncio antes; o Whisper arredonda o início
    for (let i = 1; i < words!.length; i++) expect(words![i]!.startMs).toBeGreaterThanOrEqual(words![i - 1]!.startMs);

    const cues = cuesFromWords(words!, "manuscrito", 5500);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues[0]!.text).toMatch(/^PORQUE EU SOU CONTIGO/);
  }, 600_000);
});
