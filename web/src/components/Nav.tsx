'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Início', icon: '🏠' },
  { href: '/create', label: 'Criar', icon: '✨' },
  { href: '/editor', label: 'Editor', icon: '✏️' },
  { href: '/record', label: 'Narrar', icon: '🎙️' },
  { href: '/library', label: 'Biblioteca', icon: '📚' },
  { href: '/configuracoes', label: 'Config', icon: '⚙️' },
];

export function Nav() {
  const path = usePathname();
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <>
      {/* desktop rail */}
      <nav className="fixed left-0 top-0 z-40 hidden h-screen w-20 flex-col items-center gap-2 border-r border-white/5 bg-brand-panel py-5 md:flex">
        <div className="mb-4 text-2xl">🎬</div>
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${
              active(it.href) ? 'bg-brand text-white' : 'text-white/55 hover:bg-white/5'}`}>
            <span className="text-xl">{it.icon}</span>{it.label}
          </Link>
        ))}
      </nav>
      {/* mobile bottom bar */}
      <nav className="fixed bottom-0 left-0 z-40 flex w-full justify-around border-t border-white/10 bg-brand-panel/95 py-2 backdrop-blur md:hidden">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex flex-col items-center gap-0.5 text-[10px] ${active(it.href) ? 'text-brand' : 'text-white/55'}`}>
            <span className="text-lg">{it.icon}</span>{it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
