import { MOOD_LABEL, MUSIC_LIBRARY, moodForPillar, pickTrack, trackById, type EditChoices, type MusicMood, type MusicTrack } from "@postai/domain";

/** A música que vai entrar (o servidor escolhe igual: mesmo clima e mesma semente = mesma faixa). */
export function chosenTrack(edit: EditChoices, contentId: string, pillarSlug: string, business: boolean): MusicTrack | null {
  if (edit.music === "none") return null;
  const exact = trackById(edit.music);
  if (exact) return exact;
  const mood = (edit.music in MOOD_LABEL ? edit.music : moodForPillar(pillarSlug, business)) as MusicMood;
  return pickTrack(mood, contentId);
}

/** Próxima faixa do mesmo clima (botão TROCAR). */
export function nextTrack(current: MusicTrack): MusicTrack {
  const pool = MUSIC_LIBRARY.filter((t) => t.mood === current.mood);
  return pool[(pool.findIndex((t) => t.id === current.id) + 1) % pool.length]!;
}

