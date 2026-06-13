'use client';
import { useEffect, useState } from 'react';
import { getConfig, setConfig, type AppConfig } from '@/lib/config';
import { useStudio } from '@/store/useStudioStore';
import { api } from '@/lib/api';

const VOICES = [
  { id: 'narrador_masc', label: 'Narrador masculino' },
  { id: 'narradora_fem', label: 'Narradora feminina' },
  { id: 'voz_engracada', label: 'Voz engraçada' },
  { id: 'voz_suspense', label: 'Voz suspense' },
  { id: 'voz_drama', label: 'Voz dramática leve' },
  { id: 'voz_tiktok', label: 'Voz acelerada TikTok' },
  { id: 'voz_calma', label: 'Voz calma' },
  { id: 'voz_jovem', label: 'Voz jovem' },
];

export default function ConfigPage() {
  const { voice, setVoice, settings, setSettings } = useStudio();
  const [cfg, setCfg] = useState<AppConfig>({ geminiKey: '', geminiModel: '', googleTtsKey: '' });
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => { setCfg(getConfig()); }, []);

  function save() {
    setConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function testVoice() {
    setTesting(true); setTestMsg(null);
    try {
      // persist first so the key is sent with the request
      setConfig(cfg);
      const r = await api.tts('Essa é a voz da sua narração no Chat Viral Studio.', voice, 'alegria');
      if (r.mock) { setTestMsg('⚠️ Sem chave válida — tocando placeholder. Cole sua chave do Google TTS acima.'); }
      else { setTestMsg('✓ Voz real gerada com sua chave!'); }
      const audio = new Audio(`data:${r.mime};base64,${r.audioContent}`);
      await audio.play().catch(() => {});
    } catch (e: any) {
      setTestMsg('Falha: ' + e.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">⚙️ Configurações</h1>
      <p className="text-sm text-white/50">
        Suas chaves ficam salvas <strong>só neste navegador</strong> e são enviadas apenas para a
        própria API do app para gerar histórias e narração. Nada é compartilhado.
      </p>

      {/* AI keys */}
      <div className="card space-y-4">
        <span className="label">🤖 Chaves de IA</span>

        <Field label="Gemini API Key (gera as histórias)"
          hint={<>Pegue grátis em <a className="text-brand underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">aistudio.google.com/app/apikey</a></>}>
          <input type={show ? 'text' : 'password'} value={cfg.geminiKey} placeholder="AIza…"
            onChange={(e) => setCfg({ ...cfg, geminiKey: e.target.value })}
            className="input w-full" autoComplete="off" />
        </Field>

        <Field label="Modelo Gemini (opcional)" hint="Padrão: gemini-1.5-flash">
          <input type="text" value={cfg.geminiModel} placeholder="gemini-1.5-flash"
            onChange={(e) => setCfg({ ...cfg, geminiModel: e.target.value })}
            className="input w-full" autoComplete="off" />
        </Field>

        <Field label="Google TTS API Key (voz da narração)"
          hint={<>Console: <a className="text-brand underline" href="https://console.cloud.google.com/apis/library/texttospeech.googleapis.com" target="_blank" rel="noreferrer">ativar Text-to-Speech</a></>}>
          <input type={show ? 'text' : 'password'} value={cfg.googleTtsKey} placeholder="AIza…"
            onChange={(e) => setCfg({ ...cfg, googleTtsKey: e.target.value })}
            className="input w-full" autoComplete="off" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-[#7C3AED]" />
          Mostrar chaves
        </label>
      </div>

      {/* default voice */}
      <div className="card space-y-3">
        <span className="label">🎙️ Voz padrão da narração</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {VOICES.map((v) => (
            <button key={v.id} onClick={() => setVoice(v.id)}
              className={`rounded-xl border p-2 text-sm transition ${voice === v.id ? 'border-brand bg-brand/20' : 'border-white/10'}`}>
              🎙️ {v.label}
            </button>
          ))}
        </div>
        <button className="btn-ghost w-full" onClick={testVoice} disabled={testing}>
          {testing ? '🎧 Testando…' : '▶️ Testar voz'}
        </button>
        {testMsg && <p className="text-center text-sm text-white/70">{testMsg}</p>}
      </div>

      {/* watermark */}
      <div className="card space-y-3">
        <span className="label">🏷️ Marca d'água</span>
        <input type="text" value={settings.watermarkText || ''} placeholder="Chat Viral Studio"
          onChange={(e) => setSettings({ watermarkText: e.target.value })}
          className="input w-full" maxLength={40} />
        <p className="text-xs text-white/40">Aparece no canto do vídeo quando "Com marca d'água" está ligado na exportação.</p>
      </div>

      <button className="btn-primary w-full text-lg" onClick={save}>
        {saved ? '✓ Salvo!' : '💾 Salvar configurações'}
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-sm text-white/70">{label}</span>
      {children}
      {hint && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  );
}
