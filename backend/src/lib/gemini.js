// Thin Gemini (Generative Language API) client using global fetch (Node 18+).
// Falls back to a local mock when GEMINI_API_KEY is absent so the app runs offline.

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Calls Gemini and returns the raw text completion. */
export async function geminiComplete(prompt, { temperature = 0.95 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** Calls Gemini and parses JSON, tolerating accidental markdown fences. */
export async function geminiJSON(prompt, opts) {
  const raw = await geminiComplete(prompt, opts);
  return parseLooseJSON(raw);
}

export function parseLooseJSON(raw) {
  if (!raw) throw new Error('empty completion');
  let s = raw.trim();
  // strip ```json ... ``` fences if present
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // grab the outermost { ... }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}
