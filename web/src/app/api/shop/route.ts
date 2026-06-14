import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildShopScriptPrompt, buildShopChatPrompt } from '@/lib/server/prompt';
import { normalizeStory, mockShopScript, mockShopChat, heuristicScore } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gera conteúdo de TikTok Shop: roteiro UGC e/ou "chat shoppable" (vídeo).
export async function POST(req: Request) {
  const input = await req.json().catch(() => ({}));
  const format = input?.format || 'both';           // 'script' | 'chat' | 'both'
  const gopts = geminiOptsFromReq(req);
  const enabled = geminiEnabled(gopts.key);

  const wantScript = format === 'script' || format === 'both';
  const wantChat = format === 'chat' || format === 'both';

  let script: any = null;
  let story: any = null;
  let source = enabled ? 'gemini' : 'mock';

  try {
    if (wantScript) {
      script = enabled ? await geminiJSON(buildShopScriptPrompt(input), gopts) : mockShopScript(input);
      if (!script?.hook) script = mockShopScript(input);
    }
    if (wantChat) {
      story = enabled
        ? normalizeStory(await geminiJSON(buildShopChatPrompt(input), gopts), { ...input, category: 'compra errada', duration: input.duration })
        : mockShopChat(input);
      story.viralScore = heuristicScore(story);
    }
  } catch (err: any) {
    // fallback gracioso — nunca deixa o usuário sem nada
    source = 'mock-fallback';
    if (wantScript && !script?.hook) script = mockShopScript(input);
    if (wantChat && !story) { story = mockShopChat(input); story.viralScore = heuristicScore(story); }
  }

  // moderação do que será exibido
  const mod = moderate(JSON.stringify({ script, story }));
  if (!mod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: mod.reasons }, { status: 422 });

  return NextResponse.json({ script, story, source });
}
