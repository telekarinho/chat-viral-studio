export interface Pillar {
  slug: string;
  name: string;
  targetPercent: number;
  active?: boolean;
}

export const RODRIGO_PILLARS: readonly Pillar[] = [
  { slug: "reflexao", name: "Motivação e reflexão real", targetPercent: 40 },
  { slug: "vida-real", name: "Vida real / homem 40+ / maturidade", targetPercent: 20 },
  { slug: "academia", name: "Academia e evolução", targetPercent: 15 },
  { slug: "familia", name: "Família", targetPercent: 10 },
  { slug: "humor", name: "Humor", targetPercent: 10 },
  { slug: "empreendedorismo", name: "Empreendedorismo", targetPercent: 5 },
];

const EPSILON = 0.01;

export function validatePillarTargets(pillars: readonly Pillar[]): string[] {
  const errors: string[] = [];
  const active = pillars.filter((p) => p.active !== false);
  if (active.length === 0) errors.push("Pelo menos um pilar precisa estar ativo.");
  const slugs = new Set<string>();
  for (const p of pillars) {
    if (!p.slug.trim() || !p.name.trim()) errors.push("Todo pilar precisa de nome.");
    if (slugs.has(p.slug)) errors.push(`Pilar duplicado: ${p.slug}`);
    slugs.add(p.slug);
    if (!Number.isFinite(p.targetPercent) || p.targetPercent < 0 || p.targetPercent > 100) {
      errors.push(`Percentual inválido em ${p.name}.`);
    }
  }
  const sum = active.reduce((acc, p) => acc + p.targetPercent, 0);
  if (Math.abs(sum - 100) > EPSILON) errors.push(`Os percentuais somam ${round(sum)}%, precisam somar 100%.`);
  return errors;
}

export interface PillarBalance {
  slug: string;
  name: string;
  targetPercent: number;
  actualPercent: number;
  count: number;
  deficit: number;
}

/** Distribution of recent content per pillar compared with the target. */
export function pillarBalance(pillars: readonly Pillar[], recentPillarSlugs: readonly string[]): PillarBalance[] {
  const active = pillars.filter((p) => p.active !== false);
  const known = recentPillarSlugs.filter((s) => active.some((p) => p.slug === s));
  const total = known.length;
  return active.map((p) => {
    const count = known.filter((s) => s === p.slug).length;
    const actualPercent = total === 0 ? 0 : (count / total) * 100;
    return { slug: p.slug, name: p.name, targetPercent: p.targetPercent, actualPercent: round(actualPercent), count, deficit: round(p.targetPercent - actualPercent) };
  });
}

/**
 * Picks the pillar that is most behind its target, considering what would happen
 * if the next item were added (so a 5% pillar is not picked every time history is empty).
 */
export function pickNextPillar(pillars: readonly Pillar[], recentPillarSlugs: readonly string[], exclude: readonly string[] = []): Pillar {
  const active = pillars.filter((p) => p.active !== false && p.targetPercent > 0);
  const candidates = active.filter((p) => !exclude.includes(p.slug));
  const pool = candidates.length > 0 ? candidates : active;
  if (pool.length === 0) throw new Error("Nenhum pilar ativo configurado.");
  const known = recentPillarSlugs.filter((s) => active.some((p) => p.slug === s));
  const nextTotal = known.length + 1;
  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const p of pool) {
    const count = known.filter((s) => s === p.slug).length;
    // expected count after next item minus actual: bigger = more behind
    const score = (p.targetPercent / 100) * nextTotal - count;
    if (score > bestScore + EPSILON || (Math.abs(score - bestScore) <= EPSILON && p.targetPercent > best.targetPercent)) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
