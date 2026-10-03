import { sharesPer1k, type PostMetrics } from "./metrics";

/** Um post com números reais e o que ele usou (para comparar por dimensão). */
export interface LearningPost {
  metrics: PostMetrics;
  tema: string | null;
  formato: string | null;
  /** duração do roteiro em segundos (o vídeo final pode variar alguns segundos) */
  duracaoS: number | null;
  estilo: string | null;
  musica: string | null;
  /** hora de Brasília em que foi postado */
  hora: number | null;
  gancho: string | null;
}

export interface Learning { dimensao: string; texto: string; posts: number }

/** cada grupo comparado precisa de pelo menos isto de posts (1 post não diz nada) */
const MIN_PER_GROUP = 2;
/** abaixo disto o app não tira aprendizado nenhum */
export const MIN_POSTS_FOR_LEARNING = 3;
/** abaixo disto o aprendizado vem marcado como amostra pequena */
const SMALL_SAMPLE = 10;

const durBucket = (s: number | null) => (s === null ? null : s < 20 ? "até 20 s" : s < 40 ? "de 20 a 40 s" : s < 60 ? "de 40 a 60 s" : "mais de 60 s");
const hourBucket = (h: number | null) => (h === null ? null : h < 12 ? "de manhã" : h < 18 ? "à tarde" : "à noite");
const hookKind = (g: string | null) => (!g ? null : g.trim().endsWith("?") ? "pergunta" : "afirmação");

const savesPer1k = (m: PostMetrics) => (m.views ? (m.saves / m.views) * 1000 : 0);
const METRICS: { nome: string; valor: (m: PostMetrics) => number | null }[] = [
  { nome: "compartilhamentos", valor: sharesPer1k },
  { nome: "salvamentos", valor: savesPer1k },
  { nome: "retenção", valor: (m) => (typeof m.completionRate === "number" ? m.completionRate : null) },
];

const DIMENSIONS: { dimensao: string; frase: (k: string) => string; pick: (p: LearningPost) => string | null }[] = [
  { dimensao: "tema", frase: (k) => `Vídeos de ${k}`, pick: (p) => p.tema },
  { dimensao: "formato", frase: (k) => `${k}`, pick: (p) => p.formato },
  { dimensao: "duração", frase: (k) => `Seus vídeos ${k} (roteiro)`, pick: (p) => durBucket(p.duracaoS) },
  { dimensao: "estilo", frase: (k) => `O estilo ${k}`, pick: (p) => p.estilo },
  { dimensao: "música", frase: (k) => `Com a música ${k}`, pick: (p) => p.musica },
  { dimensao: "horário", frase: (k) => `Posts ${k}`, pick: (p) => hourBucket(p.hora) },
  { dimensao: "gancho", frase: (k) => `Ganchos em ${k}`, pick: (p) => hookKind(p.gancho) },
];

/**
 * "O que seu Diretor aprendeu": para cada dimensão, o grupo que teve a melhor média numa métrica real, contra os
 * outros grupos da mesma dimensão. Só com dados reais, amostra explícita e sem causalidade ("nesta amostra").
 */
export function directorLearnings(posts: readonly LearningPost[]): { posts: number; small: boolean; learnings: Learning[] } {
  const n = posts.length;
  if (n < MIN_POSTS_FOR_LEARNING) return { posts: n, small: true, learnings: [] };
  const out: Learning[] = [];
  for (const d of DIMENSIONS) {
    const groups = new Map<string, LearningPost[]>();
    for (const p of posts) {
      const k = d.pick(p);
      if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const valid = [...groups.entries()].filter(([, xs]) => xs.length >= MIN_PER_GROUP);
    if (valid.length < 2) continue;
    // a métrica em que a diferença entre o melhor grupo e a média dos outros é maior (relativa)
    let best: { k: string; metrica: string; posts: number; lift: number } | null = null;
    for (const m of METRICS) {
      const avgs = valid.map(([k, xs]) => {
        const vals = xs.map((x) => m.valor(x.metrics)).filter((v): v is number => v !== null);
        return { k, posts: xs.length, avg: vals.length >= MIN_PER_GROUP ? vals.reduce((a, v) => a + v, 0) / vals.length : null };
      }).filter((a): a is { k: string; posts: number; avg: number } => a.avg !== null);
      if (avgs.length < 2) continue;
      avgs.sort((a, b) => b.avg - a.avg);
      const top = avgs[0]!;
      const rest = avgs.slice(1).reduce((a, x) => a + x.avg, 0) / (avgs.length - 1);
      const lift = rest > 0 ? top.avg / rest - 1 : top.avg > 0 ? 1 : 0;
      if (lift > 0.1 && (!best || lift > best.lift)) best = { k: top.k, metrica: m.nome, posts: top.posts, lift };
    }
    if (best) out.push({ dimensao: d.dimensao, posts: best.posts, texto: `${d.frase(best.k)} tiveram mais ${best.metrica} nesta amostra (${best.posts} posts).` });
  }
  return { posts: n, small: n < SMALL_SAMPLE, learnings: out };
}
