// Dev-only visual check: renders a demo final from synthetic parts. Usage: tsx src/demo.ts <outDir> <fontFile>
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { RODRIGO_PROFILE, buildEditPlan, buildSegments, generateLocal } from "@postai/domain";
import { probe, render } from "./ffmpeg";

async function main() {
  const [dir, font] = process.argv.slice(2) as [string, string];
  const draft = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "reflexao", pillarName: "Reflexão", format: "main_video", eventText: null, recent: [] }).draft;
  const segments = buildSegments(draft, { selectedHook: 0, userEdited: false, closingPhrase: RODRIGO_PROFILE.closingPhrase });
  const inputs = segments.map((s) => {
    const f = join(dir, `part${s.index}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=720x1280:rate=30:duration=${2 + s.text.length / 30}`, "-f", "lavfi", "-i", "sine=frequency=220", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", f]);
    return f;
  });
  const takes = await Promise.all(inputs.map(async (f, i) => ({ segmentIndex: i, takeId: `t${i}`, durationMs: (await probe(f)).durationMs })));
  const plan = buildEditPlan({ segments, takes, signature: RODRIGO_PROFILE.signature });
  const res = await render({ plan, inputs, fontFile: font, output: join(dir, "final.mp4") });
  process.stdout.write(JSON.stringify({ res, clips: plan.clips.map((c) => [c.role, c.effect.kind, c.durationMs]) }) + "\n");
}
main();
