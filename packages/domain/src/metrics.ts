/** Números de um post anotados pelo criador (soma das redes onde postou). */
export interface PostMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  updatedAt: string;
}

export const METRIC_FIELDS = ["views", "likes", "comments", "shares", "saves"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

export const METRIC_LABEL: Record<MetricField, string> = {
  views: "Visualizações", likes: "Curtidas", comments: "Comentários", shares: "Compartilhamentos", saves: "Salvamentos",
};

const MAX_METRIC = 1_000_000_000;

/** Texto digitado ("1.200", "3k", "2,5 mil") → número inteiro ≥ 0, ou null se não der para entender. */
export function parseMetric(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return 0;
  const m = /^(\d+(?:[.,]\d+)*)(k|mil|m|mi)?$/.exec(t);
  if (!m) return null;
  const mult = m[2] === "k" || m[2] === "mil" ? 1_000 : m[2] === "m" || m[2] === "mi" ? 1_000_000 : 1;
  // com sufixo, vírgula/ponto é decimal ("2,5 mil"); sem sufixo, é separador de milhar ("1.200")
  const n = mult > 1 ? Number(m[1]!.replace(",", ".")) : Number(m[1]!.replace(/[.,]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_METRIC, Math.round(n * mult));
}

/** Engajamento = interações ÷ visualizações (0 quando não há visualizações). */
export function engagementRate(m: Pick<PostMetrics, MetricField>): number {
  return m.views > 0 ? (m.likes + m.comments + m.shares + m.saves) / m.views : 0;
}

/**
 * Compartilhamentos a cada 1.000 visualizações. O Instagram diz que envios por alcance são um dos 3
 * sinais que mais pesam (com tempo assistido e curtidas por alcance) — é o número a acompanhar.
 */
export function sharesPer1k(m: Pick<PostMetrics, "views" | "shares">): number {
  return m.views > 0 ? (m.shares / m.views) * 1000 : 0;
}

export interface MetricsItem { id: string; title: string; pillarSlug: string; metrics: PostMetrics }

export interface PillarPerformance { pillarSlug: string; posts: number; avgViews: number; avgEngagement: number }

export interface MetricsInsights {
  posts: number;
  totalViews: number;
  best: MetricsItem | null;
  /** melhor média de visualizações primeiro */
  byPillar: PillarPerformance[];
  /** dica simples para o próximo post (null com poucos dados) */
  tip: string | null;
}

const MIN_POSTS_FOR_TIP = 3;

export function metricsInsights(items: readonly MetricsItem[], pillarName: (slug: string) => string = (s) => s): MetricsInsights {
  const groups = new Map<string, MetricsItem[]>();
  for (const it of items) groups.set(it.pillarSlug, [...(groups.get(it.pillarSlug) ?? []), it]);
  const byPillar = [...groups.entries()].map(([pillarSlug, xs]) => ({
    pillarSlug,
    posts: xs.length,
    avgViews: Math.round(xs.reduce((a, x) => a + x.metrics.views, 0) / xs.length),
    avgEngagement: xs.reduce((a, x) => a + engagementRate(x.metrics), 0) / xs.length,
  })).sort((a, b) => b.avgViews - a.avgViews);
  const best = items.reduce<MetricsItem | null>((b, x) => (!b || x.metrics.views > b.metrics.views ? x : b), null);
  const top = byPillar[0];
  const tip = items.length >= MIN_POSTS_FOR_TIP && top && byPillar.length > 1
    ? `Posts de ${pillarName(top.pillarSlug)} têm a maior média (${top.avgViews.toLocaleString("pt-BR")} visualizações). Vale repetir esse tema esta semana.`
    : null;
  return { posts: items.length, totalViews: items.reduce((a, x) => a + x.metrics.views, 0), best, byPillar, tip };
}
