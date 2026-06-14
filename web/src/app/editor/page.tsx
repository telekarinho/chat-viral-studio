'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/store/useStudioStore';
import { api } from '@/lib/api';
import { ChatStage } from '@/components/ChatStage';
import { MessagesEditor } from '@/components/MessagesEditor';
import { AppearanceEditor } from '@/components/AppearanceEditor';
import { VoicePanel } from '@/components/VoicePanel';
import { ExportPanel } from '@/components/ExportPanel';
import { ViralScoreCard } from '@/components/ViralScoreCard';

type Tab = 'msgs' | 'look' | 'voice' | 'export' | 'score';

export default function EditorPage() {
  const router = useRouter();
  const { story, save, dirty } = useStudio();
  const [tab, setTab] = useState<Tab>('msgs');
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);

  // autosave (debounced) whenever dirty
  useEffect(() => {
    if (!dirty || !story) return;
    const t = setTimeout(() => { save().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [dirty, story, save]);

  // Gera a próxima parte (série) a partir da história aberta e já abre ela aqui.
  async function makeContinuation() {
    const cur = useStudio.getState().story;
    if (!cur || continuing) return;
    setContinuing(true);
    try {
      const r = await api.continueStory(cur, { duration: cur.targetDuration });
      if (!r?.story) throw new Error('sem resultado');
      useStudio.getState().setStory(r.story);
      setTab('msgs');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      alert('Não consegui criar a continuação: ' + (e.message || e));
    } finally {
      setContinuing(false);
    }
  }

  if (!story) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <p className="text-white/60">Nenhum projeto carregado.</p>
        <button className="btn-primary" onClick={() => router.push('/create')}>✨ Criar história</button>
      </div>
    );
  }

  const settings = useStudio.getState().settings;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className="bg-transparent text-2xl font-bold outline-none"
          value={story.title}
          onChange={(e) => useStudio.getState().patchStory({ title: e.target.value })}
        />
        <div className="flex items-center gap-2 text-sm">
          <span className={dirty ? 'text-amber-300' : 'text-emerald-400'}>
            {saving ? 'salvando…' : dirty ? '● não salvo' : '✓ salvo'}
          </span>
          <button className="btn-ghost" onClick={makeContinuation} disabled={continuing}
            title="Gera a próxima parte da série com os mesmos personagens">
            {continuing ? '⏳ Gerando…' : `🎬 Criar Parte ${(story.part || 1) + 1}`}
          </button>
          <button className="btn-ghost" onClick={async () => { setSaving(true); await save(); setSaving(false); }}>💾 Salvar</button>
        </div>
      </div>
      {story.part ? <p className="-mt-2 text-xs text-brand">📺 Você está na Parte {story.part} desta série.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ChatStage story={story} settings={settings} />
        </div>

        {/* editor tabs */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <TabBtn id="msgs"  cur={tab} set={setTab}>💬 Mensagens</TabBtn>
            <TabBtn id="look"  cur={tab} set={setTab}>🎨 Aparência</TabBtn>
            <TabBtn id="voice" cur={tab} set={setTab}>🎙️ Voz</TabBtn>
            <TabBtn id="score" cur={tab} set={setTab}>📈 Viral Score</TabBtn>
            <TabBtn id="export" cur={tab} set={setTab}>⬇️ Exportar</TabBtn>
          </div>

          {tab === 'msgs' && <MessagesEditor />}
          {tab === 'look' && <AppearanceEditor />}
          {tab === 'voice' && <VoicePanel />}
          {tab === 'score' && <ViralScoreCard />}
          {tab === 'export' && <ExportPanel />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ id, cur, set, children }: { id: Tab; cur: Tab; set: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <button className={`chip ${cur === id ? 'chip-on' : ''}`} onClick={() => set(id)}>{children}</button>
  );
}
