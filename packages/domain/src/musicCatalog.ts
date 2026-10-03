import { MOOD_LABEL, MUSIC_LIBRARY, ownMusicId, pickTrack, type MusicMood, type MusicTrack, type OwnMusic } from "./music";

/** Uma linha da biblioteca de música (faixa licenciada ou música própria do perfil). */
export interface MusicRow {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  bpm: number | null;
  mood: MusicMood | null;
  /** "comercial" pode em empresa; própria = licença DECLARADA pelo criador */
  license: "comercial" | "pessoal";
  own: OwnMusic | null;
  url: string | null;
}

export const MUSIC_TABS = ["para_voce", "favoritas", "recentes", "todas", "minhas"] as const;
export type MusicTab = (typeof MUSIC_TABS)[number] | MusicMood;
export const MUSIC_TAB_LABEL: Record<(typeof MUSIC_TABS)[number], string> = {
  para_voce: "Para você", favoritas: "♥ Favoritas", recentes: "Recentes", todas: "Todas", minhas: "Minhas músicas",
};

const fromTrack = (t: MusicTrack): MusicRow => ({ id: t.id, title: t.title, artist: t.artist, durationSec: t.durationSec, bpm: t.bpm, mood: t.mood, license: t.license, own: null, url: t.url });
const fromOwn = (m: OwnMusic): MusicRow => ({ id: ownMusicId(m.id), title: m.titulo, artist: "Minha música", durationSec: null, bpm: null, mood: null, license: m.comercial ? "comercial" : "pessoal", own: m, url: null });

/** Tudo que este perfil pode usar: empresa só vê o que tem licença comercial. */
export function musicCatalog(own: readonly OwnMusic[], business: boolean): MusicRow[] {
  return [...own.map(fromOwn), ...MUSIC_LIBRARY.map(fromTrack)].filter((r) => !business || r.license === "comercial");
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca instantânea: título, artista, clima, "minha", ou número = BPM aproximado (±10). */
export function searchMusic(rows: readonly MusicRow[], query: string): MusicRow[] {
  const q = plain(query.trim());
  if (!q) return [...rows];
  const bpm = /^\d{2,3}$/.test(q) ? Number(q) : null;
  return rows.filter((r) => {
    if (bpm !== null) return r.bpm !== null && Math.abs(r.bpm - bpm) <= 10;
    const hay = plain([r.title, r.artist, r.mood ? `${r.mood} ${MOOD_LABEL[r.mood]}` : "", r.own ? "minha minhas propria" : ""].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}

export interface MusicContext {
  favorites: readonly string[];
  /** usadas nos últimos vídeos, mais recente primeiro */
  recents: readonly string[];
  /** clima pedido pelo vídeo (tema do AutoCut / tema do conteúdo) */
  mood: MusicMood | null;
  /** desempenho por faixa (média de envios a cada mil) — só com amostra suficiente */
  performance?: Readonly<Record<string, number>>;
}

/**
 * "Para você": clima do vídeo primeiro, depois favoritas e o que foi bem; o que acabou de ser usado vai para o fim
 * (não repetir a mesma trilha em vários vídeos seguidos). Desempenho é sinal, não causa.
 */
export function forYou(rows: readonly MusicRow[], ctx: MusicContext, limit = 8): MusicRow[] {
  const recentRank = (id: string) => ctx.recents.indexOf(id);
  const score = (r: MusicRow) => {
    let s = 0;
    if (ctx.mood && r.mood === ctx.mood) s += 3;
    if (ctx.favorites.includes(r.id)) s += 2;
    s += Math.min(2, (ctx.performance?.[r.id] ?? 0) / 5);
    const rr = recentRank(r.id);
    if (rr >= 0 && rr < RECENT_BLOCK) s -= 4 - rr; // a última usada pesa mais
    return s;
  };
  return [...rows].map((r, i) => ({ r, s: score(r), i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.r);
}
const RECENT_BLOCK = 3;

/** Linhas de uma aba (antes da busca). */
export function musicTab(rows: readonly MusicRow[], tab: MusicTab, ctx: MusicContext): MusicRow[] {
  if (tab === "para_voce") return forYou(rows, ctx);
  if (tab === "favoritas") return rows.filter((r) => ctx.favorites.includes(r.id));
  if (tab === "recentes") return ctx.recents.map((id) => rows.find((r) => r.id === id)).filter((r): r is MusicRow => Boolean(r));
  if (tab === "minhas") return rows.filter((r) => r.own);
  if (tab === "todas") return [...rows];
  return rows.filter((r) => r.mood === tab);
}

/**
 * Música automática da montagem: do clima pedido, sem repetir as últimas usadas no perfil (se der);
 * mesma semente = mesma faixa (refazer o vídeo mantém a música).
 */
export function pickAutoTrack(mood: MusicMood, seed: string, recents: readonly string[], business = false): MusicTrack {
  const pool = MUSIC_LIBRARY.filter((t) => t.mood === mood && (!business || t.license === "comercial"));
  const fresh = pool.filter((t) => !recents.slice(0, RECENT_BLOCK).includes(t.id));
  if (!fresh.length) return pickTrack(mood, seed);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fresh[h % fresh.length]!;
}
