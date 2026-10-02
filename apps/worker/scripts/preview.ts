/**
 * Prévia local da edição (para olhar como editor): monta 2 partes com cortes, legenda manuscrita, gancho,
 * assinatura e cor, e salva quadros em PNG. Uso: npx tsx apps/worker/scripts/preview.ts <pasta com p0.mp4,p1.mp4,fonts/>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAss, buildEditPlan, cuesFromWords, withClips, type ScriptSegment, type SpokenWord } from "@postai/domain";
import { render } from "../src/ffmpeg";

const dir = process.argv[2] ?? ".";
const speak = (text: string, at = 0, step = 380): SpokenWord[] =>
  text.split(" ").map((t, i) => ({ text: t, startMs: at + i * step, endMs: at + i * step + step - 40 }));

async function main() {
  const segments: ScriptSegment[] = [
    { index: 0, role: "hook", label: "Gancho", text: "Boas notícias! Hoje eu aprendi uma coisa" },
    { index: 1, role: "closing", label: "Fechamento", text: "Sendo abençoado por Deus. E se der certo!" },
  ];
  const base = buildEditPlan({
    segments, signature: "@rodrigoserra.me", watermark: "inf-centro", captionStyle: "manuscrito", retouch: "leve", hookText: "Ninguém te conta isso",
    takes: segments.map((s) => ({ segmentIndex: s.index, takeId: `t${s.index}`, durationMs: 4000 })),
  });
  // parte 1 com 2 cortes (jump cut) para ver o "soco" de zoom alternando
  const clips = base.clips.map((c, i) => ({
    ...c,
    ...(i === 0 ? { durationMs: 3300, keep: [{ startMs: 200, endMs: 1300 }, { startMs: 1500, endMs: 2600 }, { startMs: 2800, endMs: 3900 }] } : {}),
    captions: cuesFromWords(speak(i === 0 ? "boas notícias hoje eu aprendi uma coisa" : "sendo abençoado por deus e se der certo", 100), "manuscrito", 3800),
  }));
  const plan = withClips(base, clips);
  const assFile = join(dir, "prev.ass");
  writeFileSync(assFile, buildAss(plan), "utf8");
  const out = join(dir, "prev.mp4");
  const res = await render({ plan, inputs: [join(dir, "p0.mp4"), join(dir, "p1.mp4")], fontFile: join(dir, "fonts", "Anton-Regular.ttf"), output: out, assFile, fontsDir: join(dir, "fonts") });
  for (const [name, t] of [["a_gancho", 0.6], ["b_corte1", 1.5], ["c_corte2", 2.5], ["d_parte2", 4.8]] as const) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", out, "-frames:v", "1", "-vf", "scale=540:-1", join(dir, `${name}.png`)]);
  }
  process.stdout.write(JSON.stringify(res) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
