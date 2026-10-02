/**
 * Música de fundo por clima. Faixas do Mixkit (Envato) — "Mixkit Stock Music Free License": uso livre em vídeos,
 * inclusive comerciais e redes sociais, sem crédito obrigatório; NÃO pode redistribuir a faixa avulsa.
 * Por isso o app nunca hospeda os arquivos: o servidor de montagem baixa da origem na hora e confere o sha256.
 */

export type MusicMood = "reflexao" | "motivacional" | "treino" | "familia" | "humor" | "empresa" | "calmo";

export const MOOD_LABEL: Record<MusicMood, string> = {
  reflexao: "Reflexão (piano)", motivacional: "Motivacional", treino: "Treino (energia)", familia: "Família (acústico)",
  humor: "Humor", empresa: "Vendas / produto", calmo: "Calmo",
};

export interface MusicTrack {
  id: string;
  mood: MusicMood;
  title: string;
  artist: string;
  url: string;
  sha256: string;
  durationSec: number;
  /** "comercial" = pode em conta de empresa/anúncio; "pessoal" = só perfil pessoal */
  license: "comercial" | "pessoal";
  /** batidas por minuto medidas no áudio (apps/worker/scripts/bpm.py); null = sem batida definida (piano/ambiente) */
  bpm: number | null;
  /** em alta nas redes: só com fonte; null = sem dado de tendência */
  trending: null;
}

const mk = (id: number, mood: MusicMood, title: string, artist: string, sha256: string, durationSec: number, bpm: number | null): MusicTrack =>
  // licença Mixkit Free: inclui uso comercial
  ({ id: `mixkit-${id}`, mood, title, artist, url: `https://assets.mixkit.co/music/${id}/${id}.mp3`, sha256, durationSec, license: "comercial", bpm, trending: null });

export const MUSIC_LICENSE = "Mixkit Stock Music Free License (https://mixkit.co/license/#musicFree)";

export const MUSIC_LIBRARY: readonly MusicTrack[] = [
  mk(22, "reflexao", "Piano Reflections", "Ahjay Stelino", "7d58c4255d91f58e29e61520b6011cabd5a54b3e89b54646cebac9d37295bbec", 199, 120),
  mk(601, "reflexao", "Skyline", "Eugenio Mininni", "2fcb36e7e58c4b6bc1505b7980237fdad86696589572a958bb6ee2084c592cc5", 206, null),
  mk(599, "reflexao", "Possible Dreams", "Eugenio Mininni", "ee6d055c20cccda716b6b63a154ef0dc825195b7061dc439abb8a623973f4798", 159, null),
  mk(32, "motivacional", "Driving Ambition", "Ahjay Stelino", "e3c88488e65b8c87a6f06120983ce2cb12ea3aeba99f8cadb7ee5d6d284ef2c6", 102, 100),
  mk(31, "motivacional", "Dreaming Big", "Ahjay Stelino", "8c89819547b42a80750fb25f37a960a1f45f6fd66bc8d784ac817b98b002897c", 110, null),
  mk(34, "motivacional", "Raising Me Higher", "Ahjay Stelino", "619b82cea299230cca5beac36d049291a1cb2be8ce0afdafda3e06fb30d06525", 98, 110),
  mk(1183, "treino", "Karma", "Michael Ramir C.", "56f331c37552486a1a31c65a443f1669ed37f7fb3bd99d9078d23ec55caa052f", 135, 128),
  mk(470, "treino", "Golden Storm", "Diego Nava", "32e5a363ce84f0b633579d0b10cf3c758ae3c02f5121147a321e2483e3384e26", 95, 127),
  mk(1000, "treino", "I Can Hear Your Heartbeat", "Michael Ramir C.", "a23c959605dc4a53f7e3b8c8949fcc0d082c29989b944bb2a7f8d9601ddca0d1", 110, 125),
  mk(839, "familia", "Tears of Joy", "Michael Ramir C.", "30717c4e8d2a954a6163477b831e5b8981b406d2c34d72820fce4d40a8686ddc", 140, 124),
  mk(963, "familia", "Just Keep Walking", "Michael Ramir C.", "fa93f4808cecc643eee8d74647bd8b823991f2155672b7d37f3db79f9beb7e16", 125, 96),
  mk(801, "familia", "Happy Home", "Michael Ramir C.", "76b82159ba1d6821a5ac9465e8ff19007446c1b657dfe53b5917fc8896b3bf21", 110, 140),
  mk(2, "humor", "Comical", "Ahjay Stelino", "2f5ed23f2c51b5aa28b237563ee1249d12094fefce7afdaddee4f5a330e010cb", 114, 140),
  mk(466, "humor", "Games Worldbeat", "Bernardo R.", "a1c70e5719bdfbe5dd8ec064939b27e3baed8c2b7f9375ae5b361e6ba71d4922", 107, null),
  mk(474, "empresa", "What About Action?", "Diego Nava", "4bcd99a13f3d71c6d356c2459f6f585f0d3f91ca8912aeef81ac626b8c8e3133", 117, 121),
  mk(729, "empresa", "Pop Track 03", "Lily J", "0bb90793c71a07e6d698afdd434b32ffb4fe93dbbdb0577d3e71a4de80b0337b", 97, 109),
  mk(1167, "empresa", "Close Up", "Michael Ramir C.", "a7f05a29d07a84d38072ccd2b35204bca812db86e75b2a837e71cc144d3e739b", 95, 105),
  mk(441, "calmo", "Meditation", "Arulo", "6ffb81be8ab2447eb7b9357d6ae3d1b58eb8bc85376a724fafa5fe4d1acf562a", 118, null),
  mk(175, "calmo", "Digital Clouds", "Alejandro Magaña (A. M.)", "71cd4ea39edcc7532672bd97311abadfd318d00e7a828310a88b4f57fad9cd48", 101, 129),
];

/** Clima automático pelo pilar do conteúdo (perfil pessoal) ou "empresa" (perfil de venda). */
export function moodForPillar(pillarSlug: string, business = false): MusicMood {
  if (business) return pillarSlug === "historias" ? "familia" : pillarSlug === "bastidores" ? "calmo" : "empresa";
  const map: Record<string, MusicMood> = {
    reflexao: "reflexao", "vida-real": "reflexao", academia: "treino", familia: "familia", humor: "humor", empreendedorismo: "motivacional",
  };
  return map[pillarSlug] ?? "motivacional";
}

/** Escolha estável por conteúdo (o mesmo vídeo remontado mantém a música), variando entre vídeos. */
export function pickTrack(mood: MusicMood, seed: string): MusicTrack {
  const pool = MUSIC_LIBRARY.filter((t) => t.mood === mood);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length]!;
}

export const trackById = (id: string): MusicTrack | undefined => MUSIC_LIBRARY.find((t) => t.id === id);

/** Música própria enviada pelo criador: id "own:<uuid>" (arquivo no armazenamento do perfil). */
export const OWN_MUSIC_PREFIX = "own:";
export const ownMusicId = (uuid: string) => `${OWN_MUSIC_PREFIX}${uuid}`;
export const ownMusicUuid = (id: string): string | null =>
  id.startsWith(OWN_MUSIC_PREFIX) && /^[0-9a-f-]{36}$/i.test(id.slice(OWN_MUSIC_PREFIX.length)) ? id.slice(OWN_MUSIC_PREFIX.length) : null;

export interface OwnMusic { id: string; titulo: string; comercial: boolean; storageKey: string }
