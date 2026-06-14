// Contador de uso do TTS (caracteres por mês), pra acompanhar o free tier do Google.
// Free tier do Google Cloud TTS: 1.000.000 chars/mês p/ Chirp3-HD e OUTRO 1.000.000
// p/ Neural2 (cobrados separados). gTTS grátis e o placeholder não contam.
// Persistido em localStorage (modo Vercel/same-origin não tem banco).

export type TtsEngine = 'chirp' | 'neural2' | 'free' | 'mock';

export const FREE_TIER: Record<'chirp' | 'neural2', number> = {
  chirp: 1_000_000,
  neural2: 1_000_000,
};
// Preço por 1M de chars acima do free tier (em USD) — só pra estimar o custo.
export const PRICE_PER_M: Record<'chirp' | 'neural2', number> = {
  chirp: 30,
  neural2: 16,
};

const LS_KEY = 'cvs-tts-usage';

// Mês corrente "YYYY-MM" no fuso local do navegador.
export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type Store = Record<string, { chirp: number; neural2: number }>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

function write(store: Store) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* cota cheia — ignora */ }
}

// Soma `chars` ao engine no mês atual. Só chirp/neural2 contam (são os cobrados).
export function recordTtsUsage(engine: TtsEngine | undefined, chars: number | undefined) {
  if ((engine !== 'chirp' && engine !== 'neural2') || !chars || chars <= 0) return;
  const store = read();
  const month = currentMonth();
  const row = store[month] || { chirp: 0, neural2: 0 };
  row[engine] += chars;
  store[month] = row;
  // mantém só os últimos 6 meses pra não crescer pra sempre
  const months = Object.keys(store).sort();
  while (months.length > 6) delete store[months.shift() as string];
  write(store);
}

export type TtsUsage = {
  month: string;
  chirp: number;
  neural2: number;
  free: typeof FREE_TIER;
  // custo estimado (USD) só do que passou do free tier
  estimatedUsd: number;
};

export function getTtsUsage(): TtsUsage {
  const month = currentMonth();
  const row = read()[month] || { chirp: 0, neural2: 0 };
  const overC = Math.max(0, row.chirp - FREE_TIER.chirp);
  const overN = Math.max(0, row.neural2 - FREE_TIER.neural2);
  const estimatedUsd = (overC / 1_000_000) * PRICE_PER_M.chirp + (overN / 1_000_000) * PRICE_PER_M.neural2;
  return { month, chirp: row.chirp, neural2: row.neural2, free: FREE_TIER, estimatedUsd };
}
