import { AUTOCUT_THEME_IDS, INTENT_LABEL, VIDEO_INTENTS, applyAutoCutTheme, autoCutTheme, type AutoCutThemeId, type VideoIntent } from "./autocut";
import type { EditChoices } from "./editPlan";
import { MOOD_LABEL, ownMusicUuid, trackById, type MusicMood, type OwnMusic } from "./music";

/** Volume da música relativo à voz: abaixo some, acima disso a música começa a brigar com a fala. */
export const MUSIC_VOLUME_MIN = 0.05;
export const MUSIC_VOLUME_MAX = 0.45;
/** música própria sem duração conhecida: o trecho pode começar até aqui */
const OWN_MAX_START_S = 600;
/** sobra mínima de música depois do início escolhido */
const MIN_TAIL_S = 5;

/** O que o diretor (Claude) propõe para a montagem. Só entra no vídeo quando o criador aceita no app. */
export interface EditProposal {
  intencao?: VideoIntent;
  autocut?: AutoCutThemeId;
  music?: string;
  musicVolume?: number;
  musicStartS?: number;
}

export interface ProposalInput { intencao?: unknown; autocut?: unknown; musica?: unknown; volume?: unknown; inicio_musica_s?: unknown }

/** Valida a proposta (todos os erros de uma vez, para o assistente corrigir numa rodada). */
export function parseEditProposal(input: ProposalInput, ctx: { business: boolean; own: readonly OwnMusic[] }): { ok: true; edit: EditProposal } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const edit: EditProposal = {};
  if (input.autocut !== undefined) {
    if (typeof input.autocut === "string" && (AUTOCUT_THEME_IDS as readonly string[]).includes(input.autocut)) edit.autocut = input.autocut as AutoCutThemeId;
    else errors.push(`autocut: use um destes: ${AUTOCUT_THEME_IDS.join(", ")}.`);
  }
  if (input.intencao !== undefined) {
    if (typeof input.intencao === "string" && (VIDEO_INTENTS as readonly string[]).includes(input.intencao)) edit.intencao = input.intencao as VideoIntent;
    else errors.push(`intencao: use um destes: ${VIDEO_INTENTS.join(", ")}.`);
  }
  let trackDuration: number | null = null;
  if (input.musica !== undefined) {
    const m = typeof input.musica === "string" ? input.musica.trim() : "";
    const track = trackById(m);
    const ownId = ownMusicUuid(m);
    const own = ownId ? ctx.own.find((o) => o.id === ownId) : undefined;
    if (m === "auto" || m === "none" || m in MOOD_LABEL) edit.music = m;
    else if (track) {
      if (ctx.business && track.license !== "comercial") errors.push(`musica: "${track.title}" não tem licença comercial (perfil de empresa).`);
      else { edit.music = m; trackDuration = track.durationSec; }
    } else if (own) {
      if (ctx.business && !own.comercial) errors.push(`musica: "${own.titulo}" foi enviada sem licença comercial declarada (perfil de empresa).`);
      else { edit.music = m; trackDuration = OWN_MAX_START_S + MIN_TAIL_S; }
    } else errors.push(`musica: "${m}" não existe. Use um id de listar_musicas, "auto", "none" ou um clima (${Object.keys(MOOD_LABEL).join(", ")}).`);
  }
  if (input.volume !== undefined) {
    const v = input.volume;
    if (typeof v === "number" && v >= MUSIC_VOLUME_MIN && v <= MUSIC_VOLUME_MAX) edit.musicVolume = Math.round(v * 100) / 100;
    else errors.push(`volume: entre ${MUSIC_VOLUME_MIN} e ${MUSIC_VOLUME_MAX} (relativo à voz; acima disso a música cobre a fala).`);
  }
  if (input.inicio_musica_s !== undefined) {
    const s = input.inicio_musica_s;
    if (trackDuration === null) errors.push("inicio_musica_s: só vale junto de uma faixa específica em musica (id de listar_musicas).");
    else if (typeof s !== "number" || s < 0 || s > trackDuration - MIN_TAIL_S) errors.push(`inicio_musica_s: de 0 a ${trackDuration - MIN_TAIL_S} segundos.`);
    else edit.musicStartS = Math.round(s);
  }
  if (!errors.length && !Object.keys(edit).length) errors.push("Proponha pelo menos um item: intencao, autocut, musica, volume ou inicio_musica_s.");
  return errors.length ? { ok: false, errors } : { ok: true, edit };
}

/** Aplica a proposta nas escolhas do vídeo: o tema primeiro (ele traz legenda/volume), depois a música pedida. */
export function applyEditProposal(value: EditChoices, p: EditProposal): EditChoices {
  const themed = p.autocut ? applyAutoCutTheme(value, p.autocut) : value;
  const base = p.intencao ? { ...themed, intencao: p.intencao } : themed;
  const music = p.music ?? base.music;
  return {
    ...base,
    music,
    ...(p.musicVolume !== undefined ? { musicVolume: p.musicVolume } : {}),
    // trecho só vale para a faixa em que foi escolhido
    musicStartS: p.musicStartS ?? (music === base.music ? base.musicStartS : undefined),
  };
}

/** "AutoCut Acelerada TikTok · música Piano Reflections a partir de 0:12 · volume 30%" */
export function describeEditProposal(p: EditProposal, own: readonly OwnMusic[] = []): string {
  const bits: string[] = [];
  if (p.intencao) bits.push(`Objetivo ${INTENT_LABEL[p.intencao]}`);
  if (p.autocut) bits.push(`AutoCut ${autoCutTheme(p.autocut)!.label.replace(/^\S+\s/, "")}`);
  if (p.music) {
    const ownId = ownMusicUuid(p.music);
    const name = p.music === "auto" ? "automática" : p.music === "none" ? "sem música"
      : p.music in MOOD_LABEL ? `clima ${MOOD_LABEL[p.music as MusicMood]}`
        : trackById(p.music)?.title ?? own.find((o) => o.id === ownId)?.titulo ?? "música própria";
    const start = p.musicStartS ? ` a partir de ${Math.floor(p.musicStartS / 60)}:${String(p.musicStartS % 60).padStart(2, "0")}` : "";
    bits.push(`música ${name}${start}`);
  }
  if (p.musicVolume !== undefined) bits.push(`volume ${Math.round(p.musicVolume * 100)}%`);
  return bits.join(" · ");
}
