import { Router } from 'express';
import { geminiEnabled, geminiJSON } from '../lib/gemini.js';
import { buildStoryPrompt, buildTextToChatPrompt, buildViralScorePrompt } from '../lib/prompt.js';
import { normalizeStory, mockStory } from '../lib/story.js';
import { moderateStory, moderateText } from '../lib/moderation.js';

const router = Router();

// ─── MODO IA TOTAL ──────────────────────────────────────────────
router.post('/generate', async (req, res, next) => {
  try {
    const params = req.body || {};
    let story;
    if (geminiEnabled()) {
      const raw = await geminiJSON(buildStoryPrompt(params));
      story = normalizeStory(raw, params);
    } else {
      story = mockStory(params);
    }

    const mod = moderateStory(story);
    if (!mod.ok) return res.status(422).json({ error: 'conteúdo bloqueado', reasons: mod.reasons });

    res.json({ story, source: geminiEnabled() ? 'gemini' : 'mock' });
  } catch (err) {
    // graceful: if Gemini fails, still give the user a usable story
    console.warn('[generate] falling back to mock:', err.message);
    res.json({ story: mockStory(req.body || {}), source: 'mock-fallback', warning: err.message });
  }
});

// ─── MODO TEXTO DO USUÁRIO + IA ─────────────────────────────────
router.post('/text-to-chat', async (req, res, next) => {
  try {
    const { text = '', ...params } = req.body || {};
    if (!text.trim()) return res.status(400).json({ error: 'texto vazio' });

    const inMod = moderateText(text);
    if (!inMod.ok) return res.status(422).json({ error: 'conteúdo bloqueado', reasons: inMod.reasons });

    let story;
    if (geminiEnabled()) {
      const raw = await geminiJSON(buildTextToChatPrompt(text, params));
      story = normalizeStory(raw, params);
    } else {
      story = textToChatLocal(text, params);
    }

    const mod = moderateStory(story);
    if (!mod.ok) return res.status(422).json({ error: 'conteúdo bloqueado', reasons: mod.reasons });

    res.json({ story, source: geminiEnabled() ? 'gemini' : 'local' });
  } catch (err) {
    next(err);
  }
});

// ─── MÓDULO DE VIRALIZAÇÃO ──────────────────────────────────────
router.post('/viral-score', async (req, res, next) => {
  try {
    const story = req.body?.story || req.body;
    if (geminiEnabled()) {
      const score = await geminiJSON(buildViralScorePrompt(story));
      return res.json({ viralScore: score });
    }
    res.json({ viralScore: heuristicScore(story) });
  } catch (err) {
    res.json({ viralScore: heuristicScore(req.body?.story || req.body) });
  }
});

export default router;

// ── helpers ────────────────────────────────────────────────────

// Splits pasted text into alternating chat messages without an LLM.
function textToChatLocal(text, params) {
  const chunks = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .flatMap((s) => (s.length > 90 ? s.match(/.{1,90}(\s|$)/g) || [s] : [s]))
    .map((s) => s.trim())
    .filter(Boolean);

  const messages = chunks.map((text, i) => ({
    sender: i % 2 === 0 ? 'c1' : 'c2',
    type: 'text',
    text,
    emotion: 'neutro',
    delay: 0.8 + Math.min(text.length / 60, 1.6),
    status: 'read',
  }));

  return normalizeStory({
    title: chunks[0]?.slice(0, 40) || 'Minha história',
    hook: chunks[0]?.slice(0, 60) || '',
    characters: [
      { id: 'c1', name: 'Pessoa 1', side: 'left' },
      { id: 'c2', name: 'Pessoa 2', side: 'right' },
    ],
    messages,
    narration: text,
    hashtags: ['#historia', '#viral', '#ficção'],
    caption: 'História fictícia para entretenimento.',
    part2_hook: 'Quer a parte 2?',
  }, params);
}

function heuristicScore(story = {}) {
  const msgs = story.messages || [];
  const hook = Math.min(100, (story.hook?.length ? 70 : 40) + (/[😳👀😱]/.test(story.hook || '') ? 15 : 0));
  const retention = Math.max(40, 100 - Math.abs(msgs.length - 14) * 3);
  const emotion = msgs.some((m) => m.emotion && m.emotion !== 'neutro') ? 80 : 60;
  const ending = story.part2_hook ? 88 : 65;
  const part2 = story.part2_hook ? 82 : 50;
  const curiosity = 75;
  const total = Math.round((hook + curiosity + retention + emotion + ending + part2) / 6);
  return {
    hook, curiosity, retention, emotion, ending, part2, total,
    suggestions: [
      total < 70 ? 'Reforce o gancho da 1ª mensagem com tensão imediata.' : 'Bom gancho — mantenha as falas curtas.',
      story.part2_hook ? 'Ótimo: já tem ponte para parte 2.' : 'Adicione um gancho de parte 2 no final.',
    ],
  };
}
