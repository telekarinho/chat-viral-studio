'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useStudio } from '@/store/useStudioStore';
import type { ShopScript, Story } from '@/lib/types';

const ROLES = [
  { v: 'afiliado', label: '🤝 Afiliado / Creator', hint: 'Divulga produto de outros (inclui #publi)' },
  { v: 'vendedor', label: '🏪 Vendedor (loja própria)', hint: 'CTA pro seu próprio produto' },
  { v: 'ambos', label: '🔀 Os dois', hint: 'Afiliado e loja própria' },
];
const FORMATS = [
  { v: 'both', label: '✨ Os dois', hint: 'Roteiro UGC + vídeo chat' },
  { v: 'script', label: '🎬 Roteiro UGC', hint: 'Falar na câmera' },
  { v: 'chat', label: '💬 Chat shoppable', hint: 'Vídeo de conversa' },
];
const DURS = [15, 30, 45, 60];

export default function ShopPage() {
  const router = useRouter();

  const [product, setProduct] = useState('');
  const [benefits, setBenefits] = useState('');
  const [offer, setOffer] = useState('');
  const [audience, setAudience] = useState('');
  const [role, setRole] = useState('ambos');
  const [format, setFormat] = useState('both');
  const [duration, setDuration] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<ShopScript | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    if (!product.trim()) { setError('Diz qual é o produto primeiro 🙂'); return; }
    setLoading(true); setError(null); setScript(null); setStory(null);
    try {
      const r = await api.shop({ product, benefits, offer, audience, role, format, duration });
      setScript(r.script || null);
      setStory(r.story || null);
      if (!r.script && !r.story) setError('Não consegui gerar agora — tenta de novo.');
    } catch (e: any) {
      setError('Falha: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  function openInEditor() {
    if (!story) return;
    useStudio.getState().setStory(story);   // abre o chat shoppable no editor de vídeo
    router.push('/editor');
  }

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  const scriptFull = script ? [
    `GANCHO: ${script.hook}`, `PROBLEMA: ${script.problem}`, `SOLUÇÃO: ${script.solution}`,
    `PROVA: ${script.proof}`, `CTA: ${script.cta}`,
    `TEXTOS NA TELA: ${(script.onScreenText || []).join(' | ')}`,
    `LEGENDA: ${script.caption}`, `HASHTAGS: ${(script.hashtags || []).join(' ')}`,
    `AVISO: ${script.disclosure}`,
  ].join('\n') : '';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🛍️ TikTok Shop</h1>
        <p className="text-sm text-white/50">Gera conteúdo que VENDE — roteiro pra gravar e/ou vídeo de chat — dentro das regras de Shop/afiliado.</p>
      </div>

      <div className="card space-y-4">
        <Field label="Produto">
          <input className="input w-full" value={product} placeholder="Ex: Mini liquidificador portátil"
            onChange={(e) => setProduct(e.target.value)} />
        </Field>
        <Field label="Benefícios / dor que resolve">
          <textarea className="input min-h-[90px] w-full" value={benefits}
            placeholder="Ex: faz vitamina em qualquer lugar, recarrega no USB, fácil de limpar, cabe na bolsa"
            onChange={(e) => setBenefits(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Oferta / preço (opcional)">
            <input className="input w-full" value={offer} placeholder="Ex: de R$120 por R$79"
              onChange={(e) => setOffer(e.target.value)} />
          </Field>
          <Field label="Público (opcional)">
            <input className="input w-full" value={audience} placeholder="Ex: quem treina, mães, estudantes"
              onChange={(e) => setAudience(e.target.value)} />
          </Field>
        </div>

        <Field label="Você vende como">
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((r) => (
              <button key={r.v} onClick={() => setRole(r.v)}
                className={`rounded-xl border p-2 text-left text-sm transition ${role === r.v ? 'border-brand bg-brand/20' : 'border-white/10'}`}>
                <div className="font-medium">{r.label}</div>
                <div className="text-xs text-white/45">{r.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Formato">
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMATS.map((f) => (
              <button key={f.v} onClick={() => setFormat(f.v)}
                className={`rounded-xl border p-2 text-left text-sm transition ${format === f.v ? 'border-brand bg-brand/20' : 'border-white/10'}`}>
                <div className="font-medium">{f.label}</div>
                <div className="text-xs text-white/45">{f.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Duração">
          <div className="flex flex-wrap gap-2">
            {DURS.map((d) => (
              <button key={d} onClick={() => setDuration(d)}
                className={`chip ${duration === d ? 'chip-on' : ''}`}>{d}s</button>
            ))}
          </div>
        </Field>
      </div>

      {error && <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p>}

      <button className="btn-primary w-full text-lg" disabled={loading} onClick={generate}>
        {loading ? '⏳ Gerando conteúdo que vende…' : '🚀 Gerar conteúdo TikTok Shop'}
      </button>

      {script && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="label">🎬 Roteiro pra gravar (UGC)</span>
            <button className="btn-ghost !py-1 text-sm" onClick={() => copy('script', scriptFull)}>
              {copied === 'script' ? '✓ Copiado' : '📋 Copiar roteiro'}
            </button>
          </div>
          <ScriptRow label="Gancho (0–3s)" text={script.hook} />
          <ScriptRow label="Problema" text={script.problem} />
          <ScriptRow label="Solução" text={script.solution} />
          <ScriptRow label="Prova" text={script.proof} />
          <ScriptRow label="CTA" text={script.cta} />
          {!!(script.onScreenText || []).length && (
            <div>
              <span className="text-xs text-white/50">Textos na tela</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {script.onScreenText.map((t, i) => <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t}</span>)}
              </div>
            </div>
          )}
          <ScriptRow label="Legenda" text={script.caption} />
          <p className="text-sm text-white/60">{(script.hashtags || []).join(' ')}</p>
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200">⚠️ {script.disclosure}</p>
        </div>
      )}

      {story && (
        <div className="card space-y-3">
          <span className="label">💬 Vídeo chat shoppable</span>
          <p className="text-sm text-white/70">{story.title}</p>
          <p className="text-xs text-white/45">{story.messages?.length || 0} mensagens · pronto pra virar vídeo (vozes, narração e export no editor).</p>
          <button className="btn-primary w-full" onClick={openInEditor}>✏️ Abrir vídeo no editor</button>
        </div>
      )}

      <p className="text-center text-xs text-white/40">
        Sem chave Gemini, geramos um modelo de demonstração. O conteúdo segue as regras de TikTok Shop/afiliado
        (honestidade, sem promessa milagrosa, aviso de publicidade). Confira sempre antes de postar.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><span className="label">{label}</span>{children}</div>);
}
function ScriptRow({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <span className="text-xs text-white/50">{label}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}
