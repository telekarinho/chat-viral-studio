import type { EditChoices, EditPlan, TransitionKind } from "./editPlan";
import type { MusicMood } from "./music";

/**
 * Temas do AutoCut: cada um controla a montagem inteira (cortes, pausas, zoom, transição, ritmo na batida) E as
 * escolhas visíveis (legenda, gancho, B-roll, música, volume, retoque). O servidor lê os parâmetros — o resultado
 * muda de verdade conforme o tema, não só o nome.
 */
export const AUTOCUT_THEME_IDS = ["viral", "longa", "psicologica", "engracada", "suspense", "dramatica", "tiktok", "calma", "jovem"] as const;
export type AutoCutThemeId = (typeof AUTOCUT_THEME_IDS)[number];

export interface AutoCutParams {
  /** pausa maior que isto é encurtada (ms) */
  pauseMaxMs: number;
  /** respiro que fica entre frases depois do corte (ms) */
  pauseKeepMs: number;
  removeFillers: boolean;
  removeRepeats: boolean;
  /** zoom extra alternado a cada corte dentro da parte (0 = sem jump cut) */
  jumpPunch: number;
  /** multiplica a força dos zooms de cada parte (0 = enquadramento fixo) */
  zoom: number;
  /** transição entre as partes */
  transition: "auto" | "corte_seco" | "suave";
  transitionMs: number;
  /** pulsos visuais leves na batida da música (só com BPM medido) */
  beatSync: boolean;
}

export interface AutoCutTheme {
  id: AutoCutThemeId;
  label: string;
  description: string;
  params: AutoCutParams;
  /** escolhas que o tema aplica (o criador pode mudar depois — vira "Personalizado") */
  choices: Pick<EditChoices, "captionStyle" | "musicVolume" | "retouch" | "stabilize" | "autoCut" | "voiceClean" | "broll" | "hook"> & { music: MusicMood | "auto" };
}

const t = (id: AutoCutThemeId, label: string, description: string, params: AutoCutParams, choices: AutoCutTheme["choices"]): AutoCutTheme => ({ id, label, description, params, choices });
const base = { stabilize: true, autoCut: true, voiceClean: true } as const;

export const AUTOCUT_THEMES: readonly AutoCutTheme[] = [
  t("viral", "🔥 Viral", "Cortes secos sem silêncio, jump cut a cada pausa, palavra acesa e pulsos na batida.",
    { pauseMaxMs: 300, pauseKeepMs: 110, removeFillers: true, removeRepeats: true, jumpPunch: 0.1, zoom: 1.15, transition: "auto", transitionMs: 220, beatSync: true },
    { ...base, captionStyle: "destaque", music: "auto", musicVolume: 0.26, retouch: "forte", broll: true, hook: true }),
  t("longa", "🎬 Longa", "Para histórias maiores: guarda o respiro, zoom bem suave, transições lentas.",
    { pauseMaxMs: 750, pauseKeepMs: 280, removeFillers: true, removeRepeats: true, jumpPunch: 0, zoom: 0.5, transition: "suave", transitionMs: 420, beatSync: false },
    { ...base, captionStyle: "limpo", music: "reflexao", musicVolume: 0.16, retouch: "leve", broll: true, hook: true }),
  t("psicologica", "🧠 Psicológica", "Câmera no rosto: silêncios curtos que pesam, aproximação lenta, sem cenas de apoio.",
    { pauseMaxMs: 500, pauseKeepMs: 240, removeFillers: true, removeRepeats: true, jumpPunch: 0.05, zoom: 0.9, transition: "suave", transitionMs: 320, beatSync: false },
    { ...base, captionStyle: "manuscrito", music: "reflexao", musicVolume: 0.18, retouch: "leve", broll: false, hook: true }),
  t("engracada", "😂 Engraçada", "Timing de comédia: corte bem seco, zoom forte na piada, sem transição.",
    { pauseMaxMs: 240, pauseKeepMs: 70, removeFillers: true, removeRepeats: true, jumpPunch: 0.14, zoom: 1.2, transition: "corte_seco", transitionMs: 0, beatSync: false },
    { ...base, captionStyle: "destaque", music: "humor", musicVolume: 0.24, retouch: "leve", broll: true, hook: true }),
  t("suspense", "👀 Suspense", "Segura a revelação: pausas longas, aproximação lenta, música baixa.",
    { pauseMaxMs: 650, pauseKeepMs: 320, removeFillers: true, removeRepeats: true, jumpPunch: 0.03, zoom: 1.0, transition: "suave", transitionMs: 450, beatSync: false },
    { ...base, captionStyle: "manuscrito", music: "reflexao", musicVolume: 0.12, retouch: "leve", broll: false, hook: true }),
  t("dramatica", "🎭 Dramática", "Emoção: respira entre as frases, quase sem zoom, música presente.",
    { pauseMaxMs: 600, pauseKeepMs: 280, removeFillers: true, removeRepeats: true, jumpPunch: 0, zoom: 0.7, transition: "suave", transitionMs: 400, beatSync: false },
    { ...base, captionStyle: "manuscrito", music: "familia", musicVolume: 0.2, retouch: "leve", broll: true, hook: true }),
  t("tiktok", "⚡ Acelerada TikTok", "O mais rápido: zero silêncio, jump cut forte, zoom em tudo, pulsos na batida.",
    { pauseMaxMs: 200, pauseKeepMs: 50, removeFillers: true, removeRepeats: true, jumpPunch: 0.12, zoom: 1.3, transition: "auto", transitionMs: 180, beatSync: true },
    { ...base, captionStyle: "destaque", music: "treino", musicVolume: 0.3, retouch: "forte", broll: true, hook: true }),
  t("calma", "🌿 Calma", "Pouco estímulo: pausas naturais, enquadramento quase fixo, sem gancho piscando.",
    { pauseMaxMs: 850, pauseKeepMs: 320, removeFillers: true, removeRepeats: true, jumpPunch: 0, zoom: 0.3, transition: "suave", transitionMs: 500, beatSync: false },
    { ...base, captionStyle: "limpo", music: "calmo", musicVolume: 0.12, retouch: "leve", broll: false, hook: false }),
  t("jovem", "✨ Jovem", "Vivo e leve: cortes rápidos, zoom médio, pulsos na batida, música motivacional.",
    { pauseMaxMs: 320, pauseKeepMs: 120, removeFillers: true, removeRepeats: true, jumpPunch: 0.08, zoom: 1.1, transition: "auto", transitionMs: 250, beatSync: true },
    { ...base, captionStyle: "destaque", music: "motivacional", musicVolume: 0.24, retouch: "forte", broll: true, hook: true }),
];

/** Sem tema (vídeos antigos / personalizado): a montagem de sempre. */
export const DEFAULT_AUTOCUT_PARAMS: AutoCutParams = {
  pauseMaxMs: 450, pauseKeepMs: 160, removeFillers: true, removeRepeats: true, jumpPunch: 0.1, zoom: 1, transition: "auto", transitionMs: 300, beatSync: false,
};

export const autoCutTheme = (id: string | null | undefined): AutoCutTheme | undefined => AUTOCUT_THEMES.find((x) => x.id === id);

const CHOICE_KEYS = ["captionStyle", "music", "musicVolume", "retouch", "stabilize", "autoCut", "voiceClean", "broll", "hook"] as const;

/** Aplica o tema: as escolhas dele + o id (que o servidor usa para os parâmetros de montagem). */
export function applyAutoCutTheme(value: EditChoices, id: AutoCutThemeId): EditChoices {
  const theme = autoCutTheme(id)!;
  return { ...value, ...theme.choices, autocut: id };
}

/**
 * O tema continua valendo enquanto as escolhas dele não foram mexidas. Música própria/faixa escolhida a dedo
 * não desfaz o tema (é só a trilha); qualquer outra mudança vira "Personalizado" (null).
 */
export function activeAutoCutTheme(value: EditChoices): AutoCutThemeId | null {
  const theme = autoCutTheme(value.autocut);
  if (!theme) return null;
  const same = CHOICE_KEYS.every((k) => {
    if (k === "music") return value.music === theme.choices.music || !(value.music === "auto" || value.music === "none" || isMood(value.music));
    const v = value[k];
    const want = theme.choices[k];
    return k === "musicVolume" ? Math.abs((v as number | undefined ?? 0.22) - (want as number)) < 0.005 : v === want;
  });
  return same ? theme.id : null;
}

const MOODS = new Set(["reflexao", "motivacional", "treino", "familia", "humor", "empresa", "calmo"]);
const isMood = (s: string) => MOODS.has(s);

/** Parâmetros de montagem para as escolhas do vídeo (tema ativo ou o padrão). */
export function autoCutParams(value: Pick<EditChoices, "autocut"> | null | undefined): AutoCutParams {
  return autoCutTheme(value?.autocut)?.params ?? DEFAULT_AUTOCUT_PARAMS;
}

/**
 * Aplica o ritmo do tema num plano já montado: força dos zooms, jump cut e transições. Puro: devolve plano novo.
 */
export function applyAutoCutToPlan(plan: EditPlan, p: AutoCutParams): EditPlan {
  const clips = plan.clips.map((c) => ({
    ...c,
    effect: { ...c.effect, fromScale: 1 + (c.effect.fromScale - 1) * p.zoom, toScale: 1 + (c.effect.toScale - 1) * p.zoom },
    punch: p.jumpPunch,
  }));
  // corte seco: sem transição nenhuma (a montagem junta as partes direto)
  const transitions = p.transition === "corte_seco" ? [] : (plan.transitions ?? []).map((tr, k) => {
    const limit = Math.floor(Math.min(clips[k]!.durationMs, clips[k + 1]!.durationMs) / 4);
    const kind: TransitionKind = p.transition === "suave" ? "fade" : tr.kind;
    return { kind, durationMs: Math.max(0, Math.min(p.transitionMs, limit)) };
  });
  const totalMs = clips.reduce((a, c) => a + c.durationMs, 0) - transitions.reduce((a, x) => a + x.durationMs, 0);
  return { ...plan, clips, transitions, totalMs };
}
