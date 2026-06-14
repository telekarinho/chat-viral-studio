import { api } from './api';
import type { Story, Message, Character } from './types';

// ── Vozes por personagem (diálogo a 2 vozes: ele x ela) ───────────────
// Usa as melhores Neural2: feminina = Neural2-A, masculina = Neural2-B; e
// secundárias distintas quando há 2 do mesmo gênero, pra nunca soarem iguais.
const FEM_VOICES = ['narradora_fem', 'voz_jovem', 'voz_calma'];
const MASC_VOICES = ['narrador_masc', 'voz_suspense'];

const KNOWN_F = new Set(['ana', 'maria', 'lucia', 'rafaela', 'laura', 'julia', 'bia', 'duda', 'leticia', 'fernanda', 'patricia', 'sandra', 'carla', 'bruna', 'amanda', 'camila', 'vanessa', 'larissa', 'jessica', 'gabriela', 'beatriz', 'manu', 'sofia', 'sophia', 'alice', 'helena', 'valentina', 'rebeca', 'luiza', 'isabela', 'dona', 'tia', 'mae', 'mãe', 'vizinha', 'sogra', 'cunhada', 'ex']);
const KNOWN_M = new Set(['joao', 'pedro', 'leo', 'gabriel', 'lucas', 'mateus', 'marcos', 'felipe', 'rafael', 'rodrigo', 'bruno', 'thiago', 'tiago', 'carlos', 'andre', 'paulo', 'vitor', 'victor', 'gustavo', 'daniel', 'diego', 'caio', 'igor', 'enzo', 'davi', 'miguel', 'arthur', 'bernardo', 'heitor', 'seu', 'tio', 'pai', 'chefe', 'patrao', 'patrão', 'vizinho']);

function firstName(s: string): string {
  return (s || '').trim().toLowerCase().split(/\s+/)[0].replace(/[^a-zà-ú]/g, '');
}
function inferGender(name: string): 'f' | 'm' {
  const n = firstName(name);
  if (!n) return 'm';
  if (KNOWN_F.has(n)) return 'f';
  if (KNOWN_M.has(n)) return 'm';
  return n.endsWith('a') ? 'f' : 'm'; // heurística pt-BR (Maria→f, João→m)
}

// Mapa personagem→voz, garantindo vozes distintas por lado/gênero.
export function assignCharacterVoices(characters: Character[]): Record<string, string> {
  const map: Record<string, string> = {};
  let fi = 0, mi = 0;
  for (const c of characters || []) {
    if (inferGender(c.name) === 'f') map[c.id] = FEM_VOICES[fi++ % FEM_VOICES.length];
    else map[c.id] = MASC_VOICES[mi++ % MASC_VOICES.length];
  }
  return map;
}

// Decode a base64 MP3 from the TTS endpoint into an AudioBuffer (and a data URL).
export async function synthMessage(
  audioCtx: AudioContext,
  msg: Message,
  voice: string,
): Promise<{ buffer: AudioBuffer; dataUrl: string; duration: number } | null> {
  const text = msg.text?.trim();
  // só mensagens de TEXTO são faladas. Foto (legenda = direção de cena),
  // figurinha (emoji), áudio fake, apagada e chamada perdida NÃO são lidas.
  if (!text || msg.type !== 'text') return null;

  const { audioContent, mime } = await api.tts(text, voice, msg.emotion);
  if (!audioContent) return null;
  const dataUrl = `data:${mime};base64,${audioContent}`;
  const bytes = base64ToBytes(audioContent);
  const ab = bytes.buffer.slice(0) as ArrayBuffer;
  const buffer = await audioCtx.decodeAudioData(ab);
  return { buffer, dataUrl, duration: buffer.duration };
}

// Generate narration for every message; mutates copies with audioDuration.
export async function synthStory(
  story: Story,
  voice: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ messages: Message[]; buffers: Map<string, AudioBuffer> }> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const buffers = new Map<string, AudioBuffer>();
  const messages = story.messages.map((m) => ({ ...m }));
  // cada personagem fala com a SUA voz (ele x ela) — quem envia x quem recebe
  const voiceMap = assignCharacterVoices(story.characters);

  let done = 0;
  for (const m of messages) {
    try {
      const r = await synthMessage(audioCtx, m, voiceMap[m.sender] || voice);
      if (r) {
        m.audioUrl = r.dataUrl;
        m.audioDuration = r.duration;
        buffers.set(m.id, r.buffer);
      }
    } catch (e) {
      console.warn('TTS failed for', m.id, e);
    }
    onProgress?.(++done, messages.length);
  }
  await audioCtx.close().catch(() => {});
  return { messages, buffers };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Quebra o roteiro do narrador em pedaços <= ~3500 chars (limite do TTS) por frase.
function chunkNarration(text: string, max = 3500): string[] {
  const sentences = (text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > max && cur) { chunks.push(cur.trim()); cur = s; }
    else cur += ' ' + s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(Boolean);
}

// Gera a NARRAÇÃO do locutor (uma voz lendo a história toda) em blocos sequenciais.
export async function synthNarration(
  narration: string,
  voice: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ buffers: AudioBuffer[]; duration: number }> {
  const text = (narration || '').trim();
  if (!text) return { buffers: [], duration: 0 };
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const parts = chunkNarration(text);
  const buffers: AudioBuffer[] = [];
  let duration = 0;
  let done = 0;
  for (const part of parts) {
    try {
      const { audioContent } = await api.tts(part, voice, 'neutro');
      if (audioContent) {
        const ab = base64ToBytes(audioContent).buffer.slice(0) as ArrayBuffer;
        const buf = await audioCtx.decodeAudioData(ab);
        buffers.push(buf);
        duration += buf.duration;
      }
    } catch (e) {
      console.warn('Narração falhou num bloco', e);
    }
    onProgress?.(++done, parts.length);
  }
  await audioCtx.close().catch(() => {});
  return { buffers, duration };
}

// Concatena AudioBuffers num só (mono/estéreo conforme o 1º).
function joinBuffers(ctx: BaseAudioContext, buffers: AudioBuffer[]): AudioBuffer | null {
  if (!buffers.length) return null;
  const channels = buffers[0].numberOfChannels;
  const rate = buffers[0].sampleRate;
  const total = buffers.reduce((a, b) => a + b.length, 0);
  const out = ctx.createBuffer(channels, total, rate);
  for (let c = 0; c < channels; c++) {
    const data = out.getChannelData(c);
    let offset = 0;
    for (const b of buffers) { data.set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), offset); offset += b.length; }
  }
  return out;
}

// Codifica um AudioBuffer em WAV (PCM 16-bit) — download garantido, sem gravador.
export function narratorWav(buffers: AudioBuffer[]): Blob | null {
  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, 44100);
  const buf = joinBuffers(ctx, buffers);
  if (!buf) return null;
  const numCh = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); view.setUint32(4, bytes - 8, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true); wr(36, 'data');
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
