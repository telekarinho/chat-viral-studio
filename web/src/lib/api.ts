import type { Story, GenerateParams, ViralScore } from './types';
import { configHeaders } from './config';

// When NEXT_PUBLIC_API_URL is set → use the standalone Express backend (FFmpeg MP4 + SQLite).
// When empty → same-origin Next.js API routes (Vercel single-project mode): generation/TTS work,
// MP4 transcode falls back to WebM, and the library is stored in localStorage.
const API = process.env.NEXT_PUBLIC_API_URL || '';
const SAME_ORIGIN = API === '';

async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...configHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`);
  return data as T;
}

// ── localStorage-backed projects (Vercel mode) ───────────────────
const LS_INDEX = 'cvs-projects';
function lsIndex(): any[] { try { return JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch { return []; } }
function lsSaveIndex(rows: any[]) { localStorage.setItem(LS_INDEX, JSON.stringify(rows)); }

const localProjects = {
  list: () => ({ projects: lsIndex().sort((a, b) => b.updatedAt - a.updatedAt) }),
  get: (id: string) => {
    const raw = localStorage.getItem(`cvs-project-${id}`);
    return { project: raw ? JSON.parse(raw) : null };
  },
  save: (id: string, payload: any) => {
    const now = Date.now();
    const rows = lsIndex();
    const existing = rows.find((r) => r.id === id);
    const meta = {
      id, title: payload.title || payload.story?.title || 'Sem título',
      status: payload.status || 'draft', duration: payload.duration || 0,
      format: payload.format || '1080x1920', thumbnail: payload.thumbnail || null,
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    // tira mídia pesada (data: URLs) p/ não estourar a cota do localStorage
    const story = payload.story ? {
      ...payload.story,
      messages: (payload.story.messages || []).map((m: any) => {
        const mm = { ...m };
        if (typeof mm.imageUrl === 'string' && mm.imageUrl.startsWith('data:')) delete mm.imageUrl;
        if (typeof mm.audioUrl === 'string' && mm.audioUrl.startsWith('data:')) delete mm.audioUrl;
        return mm;
      }),
    } : payload.story;
    try {
      lsSaveIndex([...rows.filter((r) => r.id !== id), meta]);
      localStorage.setItem(`cvs-project-${id}`, JSON.stringify({ ...meta, story }));
    } catch { /* cota cheia — não persiste, mas não quebra o app */ }
    return { ok: true, id };
  },
  remove: (id: string) => {
    lsSaveIndex(lsIndex().filter((r) => r.id !== id));
    localStorage.removeItem(`cvs-project-${id}`);
    return { ok: true };
  },
};

export const api = {
  base: API,
  sameOrigin: SAME_ORIGIN,

  health: () => fetch(`${API}/api/health`).then((r) => r.json()).catch(() => ({ ok: false })),

  generate: (params: GenerateParams) =>
    jpost<{ story: Story; source: string }>('/api/generate', params),

  textToChat: (text: string, params: Partial<GenerateParams>) =>
    jpost<{ story: Story; source: string }>('/api/text-to-chat', { text, ...params }),

  viralScore: (story: Story) =>
    jpost<{ viralScore: ViralScore }>('/api/viral-score', { story }),

  // gera uma foto grátis (IA Pollinations, fallback banco de imagens) → data URL
  genImage: (prompt: string) =>
    jpost<{ dataUrl: string | null; source?: string; reason?: string }>('/api/image', { prompt }),

  // gera o roteiro da locução do narrador a partir das mensagens da história
  narration: (story: Story) =>
    jpost<{ narration: string; source: string }>('/api/narration', { story }),

  voices: () => fetch(`${API}/api/voices`).then((r) => r.json()),

  tts: (text: string, voice: string, emotion: string, speed = 1, pitch = 0) =>
    jpost<{ audioContent: string; mime: string; mock?: boolean; source?: string }>('/api/tts', { text, voice, emotion, speed, pitch }),

  // MP4 transcode needs the Express+FFmpeg backend. In same-origin mode we skip it
  // and the exporter falls back to a downloadable WebM (aceito por TikTok/Reels).
  render: async (blob: Blob, format: string): Promise<{ url: string }> => {
    if (SAME_ORIGIN) throw new Error('MP4 transcode requires the standalone backend (NEXT_PUBLIC_API_URL).');
    const fd = new FormData();
    fd.append('video', blob, 'recording.webm');
    fd.append('format', format);
    const res = await fetch(`${API}/api/render`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return { url: `${API}${data.url}` };
  },

  // Projects: backend SQLite when available, else localStorage.
  listProjects: () =>
    SAME_ORIGIN ? Promise.resolve(localProjects.list()) : fetch(`${API}/api/projects`).then((r) => r.json()),
  getProject: (id: string) =>
    SAME_ORIGIN ? Promise.resolve(localProjects.get(id)) : fetch(`${API}/api/projects/${id}`).then((r) => r.json()),
  saveProject: (id: string, payload: unknown) =>
    SAME_ORIGIN
      ? Promise.resolve(localProjects.save(id, payload))
      : fetch(`${API}/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json()),
  deleteProject: (id: string) =>
    SAME_ORIGIN ? Promise.resolve(localProjects.remove(id)) : fetch(`${API}/api/projects/${id}`, { method: 'DELETE' }).then((r) => r.json()),
};
