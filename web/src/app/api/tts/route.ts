import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VOICES: Record<string, { name: string; pitch: number; rate: number; label: string }> = {
  narrador_masc: { name: 'pt-BR-Wavenet-B', pitch: -2, rate: 1.0, label: 'Narrador masculino' },
  narradora_fem: { name: 'pt-BR-Wavenet-A', pitch: 0, rate: 1.0, label: 'Narradora feminina' },
  voz_engracada: { name: 'pt-BR-Wavenet-C', pitch: 6, rate: 1.15, label: 'Voz engraçada' },
  voz_suspense: { name: 'pt-BR-Wavenet-B', pitch: -4, rate: 0.9, label: 'Voz suspense' },
  voz_drama: { name: 'pt-BR-Wavenet-A', pitch: -1, rate: 0.92, label: 'Voz dramática leve' },
  voz_tiktok: { name: 'pt-BR-Wavenet-C', pitch: 2, rate: 1.3, label: 'Voz acelerada TikTok' },
  voz_calma: { name: 'pt-BR-Wavenet-A', pitch: -1, rate: 0.95, label: 'Voz calma' },
  voz_jovem: { name: 'pt-BR-Wavenet-C', pitch: 3, rate: 1.05, label: 'Voz jovem' },
};
const EMOTION: Record<string, { pitch: number; rate: number }> = {
  raiva: { pitch: 2, rate: 0.08 }, alegria: { pitch: 3, rate: 0.05 }, medo: { pitch: -2, rate: -0.05 },
  surpresa: { pitch: 4, rate: 0.1 }, tristeza: { pitch: -3, rate: -0.1 }, ironia: { pitch: 1, rate: -0.03 },
  neutro: { pitch: 0, rate: 0 },
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Minimal near-silent MP3 placeholder so timing/sync works without a TTS key.
const BEEP =
  '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////8AAAA8TEFNRTMuMTAwAm' +
  '4AAAAAAAAAABSAJANIQgAAgAAAAnGMHkfQAAAAAAAAAAAAAAAAAAAA';

export async function POST(req: Request) {
  const { text = '', voice = 'narradora_fem', emotion = 'neutro', speed = 1, pitch = 0 } = await req.json().catch(() => ({}));
  if (!text.trim()) return NextResponse.json({ error: 'texto vazio' }, { status: 400 });

  // user's own key (sent from the Settings page) wins, else server env
  const key = req.headers.get('x-google-tts-key')?.trim() || process.env.GOOGLE_TTS_API_KEY;
  const preset = VOICES[voice] || VOICES.narradora_fem;
  const emo = EMOTION[emotion] || EMOTION.neutro;
  const finalPitch = clamp(preset.pitch + emo.pitch + Number(pitch || 0), -20, 20);
  const finalRate = clamp(preset.rate + emo.rate + (Number(speed || 1) - 1), 0.25, 4);

  if (!key) return NextResponse.json({ audioContent: BEEP, mime: 'audio/mp3', mock: true });

  try {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'pt-BR', name: preset.name },
        audioConfig: { audioEncoding: 'MP3', pitch: finalPitch, speakingRate: finalRate },
      }),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}`);
    const data = await r.json();
    return NextResponse.json({ audioContent: data.audioContent, mime: 'audio/mp3' });
  } catch {
    return NextResponse.json({ audioContent: BEEP, mime: 'audio/mp3', mock: true });
  }
}

export async function GET() {
  return NextResponse.json({ voices: Object.entries(VOICES).map(([id, v]) => ({ id, label: v.label })) });
}
