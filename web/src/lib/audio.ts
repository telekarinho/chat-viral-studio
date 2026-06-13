import { api } from './api';
import type { Story, Message } from './types';

// Decode a base64 MP3 from the TTS endpoint into an AudioBuffer (and a data URL).
export async function synthMessage(
  audioCtx: AudioContext,
  msg: Message,
  voice: string,
): Promise<{ buffer: AudioBuffer; dataUrl: string; duration: number } | null> {
  const text = msg.text?.trim();
  if (!text || msg.type === 'deleted' || msg.type === 'call_missed') return null;

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

  let done = 0;
  for (const m of messages) {
    try {
      const r = await synthMessage(audioCtx, m, voice);
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
