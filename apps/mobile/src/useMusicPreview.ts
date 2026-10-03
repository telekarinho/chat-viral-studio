import { useCallback, useEffect, useRef, useState } from "react";
import { createVideoPlayer, type VideoPlayer } from "expo-video";

/**
 * Mini player da biblioteca de música: UMA faixa por vez (tocar outra para a anterior), o player só é criado ao
 * tocar e é liberado ao parar/trocar/sair — a lista pode ter 50 faixas sem 50 players abertos.
 * Com voz: toca junto a 1ª parte gravada (prévia aproximada; o vídeo final ainda abaixa a música sob a fala).
 * Não usar na tela de gravação (este player muda o áudio do aparelho para "só tocar").
 */
export function useMusicPreview() {
  const players = useRef<VideoPlayer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    for (const p of players.current) {
      try {
        p.pause();
        p.release();
      } catch {
        // já liberado
      }
    }
    players.current = [];
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  /** Toca `id` (ou para, se já for ela). startS = trecho escolhido; volume relativo à voz. */
  const toggle = useCallback(async (id: string, url: string | null | Promise<string | null>, opts: { volume: number; startS?: number; voiceUri?: string | null }) => {
    if (playing === id) return stop();
    stop();
    setError(null);
    try {
      const src = await url;
      if (!src) throw new Error("faixa indisponível agora");
      const music = createVideoPlayer(src);
      music.volume = opts.voiceUri ? opts.volume : Math.max(opts.volume, SOLO_MIN_VOLUME);
      if (opts.startS) music.currentTime = opts.startS;
      players.current.push(music);
      if (opts.voiceUri) {
        const voice = createVideoPlayer(opts.voiceUri);
        voice.volume = 1;
        players.current.push(voice);
        voice.play();
      }
      music.play();
      setPlaying(id);
      timer.current = setTimeout(stop, PREVIEW_MS);
    } catch (e) {
      setError(`Não consegui tocar: ${e instanceof Error ? e.message : String(e)}`);
      stop();
    }
  }, [playing, stop]);

  return { playing, error, toggle, stop };
}

/** sozinha a música toca mais alto (dá para ouvir); com a voz, no volume do vídeo */
const SOLO_MIN_VOLUME = 0.6;
const PREVIEW_MS = 30_000;
