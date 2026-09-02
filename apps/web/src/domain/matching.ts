import { normalizedKey, tokenize } from './normalize';

export interface MatchableProduct {
  code: string;
  description: string;
}

export interface AliasRecord {
  product_code: string;
  client_code: string | null;
  normalized: string | null;
}

export type MatchStatus = 'auto' | 'alias' | 'manual' | 'pending' | 'ambiguous' | 'not_found';

export interface Candidate {
  code: string;
  description: string;
  score: number;
}

export interface MatchResult {
  status: MatchStatus;
  productCode: string | null;
  score: number;
  candidates: Candidate[];
}

export interface MatchOptions {
  /** Minimum score for an automatic match (0-1). */
  threshold?: number;
  /** Minimum gap between best and runner-up for an automatic match. */
  margin?: number;
}

const DEFAULTS: Required<MatchOptions> = { threshold: 0.8, margin: 0.1 };

/** Levenshtein distance (small strings only). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** 1 when tokens are equal, ~0.85+ for a small typo, 0 otherwise. */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0;
  const d = levenshtein(a, b);
  const ratio = 1 - d / Math.max(a.length, b.length);
  return ratio >= 0.8 ? ratio : 0;
}

/** Soft intersection size between two token lists (each token used at most once). */
function overlap(q: string[], c: string[]): number {
  const used = new Set<number>();
  let total = 0;
  for (const qt of q) {
    let best = 0;
    let bestIdx = -1;
    c.forEach((ct, idx) => {
      if (used.has(idx)) return;
      const s = tokenSimilarity(qt, ct);
      if (s > best) {
        best = s;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0 && best > 0) {
      used.add(bestIdx);
      total += best;
    }
  }
  return total;
}

/**
 * Similarity between a raw order description and a catalog description.
 * Combines Sørensen–Dice with a "query fully contained" bonus so that
 * "TEMPERO BAIANO" still finds "TEMPERO BAIANO COM PIMENTA" when it is the only option.
 */
export function similarity(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = tokenize(candidate);
  if (!q.length || !c.length) return 0;
  const inter = overlap(q, c);
  const dice = (2 * inter) / (q.length + c.length);
  const containment = inter / q.length; // share of query tokens found
  const coverage = inter / c.length; // share of candidate tokens explained
  const contained = containment >= 0.999 ? containment * (0.7 + 0.3 * coverage) : 0;
  return Math.max(dice, contained);
}

export function rankCandidates(description: string, products: MatchableProduct[], limit = 5): Candidate[] {
  return products
    .map((p) => ({ code: p.code, description: p.description, score: similarity(description, p.description) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => ({ ...c, score: Math.round(c.score * 1000) / 1000 }));
}

/**
 * Match one order line against the catalog.
 * Priority: alias by client code → alias by normalized description → fuzzy ranking.
 */
export function matchProduct(
  item: { clientCode?: string | null; description: string },
  products: MatchableProduct[],
  aliases: AliasRecord[] = [],
  options: MatchOptions = {},
): MatchResult {
  const opt = { ...DEFAULTS, ...options };
  const active = products;

  if (item.clientCode) {
    const byCode = aliases.find((a) => a.client_code && a.client_code === item.clientCode);
    if (byCode && active.some((p) => p.code === byCode.product_code)) {
      return { status: 'alias', productCode: byCode.product_code, score: 1, candidates: [] };
    }
  }
  const key = normalizedKey(item.description);
  if (key) {
    const byKey = aliases.find((a) => a.normalized && a.normalized === key);
    if (byKey && active.some((p) => p.code === byKey.product_code)) {
      return { status: 'alias', productCode: byKey.product_code, score: 1, candidates: [] };
    }
  }

  const candidates = rankCandidates(item.description, active);
  if (!candidates.length) return { status: 'not_found', productCode: null, score: 0, candidates };

  const [best, second] = candidates;
  const gap = best.score - (second?.score ?? 0);
  if (best.score >= 0.999 || (best.score >= opt.threshold && gap >= opt.margin - 1e-9)) {
    return { status: 'auto', productCode: best.code, score: best.score, candidates };
  }
  if (best.score >= 0.5 && second && gap < opt.margin) {
    return { status: 'ambiguous', productCode: null, score: best.score, candidates };
  }
  if (best.score < 0.35) return { status: 'not_found', productCode: null, score: best.score, candidates };
  return { status: 'pending', productCode: null, score: best.score, candidates };
}
