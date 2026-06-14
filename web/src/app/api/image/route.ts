import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gera uma imagem GRÁTIS (sem chave) a partir de uma descrição, via Pollinations.ai.
// Retorna data URL (base64) pra ser desenhada no canvas sem "sujar" (export-safe).
// Em vez de cair num banco de fotos aleatório (que dava imagens sem relação),
// tenta o Pollinations algumas vezes; falhando tudo, deixa o placeholder neutro.

// Tira o "lixo" do começo da legenda (foto do/da, print da conversa, etc.) e
// deixa só a descrição visual — melhora MUITO a relevância da imagem gerada.
function cleanDesc(raw: string): string {
  let d = raw.replace(/\s+/g, ' ').trim();
  d = d.replace(/^(uma?\s+)?(foto|print|imagem|captura(\s+de\s+tela)?|screenshot|selfie|figura)\s+(d[aoe]s?|de|com|mostrando|que mostra)?\s*/i, '');
  d = d.replace(/^(da|do|de|dos|das)\s+/i, '');
  return d.trim() || raw.trim();
}

// Detecta resposta de imagem real (Pollinations devolve JSON quando a fila está
// cheia / exige pagamento — isso NÃO é imagem).
async function fetchImage(url: string, ms: number): Promise<string | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null; // veio JSON de erro/fila cheia
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000) return null; // pequeno demais p/ ser foto
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch { return null; } finally { clearTimeout(to); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Geração de imagem pela API do Gemini (chave do usuário) — MUITO mais confiável
// que o Pollinations. Tenta os modelos de imagem disponíveis e devolve o data URL.
const GEMINI_IMG_MODELS = [
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
];
async function geminiImage(prompt: string, key: string): Promise<string | null> {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  for (const model of GEMINI_IMG_MODELS) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
      if (!r.ok) { clearTimeout(to); if (r.status === 404 || r.status === 400) continue; return null; }
      const data = await r.json(); clearTimeout(to);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        const inline = p.inlineData || p.inline_data;
        if (inline?.data) return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
      }
    } catch { clearTimeout(to); /* tenta o próximo modelo */ }
  }
  return null;
}

export async function POST(req: Request) {
  const { prompt = '', keywords = '' } = await req.json().catch(() => ({}));
  const raw = String(prompt || keywords).trim().slice(0, 200);
  if (!raw) return NextResponse.json({ error: 'descrição vazia' }, { status: 400 });

  const desc = cleanDesc(raw);
  const geminiKey = req.headers.get('x-gemini-key')?.trim() || process.env.GEMINI_API_KEY;

  // 1) Gemini (chave do usuário) — caminho confiável
  if (geminiKey) {
    const gPrompt = `Generate a realistic, candid smartphone photo (no text, no watermark, photorealistic) showing: ${desc}`;
    const dataUrl = await geminiImage(gPrompt, geminiKey).catch(() => null);
    if (dataUrl) return NextResponse.json({ dataUrl, source: 'gemini' });
  }

  // 2) Pollinations grátis (sem chave) — tenta algumas vezes (fila costuma liberar)
  const aiPrompt = `realistic candid smartphone photo, ${desc}, natural lighting, high detail, no text, no watermark`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = Math.floor(Math.random() * 1e6);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=720&height=540&nologo=true&seed=${seed}`;
    const dataUrl = await fetchImage(url, 45000);
    if (dataUrl) return NextResponse.json({ dataUrl, source: 'pollinations' });
    if (attempt < 2) await sleep(1500 * (attempt + 1)); // 1.5s, 3s
  }
  // sem imagem relevante → o cliente mantém o card neutro (melhor que foto aleatória)
  return NextResponse.json({ error: 'a geração de imagem está ocupada, tente de novo em instantes' }, { status: 502 });
}
