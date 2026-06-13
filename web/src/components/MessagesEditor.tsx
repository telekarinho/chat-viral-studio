'use client';
import { useStudio } from '@/store/useStudioStore';
import type { MsgType, MsgStatus } from '@/lib/types';

const TYPES: { v: MsgType; label: string }[] = [
  { v: 'text', label: 'Texto' },
  { v: 'audio', label: '🎤 Áudio fake' },
  { v: 'image', label: '🖼️ Print fake' },
  { v: 'call_missed', label: '📞 Chamada perdida' },
  { v: 'deleted', label: '🚫 Apagada' },
  { v: 'sticker', label: '🩷 Figurinha' },
  { v: 'system', label: '— Sistema' },
];
const STATUS: MsgStatus[] = ['sent', 'delivered', 'read'];

export function MessagesEditor() {
  const { story, updateMessage, addMessage, removeMessage, moveMessage } = useStudio();
  if (!story) return null;

  return (
    <div className="space-y-3">
      {story.messages.map((m, i) => {
        const ch = story.characters.find((c) => c.id === m.sender);
        return (
          <div key={m.id} className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">#{i + 1}</span>
                <select className="input !w-auto !py-1 text-sm" value={m.sender}
                  onChange={(e) => updateMessage(m.id, { sender: e.target.value })}>
                  {story.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="input !w-auto !py-1 text-sm" value={m.type}
                  onChange={(e) => updateMessage(m.id, { type: e.target.value as MsgType })}>
                  {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex gap-1 text-sm">
                <button className="btn-ghost !px-2 !py-1" onClick={() => moveMessage(m.id, -1)} title="Subir">↑</button>
                <button className="btn-ghost !px-2 !py-1" onClick={() => moveMessage(m.id, 1)} title="Descer">↓</button>
                <button className="btn-ghost !px-2 !py-1 text-red-300" onClick={() => removeMessage(m.id)} title="Remover">🗑</button>
              </div>
            </div>

            {m.type !== 'call_missed' && m.type !== 'deleted' && (
              <textarea className="input min-h-[44px]" value={m.text}
                onChange={(e) => updateMessage(m.id, { text: e.target.value })} placeholder="Texto da mensagem…" />
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-xs text-white/50">Hora
                <input className="input !py-1 text-sm" value={m.time}
                  onChange={(e) => updateMessage(m.id, { time: e.target.value })} />
              </label>
              <label className="text-xs text-white/50">Delay (s)
                <input className="input !py-1 text-sm" type="number" step="0.1" min="0.3" value={m.delay}
                  onChange={(e) => updateMessage(m.id, { delay: +e.target.value })} />
              </label>
              <label className="text-xs text-white/50">Emoção
                <select className="input !py-1 text-sm" value={m.emotion}
                  onChange={(e) => updateMessage(m.id, { emotion: e.target.value as any })}>
                  {['neutro','alegria','raiva','medo','surpresa','tristeza','ironia'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="text-xs text-white/50">Visto
                <select className="input !py-1 text-sm" value={m.status}
                  onChange={(e) => updateMessage(m.id, { status: e.target.value as MsgStatus })}>
                  {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <button className="text-xs text-brand" onClick={() => addMessage(m.id)}>+ inserir mensagem abaixo</button>
          </div>
        );
      })}
      <button className="btn-ghost w-full" onClick={() => addMessage()}>+ Adicionar mensagem</button>
    </div>
  );
}
