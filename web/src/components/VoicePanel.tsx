'use client';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/store/useStudioStore';
import { api } from '@/lib/api';
import { synthStory, synthNarration } from '@/lib/audio';

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
  const { story, voice, setVoice, settings, setSettings, setAudioBuffers, audioBuffers, narratorBuffers, setNarratorBuffers, patchStory } = useStudio();
  const [voices, setVoices] = useState(FALLBACK_VOICES);
  const [gen, setGen] = useState<{ done: number; total: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const playRef = useRef<{ ctx: AudioContext; srcs: AudioBufferSourceNode[] } | null>(null);

  const narratorMode = settings.withNarrator === true;

  useEffect(() => {
    api.voices().then((r) => r?.voices?.length && setVoices(r.voices)).catch(() => {});
  }, []);

  function stopPlayback() {
    playRef.current?.srcs.forEach((s) => { try { s.stop(); } catch {} });
    playRef.current?.ctx.close().catch(() => {});
    playRef.current = null;
  }

  async function preview() {
    setPreviewing(true);
    try {
      const r = await api.tts('Oi! Essa é a minha voz pra narrar a sua história — com emoção de verdade.', voice, 'alegria');
      const audio = new Audio(`data:${r.mime};base64,${r.audioContent}`);
      await audio.play().catch(() => {});
    } catch (e: any) {
      alert('Falha ao testar voz: ' + e.message);
    } finally {
      setPreviewing(false);
    }
  }

  // Toca os blocos da narração do locutor em sequência (preview)
  async function playNarration() {
    if (!narratorBuffers.length) return;
    stopPlayback();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const srcs: AudioBufferSourceNode[] = [];
    let at = ctx.currentTime + 0.1;
    for (const buf of narratorBuffers) {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(at); at += buf.duration;
      srcs.push(src);
    }
    playRef.current = { ctx, srcs };
  }

  async function narrate() {
    if (!story) return;
    if (narratorMode) {
      setGen({ done: 0, total: 1 });
      try {
        // 1) escreve o roteiro da locução combinando com as mensagens atuais
        let script = story.narration || '';
        try {
          const r = await api.narration(story);
          if (r.narration?.trim()) { script = r.narration.trim(); patchStory({ narration: script }); }
        } catch { /* usa o roteiro existente */ }
        if (!script.trim()) throw new Error('sem roteiro de narração');
        // 2) sintetiza a voz do locutor
        const { buffers } = await synthNarration(script, voice, (done, total) => setGen({ done, total }));
        if (!buffers.length) throw new Error('nenhum áudio gerado');
        setNarratorBuffers(buffers);
      } catch (e: any) {
        alert('Falha na narração do locutor: ' + e.message);
      } finally { setGen(null); }
      return;
    }
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
  const hasMsgAudio = audioBuffers.size > 0;
  const hasNarrator = narratorBuffers.length > 0;

  return (
    <div className="card space-y-4">
      <span className="label">Painel de vozes (Google TTS)</span>

      <label className="flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={narratorMode} onChange={(e) => setSettings({ withNarrator: e.target.checked })} className="accent-[#7C3AED]" />
        🎙️ Locutor narra tudo (estilo "Histórias de WhatsApp")
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {voices.map((v) => (
          <button key={v.id} onClick={() => setVoice(v.id)}
            className={`rounded-xl border p-2 text-sm transition ${voice === v.id ? 'border-brand bg-brand/20' : 'border-white/10'}`}>
            🎙️ {v.label}
          </button>
        ))}
      </div>

      <button className="btn-ghost w-full" onClick={preview} disabled={previewing}>
        {previewing ? '🎧 Tocando amostra…' : '▶️ Ouvir amostra desta voz'}
      </button>

      <button className="btn-primary w-full" onClick={narrate} disabled={!!gen}>
        {gen
          ? (narratorMode ? `🎙️ Gerando locução ${gen.done}/${gen.total}…` : `🎧 Gerando narração ${gen.done}/${gen.total}…`)
          : narratorMode
            ? (hasNarrator ? '🔁 Regerar locução do narrador' : '🎙️ Gerar locução do narrador')
            : (hasMsgAudio ? '🔁 Regenerar vozes' : '🎙️ Gerar vozes por mensagem')}
      </button>

      {narratorMode && hasNarrator && (
        <button className="btn-ghost w-full" onClick={playNarration}>▶️ Ouvir a narração do locutor</button>
      )}

      {narratorMode && hasNarrator && (
        <p className="text-center text-sm text-emerald-400">✓ Locução pronta — será usada no vídeo exportado.</p>
      )}
      {!narratorMode && hasMsgAudio && (
        <p className="text-center text-sm text-emerald-400">✓ {audioBuffers.size} blocos sincronizados com as mensagens.</p>
      )}

      <p className="text-xs text-white/40">
        {narratorMode
          ? 'Um locutor único lê o roteiro inteiro (gancho + falas + reação + CTA) por cima do vídeo. Gere a locução e exporte. Sem chave de TTS, sai um placeholder.'
          : 'Cada mensagem vira um bloco de áudio com a emoção da cena. Sem chave de TTS, um placeholder mantém a sincronia.'}
      </p>
    </div>
  );
}
