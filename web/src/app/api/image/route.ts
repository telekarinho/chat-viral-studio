import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gera uma imagem GRÁTIS (sem chave) a partir de uma descrição, via Pollinations.ai.
// Retorna data URL (base64) pra ser desenhada no canvas sem "sujar" (export-safe).
// Fallback: foto de banco por palavra-chave (loremflickr) se a geração falhar.
async function toDataUrl(url: string, signal: AbortSignal): Promise<string> {
  const r = await fetch(url, { signal, headers: { 'User-Agent': 'ChatViralStudio/1.0' } });
  if (!r.ok) throw new Error(`fonte ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error('imagem vazia');
  const mime = r.headers.get('content-type') || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function POST(req: Request) {
  const { prompt = '', keywords = '' } = await req.json().catch(() => ({}));
  const desc = String(prompt || keywords).trim().slice(0, 200);
  if (!desc) return NextResponse.json({ error: 'descrição vazia' }, { status: 400 });

  const seed = Math.floor(Math.random() * 1e6);
  const aiPrompt = `realistic photo, ${desc}`;
  const pollin = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=640&height=480&nologo=true&seed=${seed}`;
  const stock = `https://loremflickr.com/640/480/${encodeURIComponent(desc.split(/\s+/).slice(0, 3).join(','))}?lock=${seed}`;

  // 1) tenta IA grátis (Pollinations); 2) cai pra banco de imagens por palavra-chave
  for (const [src, label] of [[pollin, 'ai'], [stock, 'stock']] as const) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), label === 'ai' ? 45000 : 12000);
    try {
      const dataUrl = await toDataUrl(src, ctrl.signal);
      clearTimeout(to);
      return NextResponse.json({ dataUrl, source: label });
    } catch {
      clearTimeout(to);
    }
  }
  return NextResponse.json({ error: 'não consegui gerar a imagem agora, tente de novo' }, { status: 502 });
}
