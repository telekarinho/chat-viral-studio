'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useStudio } from '@/store/useStudioStore';
import { TEMPLATES } from '@/lib/templates';
import { CATEGORIES, DURATIONS, INTENSITIES, EMOTIONS, ENDINGS } from '@/lib/options';
import type { GenerateParams } from '@/lib/types';

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="p-8 text-white/50">Carregando…</div>}>
      <CreateInner />
    </Suspense>
  );
}

function CreateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const setStory = useStudio((s) => s.setStory);

  const [tab, setTab] = useState<'ia' | 'text'>(sp.get('tab') === 'text' ? 'text' : 'ia');
  const [params, setParams] = useState<GenerateParams>({
    category: 'namoro', duration: 45, intensity: 'médio',
    emotion: 'engraçado', ending: 'plot twist', messageCount: 14,
  });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefill from template
  useEffect(() => {
    const tid = sp.get('template');
    if (tid) {
      const tpl = TEMPLATES.find((t) => t.id === tid);
      if (tpl) { setParams(tpl.params); setTab('ia'); }
    }
  }, [sp]);

  const set = (p: Partial<GenerateParams>) => setParams((s) => ({ ...s, ...p }));

  async function generate() {
    setLoading(true); setError(null);
    try {
      const res = tab === 'ia'
        ? await api.generate(params)
        : await api.textToChat(text, params);
      setStory(res.story);
      router.push('/editor');
    } catch (e: any) {
      setError(e.message || 'Falha ao gerar. Verifique o backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Novo projeto</h1>

      <div className="flex gap-2">
        <button className={`chip ${tab === 'ia' ? 'chip-on' : ''}`} onClick={() => setTab('ia')}>✨ IA Total</button>
        <button className={`chip ${tab === 'text' ? 'chip-on' : ''}`} onClick={() => setTab('text')}>📝 Colar texto</button>
      </div>

      {tab === 'ia' ? (
        <div className="card space-y-5">
          <Field label="Categoria">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => set({ category: c })}
                  className={`chip ${params.category === c ? 'chip-on' : ''}`}>{c}</button>
              ))}
            </div>
          </Field>

          <Field label="Duração">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => set({ duration: d })}
                  className={`chip ${params.duration === d ? 'chip-on' : ''}`}>{d}s</button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Intensidade" value={params.intensity} options={INTENSITIES} onChange={(v) => set({ intensity: v as any })} />
            <Select label="Emoção" value={params.emotion} options={EMOTIONS} onChange={(v) => set({ emotion: v })} />
            <Select label="Final" value={params.ending} options={ENDINGS} onChange={(v) => set({ ending: v })} />
          </div>

          <Field label={`Nº de mensagens: ${params.messageCount}`}>
            <input type="range" min={6} max={30} value={params.messageCount}
              onChange={(e) => set({ messageCount: +e.target.value })} className="w-full accent-[#7C3AED]" />
          </Field>
        </div>
      ) : (
        <div className="card space-y-3">
          <Field label="Cole sua história ou conversa">
            <textarea className="input min-h-[200px]" value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Ex: Ontem minha vizinha bateu na porta às 3 da manhã pedindo açúcar…" />
          </Field>
          <p className="text-xs text-white/40">A IA divide em mensagens naturais, cria personagens e ajusta as pausas.</p>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p>}

      <button className="btn-primary w-full text-lg" disabled={loading || (tab === 'text' && !text.trim())} onClick={generate}>
        {loading ? '⏳ Gerando história…' : '🚀 Gerar história'}
      </button>
      <p className="text-center text-xs text-white/40">
        Tudo é tratado como ficção. Sem chave Gemini, usamos um gerador local de demonstração.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><span className="label">{label}</span>{children}</div>);
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}
