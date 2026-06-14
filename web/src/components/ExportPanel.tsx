'use client';
import { useState } from 'react';
import { useStudio } from '@/store/useStudioStore';
import { exportVideo, downloadBlob } from '@/lib/exporter';
import { exportMp4 } from '@/lib/ffmpegExporter';
import { exportMp4WebCodecs, webCodecsSupported } from '@/lib/webcodecsExporter';
import { narratorWav } from '@/lib/audio';
import { synthNarration, synthStory } from '@/lib/audio';
import { api } from '@/lib/api';
import { buildScript, buildSRT, buildThumbnail, downloadText, downloadDataUrl } from '@/lib/outputs';

export function ExportPanel() {
  const { story, settings, setSettings, audioBuffers, narratorBuffers, save } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<{ webm: Blob; mp4Url?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!story) return null;

  const narratorOn = settings.withNarrator === true;
  const narratorMissing = narratorOn && narratorBuffers.length === 0;

  // Prepara TUDO sozinho antes de exportar: gera as fotos faltantes e a narração.
  // Resiliente — se algo falhar, segue (foto vira placeholder, vídeo sai mudo).
  // Retorna quantas fotos NÃO geraram, pra avisar o usuário em vez de falhar calado.
  async function prepareAssets(): Promise<{ photoFails: number; reason: string }> {
    const get = useStudio.getState;
    // 1) fotos faltantes das mensagens de imagem (com 1 retry cada)
    const imgMsgs = (get().story?.messages || []).filter((m) => m.type === 'image' && !m.imageUrl);
    let photoFails = 0;
    let reason = '';
    for (let i = 0; i < imgMsgs.length; i++) {
      setStage(`Gerando as fotos… ${i + 1}/${imgMsgs.length}`); setProgress(0);
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const r = await api.genImage(imgMsgs[i].text || 'foto chocante de conversa de whatsapp');
          if (r?.dataUrl) { get().updateMessage(imgMsgs[i].id, { imageUrl: r.dataUrl }); ok = true; }
          else if (r?.reason) reason = r.reason;
        } catch (e: any) { reason = e?.message || String(e); }
      }
      if (!ok) photoFails++;
    }
    // 2) áudio — só gera se ainda não existe
    const voice = get().voice;
    if (settings.withNarrator && get().narratorBuffers.length === 0) {
      setStage('Escrevendo o roteiro da narração…'); setProgress(0);
      try {
        let script = get().story?.narration || '';
        try { const r = await api.narration(get().story!); if (r.narration?.trim()) { script = r.narration.trim(); get().patchStory({ narration: script }); } } catch { /* usa o roteiro atual */ }
        if (script.trim()) {
          const { buffers } = await synthNarration(script, voice, (d, t) => setStage(`Gerando a narração… ${d}/${t}`), settings.voiceSpeed ?? 1);
          if (buffers.length) get().setNarratorBuffers(buffers);
        }
      } catch { /* vídeo sai mudo */ }
    } else if (!settings.withNarrator && get().audioBuffers.size === 0) {
      try {
        const { messages, buffers } = await synthStory(get().story!, voice, (d, t) => setStage(`Gerando as vozes… ${d}/${t}`), settings.voiceSpeed ?? 1);
        get().setAudioBuffers(buffers, messages);
      } catch { /* vídeo sai mudo */ }
    }
    return { photoFails, reason };
  }

  // Export MP4 robusto (WebCodecs por hardware; ffmpeg.wasm de reserva). Tudo
  // automático: ao clicar, prepara fotos + narração e baixa o MP4 no fim.
  async function doExportMp4() {
    setBusy('mp4'); setProgress(0); setStage('Iniciando…'); setNotice(null);
    try {
      const { photoFails, reason } = await prepareAssets();
      if (photoFails > 0) {
        setNotice(`⚠️ ${photoFails} foto${photoFails > 1 ? 's' : ''} não gerou automaticamente. Motivo: ${reason || 'IA de imagem indisponível'}. O vídeo sai com um card neutro; você pode enviar a sua foto na aba Mensagens. ${/api key not valid|API_KEY_INVALID|400/i.test(reason) ? '➡️ Sua chave Gemini parece inválida — confira em Configurações.' : ''}`);
      }
      // lê o estado já preparado (fotos + buffers recém-gerados)
      const cur = useStudio.getState();
      const liveStory = cur.story!;
      const liveAudio = cur.audioBuffers;
      const liveNarrator = cur.narratorBuffers;
      setStage('Iniciando o vídeo…'); setProgress(0);
      const fast = await webCodecsSupported(settings.format);
      const run = fast ? exportMp4WebCodecs : exportMp4;
      let mp4: Blob;
      try {
        mp4 = await run(liveStory, settings, liveAudio, { narratorBuffers: liveNarrator, onProgress: setProgress, onStage: setStage });
      } catch (err) {
        // se o caminho rápido falhar no meio, tenta o ffmpeg.wasm como rede de segurança
        if (!fast) throw err;
        setStage('Caminho rápido indisponível — usando o motor de reserva…'); setProgress(0);
        mp4 = await exportMp4(liveStory, settings, liveAudio, { narratorBuffers: liveNarrator, onProgress: setProgress, onStage: setStage });
      }
      downloadBlob(mp4, `${slug(liveStory.title)}.mp4`);
      await useStudio.getState().save().catch(() => {});
    } catch (e: any) {
      alert('Falha ao exportar MP4: ' + (e?.message || e));
    } finally {
      setBusy(null); setStage(null);
    }
  }

  async function doExport() {
    setBusy('video'); setProgress(0); setResult(null);
    try {
      const res = await exportVideo(story!, settings, audioBuffers, {
        onProgress: setProgress,
        transcode: true,
        narratorBuffers,
      });
      setResult(res);
      // mark project as rendered + thumbnail
      const thumb = buildThumbnail(story!, settings);
      await useStudio.getState().save();
      void thumb;
    } catch (e: any) {
      alert('Falha na exportação: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  // 1-tap share — opens the native share sheet (TikTok / Reels / WhatsApp) on mobile,
  // falls back to download where the Web Share API isn't available (most desktops).
  async function shareVideo() {
    if (!result) return;
    const name = `${slug(story!.title)}.${result.mp4Url ? 'mp4' : 'webm'}`;
    const blob = result.mp4Url ? await fetch(result.mp4Url).then((r) => r.blob()) : result.webm;
    const file = new File([blob], name, { type: result.mp4Url ? 'video/mp4' : 'video/webm' });
    const nav = navigator as any;
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: story!.title, text: `${story!.caption}\n\n${story!.hashtags.join(' ')}` });
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // user cancelled
    }
    downloadBlob(blob, name);
    alert('Seu navegador não abre o menu de compartilhar — baixei o vídeo. No celular, use este botão para enviar direto pro TikTok/Reels/WhatsApp.');
  }

  return (
    <div className="space-y-5">
      {/* CTA principal — tudo automático, sempre visível no topo */}
      <div className="card space-y-3 border-brand/40 bg-brand/5">
        <button className="btn-primary w-full text-lg" onClick={doExportMp4} disabled={!!busy}>
          {busy === 'mp4' ? `🎬 ${stage || 'Renderizando'} ${Math.round(progress * 100)}%…` : '⬇️ Gerar tudo e baixar o MP4'}
        </button>
        {busy === 'mp4' && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-brand transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            {stage && <p className="text-center text-xs text-white/60">{stage}</p>}
          </>
        )}
        <p className="text-center text-xs text-white/40">
          Um clique faz tudo: gera as <b>fotos</b> que faltam, cria a <b>narração</b> e baixa o <b>.mp4</b> pronto pra postar.
        </p>
        {notice && (
          <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs leading-relaxed text-amber-200">{notice}</p>
        )}
      </div>

      <div className="card space-y-4">
        <span className="label">Painel de exportação</span>

        <div>
          <span className="text-xs text-white/50">Formato / qualidade</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['1080x1920', '720x1280', '2160x3840'] as const).map((f) => (
              <button key={f} onClick={() => setSettings({ format: f })}
                className={`chip ${settings.format === f ? 'chip-on' : ''}`}>
                {f === '1080x1920' ? '1080×1920 HD' : f === '720x1280' ? '720×1280 leve' : '4K (lento)'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Check label="Com legendas" v={settings.withCaptions} on={(v) => setSettings({ withCaptions: v })} />
          <Check label="Com marca d'água" v={settings.withWatermark} on={(v) => setSettings({ withWatermark: v })} />
          <Check label="Selo de ficção (no final)" v={settings.withFictionSeal} on={(v) => setSettings({ withFictionSeal: v })} />
          <Check label="Música de fundo" v={settings.withMusic} on={(v) => setSettings({ withMusic: v })} />
        </div>
      </div>

      {/* efeitos & reação */}
      <div className="card space-y-4">
        <span className="label">✨ Efeitos & Reação</span>

        <div>
          <span className="text-xs text-white/50">Efeito animado na tela</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {([
              ['none', 'Nenhum'], ['hearts', '❤️ Corações'], ['fire', '🔥 Fogo'],
              ['confetti', '🎉 Confete'], ['sparkles', '✨ Brilhos'],
            ] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSettings({ effect: v })}
                className={`chip ${(settings.effect || 'none') === v ? 'chip-on' : ''}`}>{label}</button>
            ))}
          </div>
        </div>

        <Check label="🔍 Zoom dramático (zoom lento durante o vídeo)" v={!!settings.dramaticZoom} on={(v) => setSettings({ dramaticZoom: v })} />

        <Check label="📷 Mostrar meu rosto (câmera no cantinho)" v={!!settings.withCamera} on={(v) => setSettings({ withCamera: v })} />
        {settings.withCamera && (
          <div>
            <span className="text-xs text-white/50">Posição da câmera</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {([
                ['tl', '↖ Sup. esq.'], ['tr', '↗ Sup. dir.'], ['bl', '↙ Inf. esq.'], ['br', '↘ Inf. dir.'],
              ] as const).map(([v, label]) => (
                <button key={v} onClick={() => setSettings({ cameraCorner: v })}
                  className={`chip ${(settings.cameraCorner || 'br') === v ? 'chip-on' : ''}`}>{label}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-white/40">O navegador vai pedir permissão da câmera no preview. Tudo é processado no seu aparelho.</p>
          </div>
        )}
      </div>

      {/* áudio & exportar */}
      <div className="card space-y-4">
        <span className="label">🔊 Áudio & Exportar</span>
        <label className="block text-sm text-white/70">Volume narração: {Math.round(settings.narrationVolume * 100)}%
          <input type="range" min={0} max={1} step={0.05} value={settings.narrationVolume}
            onChange={(e) => setSettings({ narrationVolume: +e.target.value })} className="w-full accent-[#7C3AED]" />
        </label>
        {settings.withMusic && (
          <label className="block text-sm text-white/70">Volume música: {Math.round(settings.musicVolume * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
              onChange={(e) => setSettings({ musicVolume: +e.target.value })} className="w-full accent-[#7C3AED]" />
          </label>
        )}

        {narratorMissing && (
          <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-xs text-emerald-200">
            🎙️ A narração é gerada automaticamente ao exportar. (Quer ouvir antes? Vá na aba <b>Voz</b>.)
          </p>
        )}
        <button className="btn-ghost w-full" onClick={doExport} disabled={!!busy}>
          {busy === 'video' ? `Renderizando ${Math.round(progress * 100)}%…` : 'Exportar WebM (modo rápido/antigo)'}
        </button>
        {narratorBuffers.length > 0 && (
          <button className="btn-ghost w-full" onClick={() => {
            const wav = narratorWav(narratorBuffers);
            if (wav) downloadBlob(wav, `${slug(story!.title)}-narracao.wav`);
          }}>
            🔊 Baixar só o áudio da narração (.wav) — plano B garantido
          </button>
        )}
        {busy === 'video' && (
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <p className="text-center text-xs text-white/40">
          🚀 Um clique faz tudo: gera as <b>fotos</b> que faltam, cria a <b>narração</b> e exporta. Sai um <b>.mp4</b> real (H.264 + AAC, codificado por hardware no seu aparelho) que abre em qualquer player e funciona em TikTok/Reels/CapCut. O <b>WebM</b> abaixo é só o modo antigo de reserva.
        </p>
      </div>

      {result && (
        <div className="card space-y-3">
          <p className="font-semibold text-emerald-400">✓ Vídeo pronto!</p>
          {result.mp4Url ? (
            <>
              <video src={result.mp4Url} controls className="mx-auto max-h-[50vh] rounded-xl" />
              <a className="btn-primary w-full" href={result.mp4Url} download>⬇️ Baixar MP4</a>
            </>
          ) : (
            <>
              <p className="text-sm text-amber-300">Backend FFmpeg indisponível — baixe o WebM (funciona em TikTok/Reels):</p>
              <button className="btn-primary w-full" onClick={() => downloadBlob(result.webm, `${slug(story.title)}.webm`)}>⬇️ Baixar WebM</button>
            </>
          )}
          <button className="btn-ghost w-full text-lg" onClick={shareVideo}>📤 Compartilhar (TikTok / Reels / WhatsApp)</button>
        </div>
      )}

      <div className="card grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button className="btn-ghost" onClick={() => downloadText(buildScript(story), `${slug(story.title)}-roteiro.txt`)}>📄 Roteiro</button>
        <button className="btn-ghost" onClick={() => downloadText(buildSRT(story, settings), `${slug(story.title)}.srt`)}>💬 Legenda SRT</button>
        <button className="btn-ghost" onClick={() => downloadDataUrl(buildThumbnail(story, settings), `${slug(story.title)}-thumb.png`)}>🖼️ Thumbnail</button>
        <button className="btn-ghost" onClick={() => downloadText(story.caption + '\n\n' + story.hashtags.join(' '), `${slug(story.title)}-descricao.txt`)}>✍️ Descrição</button>
        <button className="btn-ghost" onClick={() => save()}>💾 Salvar projeto</button>
      </div>
    </div>
  );
}

function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white/70">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="accent-[#7C3AED]" />
      {label}
    </label>
  );
}
function slug(s: string) { return (s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40); }
