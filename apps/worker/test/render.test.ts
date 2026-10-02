import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { RODRIGO_PROFILE, assignBroll, buildAss, buildEditPlan, buildSegments, generateLocal, withClips, type SpokenWord } from "@postai/domain";
import { writeFileSync } from "node:fs";
import { escapeDrawtext, ffmpegArgs, filterPath, jumpCutPunch, zoomExpr } from "../src/render";
import { editChoices, editFromSpeech, jobVariant } from "../src/job";
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
    expect(args).toContain("[vout]");
    expect(graph).toContain("bilateral="); // retoque leve on by default
    const off = ffmpegArgs({ plan: { ...plan, retouch: "off" }, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4" });
    expect(off[off.indexOf("-filter_complex") + 1]).not.toContain("bilateral=");
  });
  it("cor de cinema e legenda/assinatura pela camada ASS (sem texto queimado à parte)", () => {
    const g = (p: typeof plan, assFile?: string) => { const a = ffmpegArgs({ plan: p, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4", assFile }); return a[a.indexOf("-filter_complex") + 1]!; };
    expect(g(plan)).toContain("eq=contrast=1.06:gamma=0.98,vibrance=intensity=0.12");
    expect(g(plan)).toContain("vignette=");
    expect(g(plan)).not.toContain("drawtext=");
    // a assinatura vem no .ass: aplica mesmo com "sem legenda"
    expect(g({ ...plan, captionStyle: "nenhuma" }, "l.ass")).toContain("subtitles=filename='l.ass'");
  });
  it("jump cut: a cada corte dentro da parte o quadro alterna normal ↔ mais perto", () => {
    expect(jumpCutPunch({ keep: [{ startMs: 0, endMs: 1000 }] }, 30)).toBe("");
    const z = jumpCutPunch({ keep: [{ startMs: 0, endMs: 1000 }, { startMs: 1500, endMs: 2500 }, { startMs: 3000, endMs: 3500 }, { startMs: 4000, endMs: 5000 }] }, 30);
    // 2º trecho = quadros 30..59, 4º = 75..104 (o 3º tem 15 quadros)
    expect(z).toBe(String.raw`+0.1*(between(on\,30\,59)+between(on\,75\,104))`);
    expect(zoomExpr({ ...plan.clips[0]!, keep: [{ startMs: 0, endMs: 1000 }, { startMs: 1500, endMs: 2500 }] }, 30)).toContain("+0.1*(between(on");
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
  it("corte automático vira select/aselect, voz limpa e cena de apoio por cima", () => {
    const clips = plan.clips.map((c, i) => (i === 0 ? { ...c, durationMs: 1800, keep: [{ startMs: 300, endMs: 1200 }, { startMs: 1900, endMs: 2800 }] } : i === 1 ? { ...c, broll: { takeId: "cafe", atMs: 900, durationMs: 1200 } } : c));
    const p = withClips({ ...plan, voiceClean: true }, clips);
    const args = ffmpegArgs({ plan: { ...p, music: { trackId: "mixkit-32", mood: "motivacional", volume: 0.22 } }, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4", brollFiles: { cafe: "cafe.mp4" }, musicFile: "m.mp3" });
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain(String.raw`[0:v]fps=30,select='between(t\,0.300\,1.200)+between(t\,1.900\,2.800)',setpts=N/(30*TB)`);
    expect(graph).toContain(String.raw`aselect='between(t\,0.300\,1.200)+between(t\,1.900\,2.800)',asetpts=N/SR/TB`);
    expect(graph).toContain("highpass=f=90,afftdn=nr=10:nf=-28,equalizer=f=3200");
    expect(graph).toContain("acompressor=");
    expect(graph).toContain("[3:v]trim=start=0.15:duration=1.200,setpts=PTS-STARTPTS+0.900/TB");
    expect(graph).toContain(String.raw`[z1][br1]overlay=enable='between(t\,0.900\,2.100)'`);
    expect(graph).toContain("[4:a]aresample=48000"); // música vem depois da cena de apoio
    expect(args.filter((a) => a === "-i")).toHaveLength(5);
    // cena de apoio sem arquivo baixado é ignorada (não quebra a montagem)
    const semArquivo = ffmpegArgs({ plan: p, inputs: ["a.mp4", "b.mp4", "c.mp4"], hasAudio: [true, true, true], fontFile: "f.ttf", output: "o.mp4" });
    expect(semArquivo[semArquivo.indexOf("-filter_complex") + 1]).not.toContain("overlay=enable");
  });
  it("edição pela fala: corta pausa e repetição, legenda segue a fala, sem transcrição não corta", async () => {
    const say = (txt: string, t0: number): SpokenWord[] => txt.split(" ").map((w, i) => ({ text: w, startMs: t0 + i * 300, endMs: t0 + i * 300 + 260 }));
    const choices = editChoices(null, "academia", false, "c");
    const fake = async (file: string) => (file === "a.mp4" ? [...say("hoje eu quero", 100), ...say("hoje eu quero treinar", 1200)] : file === "b.mp4" ? null : say("bora", 300));
    const r = await editFromSpeech({ plan, choices, prompt: "" }, ["a.mp4", "b.mp4", "c.mp4"], ".", fake);
    expect(r.cuts.repeats).toBe(1);
    expect(r.plan.clips[0]!.keep!.length).toBeGreaterThanOrEqual(1);
    expect(r.plan.clips[0]!.keep![0]!.startMs).toBeGreaterThanOrEqual(plan.clips[0]!.trimStartMs); // tempo do arquivo original
    expect(r.plan.clips[0]!.durationMs).toBeLessThan(plan.clips[0]!.durationMs);
    expect(r.plan.clips[0]!.captions.map((c) => c.text).join(" ")).toBe("HOJE EU QUERO TREINAR");
    expect(r.plan.clips[1]).toEqual(plan.clips[1]); // sem fala reconhecida: intacto
    expect(r.spoken).toBe(false);
    expect(r.transcript).toBe("hoje eu quero treinar bora");
    expect(r.plan.totalMs).toBeLessThan(plan.totalMs);
    const semCorte = await editFromSpeech({ plan, choices: { ...choices, autoCut: false }, prompt: "" }, ["a.mp4", "b.mp4", "c.mp4"], ".", fake);
    expect(semCorte.plan.clips[0]!.keep).toBeUndefined();
    expect(semCorte.plan.totalMs).toBe(plan.totalMs);
  });
  it("versão curta só quando pedida; opções novas ligadas por padrão e validadas", () => {
    expect(jobVariant({ plan: { variant: "curto" } })).toBe("curto");
    expect(jobVariant({ plan: { variant: "'; drop" } })).toBe("completo");
    expect(jobVariant({ plan: null })).toBe("completo");
    expect(editChoices(null, "x", false, "c")).toMatchObject({ autoCut: true, voiceClean: true, broll: true, hook: true });
    expect(editChoices({ edit: { autoCut: false, broll: "sim" } }, "x", false, "c")).toMatchObject({ autoCut: false, broll: true });
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
    // "sem legenda" ainda leva o .ass: ele carrega a assinatura do perfil e o gancho
    expect(none[none.indexOf("-filter_complex") + 1]).toContain("subtitles=filename='x.ass'");
    expect(none).not.toContain("-stream_loop");
    expect(filterPath(String.raw`D:\a b\c's.ass`)).toBe(String.raw`D\:/a b/c\'s.ass`);
  });
  it("escolhas do criador validadas no servidor (legenda, música auto pelo pilar, sem música)", () => {
    expect(editChoices(null, "academia", false, "c1")).toMatchObject({ captionStyle: "manuscrito", music: { mood: "treino", volume: 0.22 } });
    expect(editChoices({ edit: { captionStyle: "destaque", music: "none" } }, "academia", false, "c1")).toMatchObject({ captionStyle: "destaque", music: null });
    expect(editChoices({ edit: { captionStyle: "<script>", music: "mixkit-22", musicVolume: 9 } }, "x", false, "c1")).toMatchObject({ captionStyle: "manuscrito", music: { trackId: "mixkit-22", mood: "reflexao", volume: 0.22 } });
    expect(editChoices({ edit: { music: "empresa" } }, "educacao", true, "c1").music?.mood).toBe("empresa");
  });
  it("música da direção: no automático usa a faixa, o volume e a janela do diretor; escolha do criador vence", () => {
    const direction = { musica: { id: "mixkit-839", clima: "", bpm: null, volume: 0.3, entrada: 2, saida: 20 } } as unknown as Parameters<typeof editChoices>[4];
    expect(editChoices(null, "academia", false, "c1", direction).music).toEqual({ trackId: "mixkit-839", mood: "familia", volume: 0.3, startMs: 2000, endMs: 20000 });
    expect(editChoices({ edit: { music: "mixkit-22" } }, "academia", false, "c1", direction).music?.trackId).toBe("mixkit-22");
    expect(editChoices({ edit: { music: "none" } }, "academia", false, "c1", direction).music).toBeNull();
  });
  it("música com janela: entra atrasada e completa até o fim do vídeo", () => {
    const p = { ...plan, music: { trackId: "mixkit-839", mood: "familia" as const, volume: 0.3, startMs: 2000, endMs: 5000 } };
    const args = ffmpegArgs({ plan: p, inputs: ["a.mp4", "b.mp4", "c.mp4"], fontFile: "f.ttf", output: "o.mp4", hasAudio: [true, true, true], musicFile: "m.mp3" }).join(" ");
    expect(args).toContain("atrim=duration=3.000");
    expect(args).toContain("adelay=2000|2000");
    expect(args).toMatch(/apad=whole_dur=/);
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
    const broll = join(dir, "broll.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "smptebars=size=1280x720:rate=30:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", broll]);
    const base = buildEditPlan({ segments, takes, signature: "RodrigoSerra.me", captionStyle: "destaque", retouch: "forte", stabilize: true, voiceClean: true, hookText: "Treino de hoje", watermark: "sup-dir",
      // direção: música entra em 1s e sai em 4s; texto na tela no centro
      music: { trackId: "mixkit-32", mood: "motivacional", volume: 0.22, startMs: 1000, endMs: 4000 }, overlays: [{ text: "Vida real", startMs: 500, endMs: 2500, position: "centro" }] });
    // parte 1 com corte no meio; parte 3 com cena de apoio (horizontal, vira 9:16)
    const cut = base.clips.map((c, i) => (i === 0 ? { ...c, durationMs: 1600, keep: [{ startMs: 300, endMs: 1100 }, { startMs: 1700, endMs: 2500 }] } : i === 2 ? { ...c, broll: { takeId: "b", atMs: 600, durationMs: 1200 } } : c));
    const plan = withClips(base, cut);
    expect(assignBroll(base.clips, [{ takeId: "b", durationMs: 3000 }]).filter((c) => c.broll)).toHaveLength(0); // partes de 3s são curtas demais para b-roll automático
    const assFile = join(dir, "legendas.ass");
    writeFileSync(assFile, buildAss(plan), "utf8");
    const out = join(dir, "final.mp4");
    const res = await render({ plan, inputs, fontFile: FONT, output: out, assFile, musicFile: music, brollFiles: { b: broll } });
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
