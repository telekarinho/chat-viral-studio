import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { createVideoPlayer, type VideoPlayer } from "expo-video";
import type { MusicTrack } from "@postai/domain";
import { Button, colors, s } from "../ui";

const PREVIEW_MS = 15_000;

/**
 * Prévia da mistura: a sua voz (1ª parte gravada) com a música no volume e na entrada escolhidos.
 * Na montagem final a música ainda abaixa sozinha quando você fala (ducking) — aqui é só para ouvir o clima.
 */
export function MusicPreview({ track, volume, entradaS, voiceUri }: { track: MusicTrack; volume: number; entradaS: number; voiceUri: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<VideoPlayer[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    players.current.forEach((p) => {
      try {
        p.pause();
        p.release();
      } catch {
        // já liberado
      }
    });
    players.current = [];
    setPlaying(false);
  };
  useEffect(() => stop, []);

  const play = () => {
    stop();
    setError(null);
    try {
      const music = createVideoPlayer(track.url);
      music.volume = volume;
      players.current.push(music);
      if (voiceUri) {
        const voice = createVideoPlayer(voiceUri);
        voice.volume = 1;
        players.current.push(voice);
        voice.play();
      }
      timers.current.push(setTimeout(() => music.play(), Math.max(0, entradaS) * 1000));
      timers.current.push(setTimeout(stop, PREVIEW_MS + Math.max(0, entradaS) * 1000));
      setPlaying(true);
    } catch (e) {
      setError(`Não consegui tocar a prévia: ${e instanceof Error ? e.message : String(e)}`);
      stop();
    }
  };

  return (
    <>
      <Button compact variant="secondary" label={playing ? "■ PARAR PRÉVIA" : voiceUri ? "▶ OUVIR PRÉVIA (sua voz + música)" : "▶ OUVIR A MÚSICA"} onPress={playing ? stop : play} testID="music-preview" />
      <Text style={s.muted}>{`Volume da música ${Math.round(volume * 100)}%${entradaS > 0 ? `, entra aos ${entradaS}s` : ""}. No vídeo final ela abaixa sozinha quando você fala.`}</Text>
      {error ? <Text style={{ color: colors.bad }}>{error}</Text> : null}
    </>
  );
}
