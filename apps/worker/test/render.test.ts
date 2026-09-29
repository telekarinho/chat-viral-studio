import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { RODRIGO_PROFILE, buildAss, buildEditPlan, buildSegments, generateLocal } from "@postai/domain";
import { writeFileSync } from "node:fs";
import { escapeDrawtext, ffmpegArgs, filterPath, zoomExpr } from "../src/render";
import { editChoices } from "../src/job";
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
    // transições automáticas entre as partes (imagem e som)
    expect(graph).toMatch(/\[v0\]\[v1\]xfade=transition=\w+:duration=0\.\d+:offset=/);
    expect(graph).toContain("acrossfade=");
    const cut = ffmpegArgs({ plan: { ...plan, transitions: [] }, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, false, true], fontFile: "f.ttf", output: "o.mp4" });
    expect(cut[cut.indexOf("-filter_complex") + 1]).toContain("concat=n=3:v=1:a=1");
    expect(graph).toContain("loudnorm");
    expect(graph).toContain("RodrigoSerra.me");
    expect(args).toContain("[vout]");
    expect(graph).toContain("bilateral="); // retoque leve on by default
    const off = ffmpegArgs({ plan: { ...plan, retouch: "off" }, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4" });
    expect(off[off.indexOf("-filter_complex") + 1]).not.toContain("bilateral=");
  });
  it("embelezamento só na pele (máscara), 3 níveis, sem saturar a boca, e tirar tremido", () => {
    const g = (p: typeof plan) => { const a = ffmpegArgs({ plan: p, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4" }); return a[a.indexOf("-filter_complex") + 1]!; };
    const forte = g({ ...plan, retouch: "forte", stabilize: true });
    expect(forte).toContain("chromakey=color=0xC08A70"); // máscara de pele
    expect(forte).toContain("bilateral=sigmaS=12:sigmaR=0.11");
    expect(forte).toContain("blend=all_mode=normal:all_opacity=0.80"); // textura volta: sem cara de plástico
    expect(forte).toContain("vibrance=");
    expect(forte).not.toMatch(/saturation=1\.\d/); // não reforça vermelho da boca
    expect(forte).toContain("deshake=");
    expect(g({ ...plan, retouch: "leve" })).toContain("bilateral=sigmaS=6:sigmaR=0.08");
    const off = g({ ...plan, retouch: "off", stabilize: false });
    expect(off).not.toContain("chromakey");
    expect(off).not.toContain("deshake");
    expect(editChoices(null, "academia", false, "c").retouch).toBe("forte");
    expect(editChoices(null, "demonstracao", true, "c").retouch).toBe("leve");
    expect(editChoices({ edit: { retouch: "rosa-choque", stabilize: "x" } }, "academia", false, "c")).toMatchObject({ retouch: "forte", stabilize: true });
  });
  it("legenda ASS sobre o vídeo montado e música com ducking sob a voz", () => {
    const withMusic = { ...plan, music: { trackId: "mixkit-32", mood: "motivacional" as const, volume: 0.22 } };
    const args = ffmpegArgs({ plan: withMusic, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4", assFile: String.raw`C:\tmp\leg.ass`, fontsDir: String.raw`C:\fonts`, musicFile: "m.mp3" });
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain(String.raw`subtitles=filename='C\:/tmp/leg.ass':fontsdir='C\:/fonts'`);
    expect(graph).toContain("sidechaincompress");
    expect(graph).toContain("afade=t=in");
    expect(args.slice(args.indexOf("-stream_loop"), args.indexOf("-stream_loop") + 4)).toEqual(["-stream_loop", "-1", "-i", "m.mp3"]);
    const none = ffmpegArgs({ plan: { ...plan, captionStyle: "nenhuma" }, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4", assFile: "x.ass" });
    expect(none[none.indexOf("-filter_complex") + 1]).not.toContain("subtitles=");
    expect(none).not.toContain("-stream_loop");
    expect(filterPath(String.raw`D:\a b\c's.ass`)).toBe(String.raw`D\:/a b/c\'s.ass`);
  });
  it("escolhas do criador validadas no servidor (legenda, música auto pelo pilar, sem música)", () => {
    expect(editChoices(null, "academia", false, "c1")).toMatchObject({ captionStyle: "manuscrito", music: { mood: "treino", volume: 0.22 } });
    expect(editChoices({ edit: { captionStyle: "destaque", music: "none" } }, "academia", false, "c1")).toMatchObject({ captionStyle: "destaque", music: null });
    expect(editChoices({ edit: { captionStyle: "<script>", music: "mixkit-22", musicVolume: 9 } }, "x", false, "c1")).toMatchObject({ captionStyle: "manuscrito", music: { trackId: "mixkit-22", mood: "reflexao", volume: 0.22 } });
    expect(editChoices({ edit: { music: "empresa" } }, "educacao", true, "c1").music?.mood).toBe("empresa");
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
    const music = join(dir, "music.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=4", "-c:a", "libmp3lame", music]);
    const plan = buildEditPlan({ segments, takes, signature: "RodrigoSerra.me", captionStyle: "destaque", retouch: "forte", stabilize: true, music: { trackId: "mixkit-32", mood: "motivacional", volume: 0.22 } });
    const assFile = join(dir, "legendas.ass");
    writeFileSync(assFile, buildAss(plan), "utf8");
    const out = join(dir, "final.mp4");
    const res = await render({ plan, inputs, fontFile: FONT, output: out, assFile, musicFile: music });
    expect(res.width).toBe(1080);
    expect(res.height).toBe(1920);
    expect(res.hasAudio).toBe(true);
    expect(Math.abs(res.durationMs - plan.totalMs)).toBeLessThan(250);
  }, 180_000);
});

describe("catálogo MMIX para o estúdio", async () => {
  const { produtosParaEstudio } = await import("../src/mmix");
  it("só mixers ControlPot, sem franquias, serviços, preço ou descrição", () => {
    const out = produtosParaEstudio([
      { id: 348, nome: "Mixer Profissional MMIX SD 201 ControlPot", sku_interno: "CF-MIXERP-1778541098", categoria: "Mixer", modelo: null, imagem_principal: "uploads/catalogo/produtos/348/foto_1.jpeg" },
      { id: 374, nome: "Mixer MilkyMoo BASE DE TROCA", sku_interno: "MIXER-BASE-TROCA", categoria: "Mixers", modelo: null, imagem_principal: "" },
      { id: 47, nome: "Mixers Sob Demanda", sku_interno: "SERV-SOB-DEMANDA", categoria: "Serviços", modelo: null, imagem_principal: null },
      { id: 9, nome: "Caneca inox", sku_interno: "X", categoria: "Peças", modelo: null, imagem_principal: null },
    ], "https://mmix.com.br");
    expect(out).toEqual([{ id: 348, sku: "CF-MIXERP-1778541098", nome: "Mixer Profissional MMIX SD 201 ControlPot", categoria: "Mixer", modelo: null, imagem: "https://mmix.com.br/uploads/catalogo/produtos/348/foto_1.jpeg" }]);
    expect(JSON.stringify(out)).not.toMatch(/preco|valor|R\$/);
  });
});
