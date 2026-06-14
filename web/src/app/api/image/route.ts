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

export async function POST(req: Request) {
  const { prompt = '', keywords = '' } = await req.json().catch(() => ({}));
  const raw = String(prompt || keywords).trim().slice(0, 200);
  if (!raw) return NextResponse.json({ error: 'descrição vazia' }, { status: 400 });

  const desc = cleanDesc(raw);
  const aiPrompt = `realistic candid smartphone photo, ${desc}, natural lighting, high detail, no text, no watermark`;

  // tenta o Pollinations algumas vezes (a fila "1 já enfileirado" costuma liberar)
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = Math.floor(Math.random() * 1e6);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiPrompt)}?width=720&height=540&nologo=true&seed=${seed}`;
    const dataUrl = await fetchImage(url, 45000);
    if (dataUrl) return NextResponse.json({ dataUrl, source: 'ai' });
    if (attempt < 2) await sleep(1500 * (attempt + 1)); // 1.5s, 3s
  }
  // sem imagem relevante → o cliente mantém o card neutro (melhor que foto aleatória)
  return NextResponse.json({ error: 'a geração de imagem está ocupada, tente de novo em instantes' }, { status: 502 });
}
