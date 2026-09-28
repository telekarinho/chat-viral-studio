import { PROMPT_VERSION, parseDraft, type ContentDraft } from "./contract";
import { buildPrompt, finalizeDraft, type PromptInput } from "./prompt";

/**
 * "Gerar com meu ChatGPT/Claude": consumer subscriptions don't grant API access to third-party
 * apps, so the user copies this prompt into their own chat app and pastes the JSON answer back.
 */
export function buildManualPrompt(input: PromptInput): string {
  const { system, user } = buildPrompt(input);
  const example = {
    title: "...", pillar: input.pillarName, format: input.format, duration_seconds: input.format === "thought" ? 12 : 60,
    structure: "confissao | pergunta | contraste | historia | conselho | observacao",
    topic: "...", key_phrase: "...", metaphor: "(pode ser vazio)", hook_options: ["gancho 1", "gancho 2", "gancho 3"],
    narrative: { e: "...", mas: "...", por_isso: "..." }, script: "...", screen_text: "...", cta: "...",
    caption: { instagram: "...", tiktok: "...", facebook: "...", youtube_shorts: "..." },
    hashtags: ["#exemplo"], recording_suggestions: [{ scene: "...", duration_seconds: 3, location_hint: "..." }],
    versions: [{ duration_seconds: 30, script: "..." }],
  };
  return `${system}\n\n${user}\n\nResponda APENAS com um bloco JSON neste formato (sem comentários):\n${JSON.stringify(example, null, 2)}`;
}

export type ManualParse = { ok: true; draft: ContentDraft; promptVersion: string } | { ok: false; errors: string[] };

export function parseManualResponse(pasted: string, profile: Parameters<typeof finalizeDraft>[1]): ManualParse {
  const json = extractJson(pasted);
  if (!json) return { ok: false, errors: ["Não encontrei um JSON na resposta colada. Peça ao assistente para responder só com o JSON."] };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["O JSON colado está incompleto ou quebrado."] };
  }
  const parsed = parseDraft(data);
  if (!parsed.ok) return parsed;
  return { ok: true, draft: finalizeDraft(parsed.draft, profile), promptVersion: `${PROMPT_VERSION}+manual` };
}

function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : null;
}
