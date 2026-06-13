'use client';
import { useState } from 'react';
import { useStudio } from '@/store/useStudioStore';
import { api } from '@/lib/api';

const METRICS: { k: string; label: string }[] = [
  { k: 'hook', label: 'Gancho' },
  { k: 'curiosity', label: 'Curiosidade' },
  { k: 'retention', label: 'Retenção' },
  { k: 'emotion', label: 'Emoção' },
  { k: 'ending', label: 'Final' },
  { k: 'part2', label: 'Parte 2' },
];

export function ViralScoreCard() {
  const { story, patchStory } = useStudio();
  const [loading, setLoading] = useState(false);
  if (!story) return null;
  const vs = story.viralScore;

  async function analyze() {
    setLoading(true);
    try {
      const { viralScore } = await api.viralScore(story!);
      patchStory({ viralScore });
    } catch (e: any) {
      alert('Falha ao analisar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <span className="label !mb-0">Módulo de viralização</span>
        <button className="btn-ghost" onClick={analyze} disabled={loading}>{loading ? '…' : '🔍 Analisar'}</button>
      </div>

      {!vs ? (
        <p className="text-sm text-white/50">Clique em <b>Analisar</b> para receber nota 0–100 e sugestões.</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="relative grid h-24 w-24 place-items-center rounded-full"
              style={{ background: `conic-gradient(#7C3AED ${vs.total * 3.6}deg, rgba(255,255,255,.1) 0)` }}>
              <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-brand-panel">
                <span className="text-2xl font-extrabold">{vs.total}</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {METRICS.map((m) => (
                <div key={m.k} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-white/55">{m.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(vs as any)[m.k]}%` }} />
                  </div>
                  <span className="w-7 text-right text-white/60">{(vs as any)[m.k]}</span>
                </div>
              ))}
            </div>
          </div>

          {vs.suggestions?.length > 0 && (
            <ul className="space-y-1 text-sm text-white/70">
              {vs.suggestions.map((s, i) => <li key={i}>💡 {s}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
