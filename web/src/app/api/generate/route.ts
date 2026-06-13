import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON } from '@/lib/server/gemini';
import { buildStoryPrompt } from '@/lib/server/prompt';
import { normalizeStory, mockStory } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const params = await req.json().catch(() => ({}));
  try {
    let story;
    if (geminiEnabled()) {
      story = normalizeStory(await geminiJSON(buildStoryPrompt(params)), params);
    } else {
      story = mockStory(params);
    }
    const mod = moderate(JSON.stringify(story));
    if (!mod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: mod.reasons }, { status: 422 });
    return NextResponse.json({ story, source: geminiEnabled() ? 'gemini' : 'mock' });
  } catch (err: any) {
    // graceful fallback — never leave the user empty-handed
    return NextResponse.json({ story: mockStory(params), source: 'mock-fallback', warning: err.message });
  }
}
