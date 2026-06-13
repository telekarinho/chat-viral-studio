import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildStoryPrompt } from '@/lib/server/prompt';
import { normalizeStory, mockStory, heuristicScore } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const params = await req.json().catch(() => ({}));
  const gopts = geminiOptsFromReq(req);
  const enabled = geminiEnabled(gopts.key);
  try {
    let story;
    if (enabled) {
      story = normalizeStory(await geminiJSON(buildStoryPrompt(params), gopts), params);
    } else {
      story = mockStory(params);
    }
    const mod = moderate(JSON.stringify(story));
    if (!mod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: mod.reasons }, { status: 422 });
    // anexa o score de viralização p/ o portão de qualidade no cliente
    story.viralScore = heuristicScore(story);
    return NextResponse.json({ story, source: enabled ? 'gemini' : 'mock' });
  } catch (err: any) {
    // graceful fallback — never leave the user empty-handed
    const story = mockStory(params);
    story.viralScore = heuristicScore(story);
    return NextResponse.json({ story, source: 'mock-fallback', warning: err.message });
  }
}
