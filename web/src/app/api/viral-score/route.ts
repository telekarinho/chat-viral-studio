import { NextResponse } from 'next/server';
import { geminiEnabled, geminiJSON, geminiOptsFromReq } from '@/lib/server/gemini';
import { buildViralScorePrompt } from '@/lib/server/prompt';
import { heuristicScore } from '@/lib/server/story';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const story = body?.story || body;
  const gopts = geminiOptsFromReq(req);
  try {
    if (geminiEnabled(gopts.key)) {
      return NextResponse.json({ viralScore: await geminiJSON(buildViralScorePrompt(story), gopts) });
    }
    return NextResponse.json({ viralScore: heuristicScore(story) });
  } catch {
    return NextResponse.json({ viralScore: heuristicScore(story) });
  }
}
