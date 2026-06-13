// Server-side Gemini client (Next.js API routes). Falls back gracefully when no key.
// The key/model may come from the request (user's own key, via header) or server env.
const DEFAULT_MODEL = 'gemini-2.5-flash';
// Tried in order when a model 404s (varia por projeto/região). Mantém o app
// funcionando independentemente de quais modelos a chave do usuário libera.
const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

export interface GeminiOpts { temperature?: number; key?: string; model?: string }

// Resolve the effective key: request-provided wins, else server env.
export function resolveGeminiKey(key?: string) {
  return (key || process.env.GEMINI_API_KEY || '').trim();
}

// Resolve the model. The gemini-1.5-* family was retired on v1beta (404 on
// generateContent), so anything 1.5 is auto-upgraded to the current default —
// this also rescues users who saved "gemini-1.5-flash" in their config.
export function resolveGeminiModel(model?: string) {
  const m = (model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!m || /gemini-1\.5/i.test(m)) return DEFAULT_MODEL;
  return m;
}

export function geminiEnabled(key?: string) {
  return Boolean(resolveGeminiKey(key));
}

export async function geminiComplete(prompt: string, opts: GeminiOpts = {}): Promise<string> {
  const { temperature = 0.95 } = opts;
  const key = resolveGeminiKey(opts.key);
  if (!key) throw new Error('GEMINI_API_KEY missing');

  const primary = resolveGeminiModel(opts.model);
  const candidates = [primary, ...MODEL_FALLBACKS.filter((m) => m !== primary)];
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  });

  let lastErr = 'Gemini: nenhuma resposta';
  for (const model of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (res.ok) {
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }
    lastErr = `Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
    // só tenta o próximo modelo quando o atual não existe/não é suportado (404)
    if (res.status !== 404) throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

export async function geminiJSON(prompt: string, opts?: GeminiOpts): Promise<any> {
  return parseLooseJSON(await geminiComplete(prompt, opts));
}

// Pull the user's Gemini key/model out of an incoming request's headers.
export function geminiOptsFromReq(req: Request): GeminiOpts {
  return {
    key: req.headers.get('x-gemini-key')?.trim() || undefined,
    model: req.headers.get('x-gemini-model')?.trim() || undefined,
  };
}

export function parseLooseJSON(raw: string): any {
  if (!raw) throw new Error('empty completion');
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}
