import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VOICES = [
  { id: 'narrador_masc', label: 'Narrador masculino' },
  { id: 'narradora_fem', label: 'Narradora feminina' },
  { id: 'voz_engracada', label: 'Voz engraçada' },
  { id: 'voz_suspense', label: 'Voz suspense' },
  { id: 'voz_drama', label: 'Voz dramática leve' },
  { id: 'voz_tiktok', label: 'Voz acelerada TikTok' },
  { id: 'voz_calma', label: 'Voz calma' },
  { id: 'voz_jovem', label: 'Voz jovem' },
];

export async function GET() {
  return NextResponse.json({ voices: VOICES });
}
