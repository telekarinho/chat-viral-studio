import { z } from "zod";
import { DirectionSchema } from "./direction";

// mensagens de validação em português (o criador e o assistente leem os erros)
z.config(z.locales.pt());

export const PROMPT_VERSION = "content-v1.3.0";

export const NARRATIVE_STRUCTURES = ["confissao", "pergunta", "contraste", "historia", "conselho", "observacao"] as const;
export type NarrativeStructure = (typeof NARRATIVE_STRUCTURES)[number];

export const PLATFORMS = ["instagram", "tiktok", "facebook", "youtube_shorts"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube_shorts: "YouTube Shorts",
};

const text = (min = 1, max = 2000) => z.string().trim().min(min).max(max);

/** Contract v1 — docs/AI.md. Every generation (OpenAI or local) must parse through this. */
export const ContentDraftSchema = z.object({
  title: text(3, 120),
  pillar: text(2, 60),
  format: z.enum(["thought", "main_video", "story", "broll"]),
  duration_seconds: z.number().int().min(3).max(180),
  structure: z.enum(NARRATIVE_STRUCTURES),
  topic: text(3, 200),
  key_phrase: text(3, 300),
  metaphor: z.string().trim().max(200),
  hook_options: z.array(text(3, 200)).length(3),
  narrative: z.object({ e: text(3, 800), mas: text(3, 800), por_isso: text(3, 800) }),
  script: text(10, 4000),
  screen_text: z.string().trim().max(120),
  cta: text(2, 200),
  caption: z.object({
    instagram: text(3, 2200),
    tiktok: text(3, 2200),
    facebook: text(3, 5000),
    youtube_shorts: text(3, 5000),
  }),
  hashtags: z.array(z.string().trim().regex(/^#[\p{L}\p{N}_]+$/u)).min(1).max(15),
  recording_suggestions: z
    .array(z.object({ scene: text(2, 200), duration_seconds: z.number().int().min(1).max(60), location_hint: z.string().trim().max(200) }))
    .min(1)
    .max(8),
  versions: z.array(z.object({ duration_seconds: z.number().int().min(5).max(180), script: text(5, 4000) })).max(4),
  /** direção completa (takes, texto na tela, música, capa, publicação, teste A/B) — opcional */
  direcao: DirectionSchema.optional(),
});

export type ContentDraft = z.infer<typeof ContentDraftSchema>;

export const GenerateRequestSchema = z.object({
  workspace_id: z.uuid(),
  content_item_id: z.uuid().nullable(),
  format: z.enum(["thought", "main_video"]),
  pillar_slug: text(2, 60),
  event_text: z.string().trim().max(1500).nullable(),
  /** project briefing from the studio (mode, filmed SKU, ice-cream source, recipe) — optional */
  brief: z.string().trim().max(1500).nullable().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export interface GenerationMeta {
  source: "openai" | "gemini" | "local";
  model: string;
  prompt_version: string;
  attempts: number;
  avoided: string[];
}

export type ParseResult = { ok: true; draft: ContentDraft } | { ok: false; errors: string[] };

export function parseDraft(input: unknown): ParseResult {
  const r = ContentDraftSchema.safeParse(input);
  if (r.success) return { ok: true, draft: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

const STRIP_KEYS = new Set(["$schema", "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "pattern", "format"]);

/**
 * JSON Schema for OpenAI Structured Outputs (strict). Length/range keywords are stripped
 * because strict mode does not accept all of them; Zod re-validates them after the call.
 */
export function contentDraftJsonSchema(): Record<string, unknown> {
  // a direção completa vem do assistente (conector); a geração automática segue o contrato básico
  const raw = z.toJSONSchema(ContentDraftSchema.omit({ direcao: true }), { target: "draft-7" }) as Record<string, unknown>;
  return strip(raw) as Record<string, unknown>;
}

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = strip(v);
    }
    if (out.type === "object") out.additionalProperties = false;
    return out;
  }
  return node;
}

type JsonNode = { type?: string | string[]; properties?: Record<string, JsonNode>; items?: JsonNode; required?: string[]; enum?: unknown[]; anyOf?: JsonNode[];
  minLength?: number; maxLength?: number; minItems?: number; maxItems?: number; minimum?: number; maximum?: number; pattern?: string; default?: unknown };

/**
 * Todos os limites do roteiro (inclusive "direcao"), tirados do próprio contrato — a documentação nunca
 * diverge da validação. Uma linha por campo: caminho, tipo, limites, valores aceitos e padrão.
 */
export function contractLimits(): string[] {
  const root = z.toJSONSchema(ContentDraftSchema, { target: "draft-7", io: "input" }) as JsonNode;
  const out: string[] = [];
  const walk = (n: JsonNode, path: string, required: boolean) => {
    const alt = n.anyOf?.find((x) => x.type !== "null");
    const nullable = Boolean(n.anyOf?.some((x) => x.type === "null"));
    const node = alt ? { ...alt, default: n.default ?? alt.default } : n;
    const t = Array.isArray(node.type) ? node.type.join("|") : node.type ?? "?";
    const lim: string[] = [];
    if (node.minLength !== undefined || node.maxLength !== undefined) lim.push(`${node.minLength ?? 0}–${node.maxLength ?? "∞"} caracteres`);
    if (node.minItems !== undefined || node.maxItems !== undefined) lim.push(`${node.minItems ?? 0}–${node.maxItems ?? "∞"} itens`);
    if (node.minimum !== undefined || node.maximum !== undefined) lim.push(`${node.minimum ?? "-∞"} a ${node.maximum ?? "∞"}`);
    if (node.enum) lim.push(`um de: ${node.enum.join(" | ")}`);
    if (node.pattern) lim.push(`formato ${node.pattern}`);
    if (path && (t !== "object" || !node.properties)) {
      const flags = [required ? "obrigatório" : "opcional", nullable ? "pode ser null" : "", node.default !== undefined ? `padrão ${JSON.stringify(node.default)}` : ""].filter(Boolean).join(", ");
      out.push(`${path}: ${t}${lim.length ? ` (${lim.join("; ")})` : ""} — ${flags}`);
    } else if (path) out.push(`${path}: objeto — ${required ? "obrigatório" : "opcional"}${nullable ? ", pode ser null" : ""}`);
    if (node.properties) for (const [k, v] of Object.entries(node.properties)) walk(v, path ? `${path}.${k}` : k, node.required?.includes(k) ?? false);
    if (node.items) walk(node.items, `${path}[]`, true);
  };
  walk(root, "", true);
  return out;
}
