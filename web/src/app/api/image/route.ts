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
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
];
async function geminiImage(prompt: string, key: string): Promise<{ url: string | null; reason: string }> {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  let reason = 'sem resposta';
  for (const model of GEMINI_IMG_MODELS) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
      if (!r.ok) {
        clearTimeout(to);
        const txt = await r.text().catch(() => '');
        const msg = (txt.match(/"message":\s*"([^"]+)"/)?.[1] || '').slice(0, 120);
        reason = `Gemini ${r.status}: ${msg || 'erro'}`;
        if (r.status === 404 || r.status === 400) continue; // modelo indisponível p/ a chave → tenta o próximo
        return { url: null, reason };
      }
      const data = await r.json(); clearTimeout(to);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        const inline = p.inlineData || p.inline_data;
        if (inline?.data) return { url: `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`, reason: 'ok' };
      }
      reason = 'Gemini: resposta sem imagem';
    } catch (e: any) { clearTimeout(to); reason = `Gemini: ${e?.message || 'falha de rede'}`; }
  }
  return { url: null, reason };
}

export async function POST(req: Request) {
  const { prompt = '', keywords = '' } = await req.json().catch(() => ({}));
  const raw = String(prompt || keywords).trim().slice(0, 200);
  if (!raw) return NextResponse.json({ error: 'descrição vazia' }, { status: 400 });

  const desc = cleanDesc(raw);
  const geminiKey = req.headers.get('x-gemini-key')?.trim() || process.env.GEMINI_API_KEY;
  let reason = 'sem chave Gemini configurada';

  // 1) Gemini (chave do usuário) — caminho confiável
  if (geminiKey) {
    // prompt "à prova de recusa": cena fictícia, sem pessoa real/identificável,
    // foco no objeto/ambiente — reduz bloqueio do filtro de segurança do Gemini.
    const gPrompt = `Create a photorealistic, candid amateur smartphone photo for a FICTIONAL short story. It must NOT depict any real or identifiable person; avoid clear faces (back view, cropped, or focus on the object/scene). No text, no watermark, no logos. Scene to depict: ${desc}`;
    const g = await geminiImage(gPrompt, geminiKey).catch((e) => ({ url: null, reason: String(e?.message || e) }));
    if (g.url) return NextResponse.json({ dataUrl: g.url, source: 'gemini' });
    reason = g.reason;
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
  // sem imagem relevante → 200 com dataUrl nulo + MOTIVO (o cliente avisa o usuário
  // com a causa real e mantém o card neutro, em vez de uma foto aleatória).
  return NextResponse.json({ dataUrl: null, reason: `${reason}; Pollinations: ocupado/sem cota` });
}
