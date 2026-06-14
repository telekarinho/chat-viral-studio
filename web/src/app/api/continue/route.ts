import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildContinuationPrompt } from '@/lib/server/prompt';
import { normalizeStory, mockContinuation, heuristicScore, seriesBaseTitle } from '@/lib/server/story';
import { moderate } from '@/lib/server/moderation';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Gera a PARTE N+1 (continuação/série) de uma história já criada.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const prev = body?.prev || {};
  const params = body?.params || {};
  const gopts = geminiOptsFromReq(req);
  const enabled = geminiEnabled(gopts.key);

  const part = Number(params.part || (Number(prev.part || 1) + 1));
  const seriesId = prev.seriesId || prev.id || undefined;
  const base = seriesBaseTitle(prev.title) || prev.title || 'História';

  try {
    let story;
    if (enabled) {
      story = normalizeStory(
        await geminiJSON(buildContinuationPrompt(prev, { ...params, part }), gopts),
        { ...params, category: prev.category, duration: params.duration || prev.targetDuration },
      );
    } else {
      story = mockContinuation(prev, params);
    }
    const mod = moderate(JSON.stringify(story));
    if (!mod.ok) return NextResponse.json({ error: 'conteúdo bloqueado', reasons: mod.reasons }, { status: 422 });
    story.seriesId = seriesId;
    story.part = part;
    story.title = `Parte ${part} — ${seriesBaseTitle(story.title) || base}`;
    story.viralScore = heuristicScore(story);
    return NextResponse.json({ story, source: enabled ? 'gemini' : 'mock' });
  } catch (err: any) {
    const story = mockContinuation(prev, params);
    story.seriesId = seriesId;
    story.part = part;
    story.title = `Parte ${part} — ${base}`;
    story.viralScore = heuristicScore(story);
    return NextResponse.json({ story, source: 'mock-fallback', warning: err.message });
  }
}
