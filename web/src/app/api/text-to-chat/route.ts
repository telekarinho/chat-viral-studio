import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildTextToChatPrompt } from '@/lib/server/prompt';
import { normalizeStory, textToChatLocal } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { text = '', ...params } = body;
  if (!text.trim()) return NextResponse.json({ error: 'texto vazio' }, { status: 400 });

  const inMod = moderate(text);
  if (!inMod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: inMod.reasons }, { status: 422 });

  const gopts = geminiOptsFromReq(req);
  const enabled = geminiEnabled(gopts.key);
  try {
    const story = enabled
      ? normalizeStory(await geminiJSON(buildTextToChatPrompt(text, params), gopts), params)
      : textToChatLocal(text, params);
    const mod = moderate(JSON.stringify(story));
    if (!mod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: mod.reasons }, { status: 422 });
    return NextResponse.json({ story, source: enabled ? 'gemini' : 'local' });
  } catch (err: any) {
    return NextResponse.json({ story: textToChatLocal(text, params), source: 'local-fallback', warning: err.message });
  }
}
