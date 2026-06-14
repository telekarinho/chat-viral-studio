import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Vozes femininas = Chirp3-HD (as mais humanas/naturais do Google, bem melhores
// que as Neural2 que soavam robóticas). Chirp3-HD NÃO aceita pitch/speakingRate/SSML
// → mandamos sem esses params e a emoção vem da prosódia natural da própria voz.
// Cada voz Chirp tem um `fallback` Neural2: se a Chirp falhar, usamos a Neural2 (com
// pitch/rate) ANTES de cair no TTS grátis — no pior caso fica igual a antes, nunca pior.
// Vozes masculinas/cômicas seguem em Neural2 (aceitam pitch/rate p/ dar caráter).
type VoiceDef = { name: string; pitch: number; rate: number; label: string; engine?: 'neural2' | 'chirp'; fallback?: string };
const VOICES: Record<string, VoiceDef> = {
  narrador_masc: { name: 'pt-BR-Neural2-B', pitch: -1.5, rate: 1.0, label: 'Narrador masculino' },
  narradora_fem: { name: 'pt-BR-Chirp3-HD-Aoede', pitch: 0, rate: 1.0, label: 'Narradora feminina', engine: 'chirp', fallback: 'pt-BR-Neural2-A' },
  voz_engracada: { name: 'pt-BR-Neural2-C', pitch: 4, rate: 1.12, label: 'Voz engraçada' },
  voz_suspense: { name: 'pt-BR-Neural2-B', pitch: -3, rate: 0.88, label: 'Voz suspense' },
  voz_drama: { name: 'pt-BR-Chirp3-HD-Kore', pitch: -1, rate: 0.9, label: 'Voz dramática leve', engine: 'chirp', fallback: 'pt-BR-Neural2-A' },
  voz_tiktok: { name: 'pt-BR-Neural2-C', pitch: 1.5, rate: 1.28, label: 'Voz acelerada TikTok' },
  voz_calma: { name: 'pt-BR-Chirp3-HD-Kore', pitch: -1, rate: 0.93, label: 'Voz calma', engine: 'chirp', fallback: 'pt-BR-Neural2-A' },
  voz_jovem: { name: 'pt-BR-Chirp3-HD-Leda', pitch: 2.5, rate: 1.05, label: 'Voz jovem', engine: 'chirp', fallback: 'pt-BR-Neural2-C' },
};
// Emoção mais marcada (pitch em semitons, rate como delta) p/ soar humano, não robótico.
const EMOTION: Record<string, { pitch: number; rate: number }> = {
  raiva: { pitch: 3, rate: 0.12 }, alegria: { pitch: 4, rate: 0.1 }, medo: { pitch: -3, rate: -0.06 },
  surpresa: { pitch: 5, rate: 0.14 }, tristeza: { pitch: -4, rate: -0.14 }, ironia: { pitch: 1.5, rate: -0.04 },
  neutro: { pitch: 0, rate: 0 },
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Abreviações de chat → forma por extenso, pra a voz ler natural ("vc" → "você").
const ABBREV: Record<string, string> = {
  vc: 'você', vcs: 'vocês', voce: 'você', 'voce^': 'você',
  q: 'que', qnd: 'quando', qdo: 'quando', qto: 'quanto', qse: 'quase',
  pq: 'porque', pqp: 'puta que pariu', pf: 'por favor', pfv: 'por favor',
  pra: 'pra', pro: 'pro', praque: 'pra que',
  tb: 'também', tbm: 'também', tmb: 'também', tbem: 'também',
  td: 'tudo', tds: 'todos', tdo: 'tudo',
  mt: 'muito', mto: 'muito', mta: 'muita', mtas: 'muitas', mts: 'muitos',
  blz: 'beleza', vlw: 'valeu', flw: 'falou', slk: 'sla', sla: 'sei lá',
  msg: 'mensagem', msgs: 'mensagens', vdd: 'verdade', vdde: 'verdade',
  dnv: 'de novo', dps: 'depois', agr: 'agora', hj: 'hoje', amnh: 'amanhã',
  cmg: 'comigo', ctg: 'contigo', vce: 'você',
  n: 'não', naum: 'não', nao: 'não', ñ: 'não',
  eh: 'é', neh: 'né', ne: 'né',
  fds: 'fim de semana', gnt: 'gente', glr: 'galera', mds: 'meu deus',
  obg: 'obrigado', dsclp: 'desculpa', flr: 'falar', fzr: 'fazer',
  qm: 'quem', cd: 'cadê', oq: 'o que', pqe: 'porque',
};

// expande abreviações (palavra inteira, ignora caixa) e some com "kkk"/"rsrs"
function expandAbbrev(text: string): string {
  let t = text.replace(/\bk{2,}\b/gi, '').replace(/\b(?:ha){2,}\b/gi, '').replace(/\b(?:rs){2,}\b/gi, '');
  t = t.replace(/[a-zA-ZÀ-ÿ]+/g, (w) => {
    const low = w.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ABBREV, low) ? ABBREV[low] : w;
  });
  return t.replace(/\s{2,}/g, ' ').trim();
}

// Remove emojis/símbolos/pictogramas pra a voz NÃO ler "carinha sorridente".
// (As emoções continuam sendo inferidas do texto ORIGINAL, com os emojis.)
function stripForSpeech(t: string): string {
  return (t || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{2640}\u{2642}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Quando a mensagem vem como "neutro", inferimos a emoção pelo texto para a
// narração nunca soar plana (CAPS, pontuação, gírias e emojis).
function inferEmotion(text: string): string {
  const t = (text || '').trim();
  if (!t) return 'neutro';
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const isShout = letters.length >= 3 && letters === letters.toUpperCase();
  if (/[😱😨😰😥😓]|que medo|assust|socorro|n[aã]o acredito/i.test(t)) return 'medo';
  if (/[😡🤬😠]|raiva|[óo]dio|absurdo|como assim|que isso|me poupe/i.test(t) || isShout) return 'raiva';
  if (/[😢😭]|triste|chor|magoad|d[oó]i/i.test(t)) return 'tristeza';
  if (/[😏🙄]|sei\.\.\.|aham|claro\b|imagina/i.test(t)) return 'ironia';
  if (/[😂🤣]|kk+|haha|rsrs|hilári|que engra/i.test(t)) return 'alegria';
  if (/[😍🥰❤️🥹]|te amo|maravilh|que lind|amei/i.test(t)) return 'alegria';
  if (/[😮😲😳🤯]|nossa|s[ée]rio\?|jura|\?\?\?+|!!!+|caramba|meu deus/i.test(t)) return 'surpresa';
  if (/!/.test(t)) return 'alegria';
  if (/\?/.test(t)) return 'surpresa';
  return 'neutro';
}

// Minimal near-silent MP3 placeholder so timing/sync works without a TTS key.
const BEEP =
  '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////8AAAA8TEFNRTMuMTAwAm' +
  '4AAAAAAAAAABSAJANIQgAAgAAAAnGMHkfQAAAAAAAAAAAAAAAAAAAA';

// ── TTS GRÁTIS sem chave (Google Translate TTS — o mesmo motor da lib gTTS) ──
// Voz pt-BR única, mas confiável e sem custo. Limite ~200 chars/req → quebramos
// o texto em pedaços e concatenamos os MP3 (frames MP3 colam direto).
function splitForTts(text: string, max = 190): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const out: string[] = [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
  let cur = '';
  for (const piece of sentences) {
    for (const word of piece.split(' ')) {
      const w = (cur ? cur + ' ' : '') + word;
      if (w.length > max) { if (cur) out.push(cur.trim()); cur = word.length > max ? word.slice(0, max) : word; }
      else cur = w;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function gTransTtsChunk(chunk: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&ttsspeed=1&q=${encodeURIComponent(chunk)}`;
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 200 && (r.headers.get('content-type') || '').includes('audio') ? buf : null;
  } catch { return null; } finally { clearTimeout(to); }
}

// Sintetiza com Google Cloud TTS. Chirp3-HD não aceita pitch/speakingRate → omitidos.
async function googleTts(
  key: string,
  voiceName: string,
  spoken: string,
  opts: { pitch: number; rate: number; chirp: boolean },
): Promise<string | null> {
  const audioConfig: Record<string, unknown> = { audioEncoding: 'MP3' };
  if (!opts.chirp) { audioConfig.pitch = opts.pitch; audioConfig.speakingRate = opts.rate; }
  const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text: spoken }, voice: { languageCode: 'pt-BR', name: voiceName }, audioConfig }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return data?.audioContent || null;
}

async function freeTts(text: string): Promise<string | null> {
  const parts = splitForTts(text);
  if (!parts.length) return null;
  // busca em paralelo (concorrência limitada) mas reassembla NA ORDEM
  const results: (Buffer | null)[] = new Array(parts.length).fill(null);
  let idx = 0;
  const worker = async () => {
    while (idx < parts.length) {
      const i = idx++;
      let b = await gTransTtsChunk(parts[i]);
      if (!b) b = await gTransTtsChunk(parts[i]); // 1 retry por pedaço
      results[i] = b;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, parts.length) }, worker));
  const bufs = results.filter((b): b is Buffer => !!b);
  if (!bufs.length) return null;
  return Buffer.concat(bufs).toString('base64');
}

export async function POST(req: Request) {
  const { text = '', voice = 'narradora_fem', emotion = 'neutro', speed = 1, pitch = 0 } = await req.json().catch(() => ({}));
  if (!text.trim()) return NextResponse.json({ error: 'texto vazio' }, { status: 400 });

  // texto realmente falado (sem emojis, abreviações por extenso); emoção do original
  const spoken = expandAbbrev(stripForSpeech(text));
  if (!spoken) return NextResponse.json({ audioContent: BEEP, mime: 'audio/mp3', mock: true });

  // user's own key (sent from the Settings page) wins, else server env
  const key = req.headers.get('x-google-tts-key')?.trim() || process.env.GOOGLE_TTS_API_KEY;
  const preset = VOICES[voice] || VOICES.narradora_fem;
  const effEmotion = (emotion && emotion !== 'neutro') ? emotion : inferEmotion(text);
  const emo = EMOTION[effEmotion] || EMOTION.neutro;
  const finalPitch = clamp(preset.pitch + emo.pitch + Number(pitch || 0), -20, 20);
  const finalRate = clamp(preset.rate + emo.rate + (Number(speed || 1) - 1), 0.25, 4);

  // 1) Google Cloud TTS quando há chave. Femininas em Chirp3-HD (mais humanas);
  //    se a Chirp falhar, tenta o fallback Neural2 (com pitch/rate) antes do grátis.
  if (key) {
    const isChirp = preset.engine === 'chirp';
    let audio = await googleTts(key, preset.name, spoken, { pitch: finalPitch, rate: finalRate, chirp: isChirp }).catch(() => null);
    if (!audio && preset.fallback) {
      audio = await googleTts(key, preset.fallback, spoken, { pitch: finalPitch, rate: finalRate, chirp: false }).catch(() => null);
    }
    if (audio) return NextResponse.json({ audioContent: audio, mime: 'audio/mp3', source: isChirp ? 'google-chirp' : 'google' });
  }

  // 2) TTS GRÁTIS sem chave (Google Translate) — voz real, sem custo
  const free = await freeTts(spoken).catch(() => null);
  if (free) return NextResponse.json({ audioContent: free, mime: 'audio/mpeg', source: 'gtrans' });

  // 3) último recurso: placeholder quase mudo (mantém a sincronia)
  return NextResponse.json({ audioContent: BEEP, mime: 'audio/mp3', mock: true });
}

export async function GET() {
  return NextResponse.json({ voices: Object.entries(VOICES).map(([id, v]) => ({ id, label: v.label })) });
}
