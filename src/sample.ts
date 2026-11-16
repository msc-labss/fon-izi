/**
 * Reproducible control sample: funds not in the event set, drawn per
 * umbrella type in proportion to the event set (largest remainder), with a
 * seeded shuffle so anyone can redraw the same sample.
 */

/** mulberry32: small, well-known seeded PRNG returning [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` across strata in proportion to `weights` (largest remainder; ties by name). */
export function apportion(weights: Record<string, number>, total: number): Record<string, number> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const exact = Object.entries(weights).map(([k, w]) => ({ k, q: (w * total) / sum }));
  const out: Record<string, number> = Object.fromEntries(exact.map(({ k, q }) => [k, Math.floor(q)]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  for (const { k } of [...exact].sort((a, b) => b.q - Math.floor(b.q) - (a.q - Math.floor(a.q)) || (a.k < b.k ? -1 : 1))) {
    if (left-- <= 0) break;
    out[k]++;
  }
  return out;
}

export interface Candidate {
  code: string;
  stratum: string;
}

/** Draws the sample; returns codes sorted, with their stratum. */
export function drawSample(pool: readonly Candidate[], quotas: Record<string, number>, seed: number): Candidate[] {
  const rand = mulberry32(seed);
  const picked: Candidate[] = [];
  for (const stratum of Object.keys(quotas).sort()) {
    const members = pool.filter((c) => c.stratum === stratum).sort((a, b) => (a.code < b.code ? -1 : 1));
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [members[i], members[j]] = [members[j], members[i]];
    }
    if (members.length < quotas[stratum]) throw new Error(`stratum ${stratum}: ${members.length} < ${quotas[stratum]}`);
    picked.push(...members.slice(0, quotas[stratum]));
  }
  return picked.sort((a, b) => (a.code < b.code ? -1 : 1));
}
