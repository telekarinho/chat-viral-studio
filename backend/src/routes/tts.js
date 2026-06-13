import { Router } from 'express';

const router = Router();

// Voice presets mapped to Google Cloud TTS pt-BR voices + pitch/rate tweaks.
export const VOICES = {
  narrador_masc:   { name: 'pt-BR-Wavenet-B', pitch: -2,  rate: 1.0,  label: 'Narrador masculino' },
  narradora_fem:   { name: 'pt-BR-Wavenet-A', pitch: 0,   rate: 1.0,  label: 'Narradora feminina' },
  voz_engracada:   { name: 'pt-BR-Wavenet-C', pitch: 6,   rate: 1.15, label: 'Voz engraçada' },
  voz_suspense:    { name: 'pt-BR-Wavenet-B', pitch: -4,  rate: 0.9,  label: 'Voz suspense' },
  voz_drama:       { name: 'pt-BR-Wavenet-A', pitch: -1,  rate: 0.92, label: 'Voz dramática leve' },
  voz_tiktok:      { name: 'pt-BR-Wavenet-C', pitch: 2,   rate: 1.3,  label: 'Voz acelerada TikTok' },
  voz_calma:       { name: 'pt-BR-Wavenet-A', pitch: -1,  rate: 0.95, label: 'Voz calma' },
  voz_jovem:       { name: 'pt-BR-Wavenet-C', pitch: 3,   rate: 1.05, label: 'Voz jovem' },
};

// emotion → small prosody nudge
const EMOTION = {
  raiva:    { pitch: +2, rate: +0.08 },
  alegria:  { pitch: +3, rate: +0.05 },
  medo:     { pitch: -2, rate: -0.05 },
  surpresa: { pitch: +4, rate: +0.1 },
  tristeza: { pitch: -3, rate: -0.1 },
  ironia:   { pitch: +1, rate: -0.03 },
  neutro:   { pitch: 0,  rate: 0 },
};

router.get('/voices', (_req, res) => {
  res.json({ voices: Object.entries(VOICES).map(([id, v]) => ({ id, label: v.label })) });
});

// Generate audio for ONE block of text. Returns base64 MP3 (audioContent).
router.post('/tts', async (req, res, next) => {
  try {
    const { text = '', voice = 'narradora_fem', emotion = 'neutro', speed = 1, pitch = 0 } = req.body || {};
    if (!text.trim()) return res.status(400).json({ error: 'texto vazio' });

    const key = process.env.GOOGLE_TTS_API_KEY;
    const preset = VOICES[voice] || VOICES.narradora_fem;
    const emo = EMOTION[emotion] || EMOTION.neutro;
    const finalPitch = clamp(preset.pitch + emo.pitch + Number(pitch || 0), -20, 20);
    const finalRate = clamp(preset.rate + emo.rate + (Number(speed || 1) - 1), 0.25, 4);

    if (!key) {
      // offline fallback: a short synthesized beep so timing/sync still works
      return res.json({ audioContent: BEEP_MP3_BASE64, mime: 'audio/mp3', mock: true });
    }

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'pt-BR', name: preset.name },
        audioConfig: { audioEncoding: 'MP3', pitch: finalPitch, speakingRate: finalRate },
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw Object.assign(new Error(`TTS ${r.status}: ${body.slice(0, 200)}`), { status: 502 });
    }
    const data = await r.json();
    res.json({ audioContent: data.audioContent, mime: 'audio/mp3' });
  } catch (err) {
    next(err);
  }
});

export default router;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// 40ms of near-silence MP3 (valid frame) used only as offline placeholder.
const BEEP_MP3_BASE64 =
  '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////8AAAA8TEFNRTMuMTAwAm' +
  '4AAAAAAAAAABSAJANIQgAAgAAAAnGMHkfQAAAAAAAAAAAAAAAAAAAA';
