import { PROMPT_VERSION, parseDraft, type ContentDraft, type GenerationMeta } from "./contract";
import { finalizeDraft, type CreatorProfile } from "./prompt";
import { LOCAL_BANK, LOCAL_CTAS, PILLAR_HASHTAGS, type BankSeed } from "./localBank";
import { businessDraft, businessVariants } from "./businessLocal";
import { isBusiness } from "../profiles";
import { checkRepetition, describeAvoidance, fingerprintsFor, type Fingerprint, type RepetitionReport } from "../repetition";

export interface LocalGenerateInput {
  profile: CreatorProfile;
  pillarSlug: string;
  pillarName: string;
  format: "thought" | "main_video";
  eventText: string | null;
  recent: readonly Fingerprint[];
}

export interface GenerationResult {
  draft: ContentDraft;
  meta: GenerationMeta;
  report: RepetitionReport;
  notices: string[];
}

/** Offline generator: same contract and repetition guard as the API path. */
export function generateLocal(input: LocalGenerateInput): GenerationResult {
  if (isBusiness(input.profile)) return generateBusinessLocal(input, input.profile.business);
  const seeds = LOCAL_BANK.filter((s) => s.pillar === input.pillarSlug);
  // o tema primeiro; se os assuntos dele já foram usados, um assunto de outro tema (nunca repetir assunto bloqueado)
  const pool = [...seeds, ...LOCAL_BANK.filter((s) => s.pillar !== input.pillarSlug)];
  const ctas = rotateCtas(input.recent);
  const candidates: { draft: ContentDraft; report: RepetitionReport; seed: BankSeed }[] = [];
  const firstRejected: RepetitionReport[] = [];

  for (const seed of pool) {
    for (const cta of ctas) {
      const draft = finalizeDraft(fromSeed(seed, input, cta), input.profile);
      const report = checkRepetition(fingerprintsFor(draft), input.recent);
      if (!report.repeated) {
        const res = done(draft, report, candidates.length + 1, firstRejected);
        if (seeds.length && seed.pillar !== input.pillarSlug) res.notices.push("Os assuntos offline deste tema já foram usados; usei um assunto de outro tema — peça um roteiro novo ao assistente se preferir.");
        return res;
      }
      candidates.push({ draft, report, seed });
      if (firstRejected.length === 0) firstRejected.push(report);
    }
  }
  // Everything was used recently: prefer a repeated hook/CTA over a repeated topic, and say so.
  const topicHit = (r: RepetitionReport) => (r.hits.some((h) => h.type === "topic") ? 1 : 0);
  const best = candidates.sort((a, b) => topicHit(a.report) - topicHit(b.report) || a.report.hits.length - b.report.hits.length)[0]!;
  const res = done(best.draft, best.report, candidates.length, firstRejected);
  res.notices.push("Todo o banco offline foi usado recentemente; revise o texto antes de gravar.");
  return res;
}

function generateBusinessLocal(input: LocalGenerateInput, strategy: NonNullable<LocalGenerateInput["profile"]["business"]>): GenerationResult {
  const candidates: { draft: ContentDraft; report: RepetitionReport }[] = [];
  const rejected: RepetitionReport[] = [];
  const total = businessVariants(strategy);
  const start = input.recent.length; // rotate the starting combination as history grows
  for (let i = 0; i < total; i++) {
    const parsed = parseDraft(businessDraft(strategy, input.pillarSlug, input.pillarName, input.format, start + i, input.eventText));
    if (!parsed.ok) throw new Error(`Estratégia do perfil gerou roteiro inválido: ${parsed.errors.join("; ")}`);
    const draft = finalizeDraft(parsed.draft, input.profile);
    const report = checkRepetition(fingerprintsFor(draft), input.recent);
    if (!report.repeated) return done(draft, report, i + 1, rejected);
    candidates.push({ draft, report });
    if (rejected.length === 0) rejected.push(report);
  }
  const best = candidates.sort((a, b) => a.report.hits.length - b.report.hits.length)[0]!;
  const res = done(best.draft, best.report, candidates.length, rejected);
  res.notices.push("Todas as combinações de dor e objeção deste perfil foram usadas recentemente; cadastre novas dores/objeções.");
  return res;
}

function done(draft: ContentDraft, report: RepetitionReport, attempts: number, rejected: RepetitionReport[]): GenerationResult {
  const avoided = rejected.flatMap(describeAvoidance);
  return { draft, report, notices: [...new Set(avoided)], meta: { source: "local", model: "local-bank-v1", prompt_version: PROMPT_VERSION, attempts, avoided } };
}

function rotateCtas(recent: readonly Fingerprint[]): string[] {
  const used = recent.filter((f) => f.type === "cta").map((f) => f.value);
  const count = (c: string) => used.filter((u) => c.toLowerCase().includes(u.slice(0, 12))).length;
  return [...LOCAL_CTAS].sort((a, b) => count(a) - count(b));
}

function fromSeed(seed: BankSeed, input: LocalGenerateInput, cta: string): ContentDraft {
  const event = input.eventText?.trim() || null;
  const e = event ? `Hoje aconteceu isso: ${event}` : seed.e;
  const isThought = input.format === "thought";
  const script = isThought ? seed.key_phrase : [seed.hooks[0], e, seed.mas, seed.por_isso, cta].join("\n\n");
  const hashtags = PILLAR_HASHTAGS[seed.pillar] ?? ["#vidareal"];
  const captionBase = `${seed.key_phrase}\n\n${cta}`;
  const draft: ContentDraft = {
    title: event ? `Hoje: ${event.slice(0, 60)}` : capitalize(seed.topic).slice(0, 120),
    pillar: input.pillarName,
    format: input.format,
    duration_seconds: isThought ? 12 : 60,
    structure: event ? "historia" : seed.structure,
    topic: event ? `${seed.topic} — a partir de: ${event}`.slice(0, 200) : seed.topic,
    key_phrase: seed.key_phrase,
    metaphor: seed.metaphor,
    hook_options: [...seed.hooks],
    narrative: { e, mas: seed.mas, por_isso: seed.por_isso },
    script,
    screen_text: seed.screen_text,
    cta,
    caption: { instagram: captionBase, tiktok: `${seed.hooks[0]} ${cta}`, facebook: `${e}\n\n${seed.mas}\n\n${seed.por_isso}`, youtube_shorts: `${seed.hooks[0]}\n\n${seed.key_phrase}` },
    hashtags,
    recording_suggestions: seed.scenes.map((scene) => ({ scene, duration_seconds: 3, location_hint: "luz natural, celular na vertical" })),
    versions: isThought ? [] : [{ duration_seconds: 15, script: `${seed.hooks[0]}\n\n${seed.key_phrase}` }, { duration_seconds: 30, script: `${seed.hooks[0]}\n\n${seed.mas}\n\n${seed.por_isso}` }],
  };
  const parsed = parseDraft(draft);
  if (!parsed.ok) throw new Error(`Banco local inválido: ${parsed.errors.join("; ")}`);
  return parsed.draft;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
