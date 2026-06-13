'use client';
import Link from 'next/link';
import { TEMPLATES } from '@/lib/templates';
import { useStudio } from '@/store/useStudioStore';

export default function Dashboard() {
  const story = useStudio((s) => s.story);

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-gradient-to-br from-brand to-fuchsia-600 p-8 shadow-glow">
        <h1 className="text-3xl font-extrabold md:text-4xl">🎬 Chat Viral Studio</h1>
        <p className="mt-2 max-w-xl text-white/85">
          Crie vídeos verticais virais de histórias <b>fictícias</b> em formato de chat.
          IA escreve, a voz narra, você exporta MP4 pronto para TikTok, Reels e Shorts.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/create" className="btn bg-white font-bold text-brand">✨ Gerar com IA</Link>
          <Link href="/create?tab=text" className="btn-ghost bg-black/20">📝 Colar texto</Link>
          {story && <Link href="/editor" className="btn-ghost bg-black/20">✏️ Continuar projeto</Link>}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-xl font-bold">Comece por um modo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ModeCard href="/create" icon="✨" title="Modo IA Total" desc="Escolha tema e duração, a IA cria tudo." />
          <ModeCard href="/create?tab=text" icon="📝" title="Texto + IA" desc="Cole sua história e vire chat animado." />
          <ModeCard href="/record" icon="🎙️" title="Eu Narrando" desc="Teleprompter + grava sua voz e câmera." />
          <ModeCard href="/record?mode=reaction" icon="🤳" title="Reação c/ Câmera" desc="Sua câmera + conversa rolando." />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Templates prontos</h2>
          <Link href="/library" className="text-sm text-brand">Ver biblioteca →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TEMPLATES.map((tpl) => (
            <Link key={tpl.id} href={`/create?template=${tpl.id}`}
              className="card flex flex-col gap-2 transition hover:border-brand hover:shadow-glow">
              <span className="text-3xl">{tpl.emoji}</span>
              <span className="text-sm font-semibold leading-tight">{tpl.title}</span>
              <span className="text-xs text-white/45">{tpl.params.duration}s · {tpl.params.intensity}</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="rounded-xl border border-white/10 bg-brand-panel/50 p-3 text-center text-xs text-white/40">
        ⚖️ Todas as histórias são dramatizações fictícias para entretenimento. Layout inspirado em
        apps de mensagem, sem marcas oficiais.
      </footer>
    </div>
  );
}

function ModeCard({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card group flex flex-col gap-2 transition hover:border-brand hover:shadow-glow">
      <span className="text-3xl">{icon}</span>
      <span className="font-bold">{title}</span>
      <span className="text-sm text-white/50">{desc}</span>
    </Link>
  );
}
