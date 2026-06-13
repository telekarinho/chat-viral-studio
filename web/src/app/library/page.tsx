'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useStudio } from '@/store/useStudioStore';

interface Row {
  id: string; title: string; status: string; duration: number;
  format: string; thumbnail?: string; updatedAt: number;
}

export default function LibraryPage() {
  const router = useRouter();
  const load = useStudio((s) => s.load);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const { projects } = await api.listProjects();
      setRows(projects || []);
      setError(null);
    } catch (e: any) {
      setError('Backend offline — projetos salvos localmente continuam no editor.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function open(id: string) {
    await load(id);
    router.push('/editor');
  }
  async function del(id: string) {
    if (!confirm('Apagar este projeto?')) return;
    await api.deleteProject(id).catch(() => {});
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📚 Biblioteca</h1>
        <button className="btn-primary" onClick={() => router.push('/create')}>✨ Novo</button>
      </div>

      {error && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>}
      {loading ? (
        <p className="text-white/50">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="card text-center text-white/50">
          Nenhum projeto ainda. <button className="text-brand" onClick={() => router.push('/create')}>Crie o primeiro →</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className="card space-y-3">
              <div className="grid aspect-[9/16] max-h-56 place-items-center overflow-hidden rounded-xl bg-black/40">
                {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="text-4xl opacity-40">🎬</span>}
              </div>
              <div>
                <p className="truncate font-semibold">{p.title}</p>
                <p className="text-xs text-white/45">
                  {p.status} · {p.format} · {p.duration ? `${p.duration.toFixed(0)}s` : '—'} · {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => open(p.id)}>Abrir</button>
                <button className="btn-ghost text-red-300" onClick={() => del(p.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
