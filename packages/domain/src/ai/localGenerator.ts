import { PROMPT_VERSION, parseDraft, type ContentDraft, type GenerationMeta } from "./contract";
import { finalizeDraft, type CreatorProfile } from "./prompt";
import { LOCAL_BANK, LOCAL_CTAS, PILLAR_HASHTAGS, type BankSeed } from "./localBank";
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
  const seeds = LOCAL_BANK.filter((s) => s.pillar === input.pillarSlug);
  const pool = seeds.length > 0 ? seeds : LOCAL_BANK;
  const ctas = rotateCtas(input.recent);
  const candidates: { draft: ContentDraft; report: RepetitionReport }[] = [];
  const firstRejected: RepetitionReport[] = [];

  for (const seed of pool) {
    for (const cta of ctas) {
      const draft = finalizeDraft(fromSeed(seed, input, cta), input.profile);
      const report = checkRepetition(fingerprintsFor(draft), input.recent);
      if (!report.repeated) return done(draft, report, candidates.length + 1, firstRejected);
      candidates.push({ draft, report });
      if (firstRejected.length === 0) firstRejected.push(report);
    }
  }
  // Everything was used recently: return the least repetitive and say so.
  const best = candidates.sort((a, b) => a.report.hits.length - b.report.hits.length)[0]!;
  const res = done(best.draft, best.report, candidates.length, firstRejected);
  res.notices.push("Todo o banco offline deste pilar foi usado recentemente; revise o texto antes de gravar.");
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
