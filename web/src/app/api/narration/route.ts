import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildNarrationPrompt } from '@/lib/server/prompt';
import { buildNarrationLocal } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gera a LOCUÇÃO do narrador a partir das mensagens da história (garante que combine).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const story = body?.story || body;
  const gopts = geminiOptsFromReq(req);
  try {
    if (geminiEnabled(gopts.key)) {
      const out = await geminiJSON(buildNarrationPrompt(story), gopts);
      const narration = (out?.narration || '').trim() || buildNarrationLocal(story);
      const mod = moderate(narration);
      if (!mod.ok) return NextResponse.json({ narration: buildNarrationLocal(story), source: 'local' });
      return NextResponse.json({ narration, source: 'gemini' });
    }
  } catch { /* cai pro local */ }
  return NextResponse.json({ narration: buildNarrationLocal(story), source: 'local' });
}
