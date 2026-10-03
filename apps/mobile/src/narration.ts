import { useEffect, useRef, useState } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

/**
 * "Narrar com música": a música toca no fone enquanto a câmera grava SÓ a voz; na montagem a mesma música
 * entra no mesmo tempo (o vídeo final fica sincronizado). Não muda o modo de áudio do aparelho (a câmera já
 * deixa tocar e gravar juntos) e mantém a sessão de áudio ativa ao parar, para não desligar o microfone.
 */
export function useNarrationMusic(url: string | null, volume: number) {
  const player = useRef<AudioPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
    setError(null);
    if (!url) return;
    let p: AudioPlayer | null = null;
    try {
      // baixa antes: assim a música começa junto com a gravação (sem esperar a internet)
      p = createAudioPlayer(url, { downloadFirst: true, keepAudioSessionActive: true });
      player.current = p;
      const t = setInterval(() => {
        if (p?.isLoaded) {
          setReady(true);
          clearInterval(t);
        }
      }, 200);
      return () => {
        clearInterval(t);
        try {
          p?.pause();
          p?.remove();
        } catch {
          // já liberado
        }
        player.current = null;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, [url]);

  useEffect(() => {
    if (player.current) player.current.volume = Math.max(0.05, Math.min(1, volume));
  }, [volume, ready]);

  return {
    ready,
    error,
    /** chamar logo depois de começar a gravar: a música sai do começo */
    start() {
      const p = player.current;
      if (!p) return;
      void p.seekTo(0).then(() => p.play()).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    },
    stop() {
      try {
        player.current?.pause();
      } catch {
        // já parado
      }
    },
  };
}
