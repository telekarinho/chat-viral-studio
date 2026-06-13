'use client';
import { useEffect, useState } from 'react';
import { useStudio } from '@/store/useStudioStore';
import { api } from '@/lib/api';
import { synthStory } from '@/lib/audio';

const FALLBACK_VOICES = [
  { id: 'narrador_masc', label: 'Narrador masculino' },
  { id: 'narradora_fem', label: 'Narradora feminina' },
  { id: 'voz_engracada', label: 'Voz engraçada' },
  { id: 'voz_suspense', label: 'Voz suspense' },
  { id: 'voz_drama', label: 'Voz dramática leve' },
  { id: 'voz_tiktok', label: 'Voz acelerada TikTok' },
  { id: 'voz_calma', label: 'Voz calma' },
  { id: 'voz_jovem', label: 'Voz jovem' },
];

export function VoicePanel() {
  const { story, voice, setVoice, setAudioBuffers, audioBuffers } = useStudio();
  const [voices, setVoices] = useState(FALLBACK_VOICES);
  const [gen, setGen] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    api.voices().then((r) => r?.voices?.length && setVoices(r.voices)).catch(() => {});
  }, []);

  async function narrate() {
    if (!story) return;
    setGen({ done: 0, total: story.messages.length });
    try {
      const { messages, buffers } = await synthStory(story, voice, (done, total) => setGen({ done, total }));
      setAudioBuffers(buffers, messages);
    } catch (e: any) {
      alert('Falha na narração: ' + e.message);
    } finally {
      setGen(null);
    }
  }

  if (!story) return null;
  const hasAudio = audioBuffers.size > 0;

  return (
    <div className="card space-y-4">
      <span className="label">Painel de vozes (Google TTS)</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {voices.map((v) => (
          <button key={v.id} onClick={() => setVoice(v.id)}
            className={`rounded-xl border p-2 text-sm transition ${voice === v.id ? 'border-brand bg-brand/20' : 'border-white/10'}`}>
            🎙️ {v.label}
          </button>
        ))}
      </div>

      <button className="btn-primary w-full" onClick={narrate} disabled={!!gen}>
        {gen ? `🎧 Gerando narração ${gen.done}/${gen.total}…` : hasAudio ? '🔁 Regenerar narração' : '🎙️ Gerar narração IA'}
      </button>

      {hasAudio && (
        <p className="text-center text-sm text-emerald-400">
          ✓ {audioBuffers.size} blocos de áudio sincronizados com as mensagens.
        </p>
      )}
      <p className="text-xs text-white/40">
        Cada mensagem vira um bloco de áudio, sincronizado no tempo da conversa. A emoção de cada
        mensagem ajusta pitch e velocidade. Sem chave de TTS, um placeholder mantém a sincronia.
      </p>
    </div>
  );
}
