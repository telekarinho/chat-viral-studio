// App configuration kept in the browser (localStorage) so each user plugs in
// their own AI keys without touching Vercel env vars. Sent to our own API routes
// via headers; routes fall back to server env when a key is absent.
// build: redeploy check 2026-06-14
export interface AppConfig {
  geminiKey: string;
  geminiModel: string;   // optional, defaults server-side
  googleTtsKey: string;
}

const KEY = 'cvs-config';
const DEFAULTS: AppConfig = { geminiKey: '', geminiModel: '', googleTtsKey: '' };

export function getConfig(): AppConfig {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...getConfig(), ...patch };
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// Headers attached to AI-backed API calls so the user's own keys are used.
export function configHeaders(): Record<string, string> {
  const c = getConfig();
  const h: Record<string, string> = {};
  if (c.geminiKey.trim()) h['x-gemini-key'] = c.geminiKey.trim();
  if (c.geminiModel.trim()) h['x-gemini-model'] = c.geminiModel.trim();
  if (c.googleTtsKey.trim()) h['x-google-tts-key'] = c.googleTtsKey.trim();
  return h;
}
