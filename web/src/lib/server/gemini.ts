// Server-side Gemini client (Next.js API routes). Falls back gracefully when no key.
// The key/model may come from the request (user's own key, via header) or server env.
const DEFAULT_MODEL = 'gemini-1.5-flash';

export interface GeminiOpts { temperature?: number; key?: string; model?: string }

// Resolve the effective key: request-provided wins, else server env.
export function resolveGeminiKey(key?: string) {
  return (key || process.env.GEMINI_API_KEY || '').trim();
}

export function geminiEnabled(key?: string) {
  return Boolean(resolveGeminiKey(key));
}

export async function geminiComplete(prompt: string, opts: GeminiOpts = {}): Promise<string> {
  const { temperature = 0.95 } = opts;
  const key = resolveGeminiKey(opts.key);
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const model = (opts.model || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
