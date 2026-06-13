// Server-side Gemini client (Next.js API routes). Falls back gracefully when no key.
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function geminiComplete(prompt: string, { temperature = 0.95 } = {}): Promise<string> {
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
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function geminiJSON(prompt: string, opts?: any): Promise<any> {
  return parseLooseJSON(await geminiComplete(prompt, opts));
}

export function parseLooseJSON(raw: string): any {
  if (!raw) throw new Error('empty completion');
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}
