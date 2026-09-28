import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { RODRIGO_PROFILE, buildEditPlan, buildSegments, generateLocal } from "@postai/domain";
import { escapeDrawtext, ffmpegArgs, zoomExpr } from "../src/render";
import { probe, render } from "../src/ffmpeg";

const run = promisify(execFile);
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const FONT = [process.env.FONT_FILE, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"].find((f) => f && existsSync(f)) ?? "";

const draft = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "academia", pillarName: "Academia", format: "main_video", eventText: null, recent: [] }).draft;
const segments = buildSegments(draft, { selectedHook: 0, userEdited: false, closingPhrase: "E se der certo!" }).slice(0, 3);

describe("renderizador (comando)", () => {
  const plan = buildEditPlan({ segments, signature: "RodrigoSerra.me", takes: segments.map((s) => ({ segmentIndex: s.index, takeId: `t${s.index}`, durationMs: 3000 })) });
  it("escapa texto para drawtext", () => {
    expect(escapeDrawtext("Olá: 100% d'ele")).toBe(String.raw`Olá\: 100\% d` + "’ele");
  });
  it("zoom vai de→para e segura", () => {
    expect(zoomExpr(plan.clips[0]!, 30)).toBe(String.raw`1.0000+(0.1400)*min(on/14\,1)`);
    expect(zoomExpr({ ...plan.clips[0]!, effect: { kind: "hold", fromScale: 1.04, toScale: 1.04, moveMs: 0 } }, 30)).toBe("1.0400");
  });
  it("usa silêncio quando a parte não tem áudio e mapeia saída 9:16", () => {
    const args = ffmpegArgs({ plan, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, false, true], fontFile: "f.ttf", output: "out.mp4" });
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("anullsrc");
    expect(graph).toContain("concat=n=3:v=1:a=1");
    expect(graph).toContain("loudnorm");
    expect(graph).toContain("RodrigoSerra.me");
    expect(args).toContain("[vout]");
  });
});

describe.skipIf(!hasFfmpeg || !FONT)("renderizador (FFmpeg real)", () => {
  it("junta 3 partes gravadas, aplica zoom/legendas/assinatura e entrega 1080x1920 pronto para postar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "postai-render-"));
    const inputs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const f = join(dir, `part${i}.mp4`);
      const audio = i === 1 ? [] : ["-f", "lavfi", "-i", `sine=frequency=${300 + i * 100}:duration=3`];
      // phone-like portrait source, part 2 without audio (mic denied)
      await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=3", ...audio, "-c:v", "libx264", "-pix_fmt", "yuv420p", ...(audio.length ? ["-c:a", "aac", "-shortest"] : []), f]);
      inputs.push(f);
    }
    const takes = await Promise.all(inputs.map(async (f, i) => ({ segmentIndex: segments[i]!.index, takeId: `t${i}`, durationMs: (await probe(f)).durationMs })));
    const plan = buildEditPlan({ segments, takes, signature: "RodrigoSerra.me" });
    const out = join(dir, "final.mp4");
    const res = await render({ plan, inputs, fontFile: FONT, output: out });
    expect(res.width).toBe(1080);
    expect(res.height).toBe(1920);
    expect(res.hasAudio).toBe(true);
    expect(Math.abs(res.durationMs - plan.totalMs)).toBeLessThan(250);
  }, 180_000);
});
