'use client';
import { useStudio } from '@/store/useStudioStore';
import { THEME_LIST } from '@/lib/themes';

export function AppearanceEditor() {
  const { story, setTheme, updateCharacter, settings, setSettings } = useStudio();
  if (!story) return null;

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <span className="label">Tema do chat (sem marcas oficiais)</span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEME_LIST.map((t) => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              className={`rounded-xl border-2 p-2 text-left transition ${story.theme === t.id ? 'border-brand' : 'border-white/10'}`}>
              <div className="mb-2 flex h-12 overflow-hidden rounded-lg">
                <div className="w-1/3" style={{ background: t.headerBg }} />
                <div className="flex-1" style={{ background: t.bg }} />
                <div className="w-1/4" style={{ background: t.bubbleOut }} />
              </div>
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <span className="label">Personagens</span>
        {story.characters.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <input type="color" value={c.avatarColor} className="h-9 w-9 rounded"
              onChange={(e) => updateCharacter(c.id, { avatarColor: e.target.value })} />
            <input className="input !w-40 !py-1.5" value={c.name}
              onChange={(e) => updateCharacter(c.id, { name: e.target.value })} />
            <select className="input !w-auto !py-1.5 text-sm" value={c.side}
              onChange={(e) => updateCharacter(c.id, { side: e.target.value as any })}>
              <option value="left">⬅️ Recebida</option>
              <option value="right">➡️ Enviada</option>
            </select>
            <label className="flex items-center gap-1 text-sm text-white/60">
              <input type="checkbox" checked={c.online} onChange={(e) => updateCharacter(c.id, { online: e.target.checked })} />
              online
            </label>
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        <span className="label">Ritmo & overlays</span>
        <label className="block text-sm text-white/70">
          Velocidade das mensagens: {settings.messageSpeed.toFixed(2)}×
          <input type="range" min={0.5} max={2} step={0.05} value={settings.messageSpeed}
            onChange={(e) => setSettings({ messageSpeed: +e.target.value })} className="w-full accent-[#7C3AED]" />
        </label>
        <Toggle label="Selo de ficção" v={settings.withFictionSeal} on={(v) => setSettings({ withFictionSeal: v })} />
        <Toggle label="Legendas estilo TikTok" v={settings.withCaptions} on={(v) => setSettings({ withCaptions: v })} />
        <Toggle label="Marca d'água" v={settings.withWatermark} on={(v) => setSettings({ withWatermark: v })} />
      </div>
    </div>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm text-white/70">{label}</span>
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="h-5 w-9 accent-[#7C3AED]" />
    </label>
  );
}
