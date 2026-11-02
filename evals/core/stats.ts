export interface Interval {
  low: number;
  high: number;
}

/** A share out of a count, with the 95% range it could really be (Wilson). `rate` is null when nothing was counted. */
export interface Share {
  hits: number;
  total: number;
  rate: number | null;
  range: Interval | null;
}

const Z_95 = 1.96;

/**
 * Wilson score interval. Chosen over the plain +/- formula because it stays inside 0..1 and behaves for the
 * small counts an eval has (30 cases): 21 of 30 is 70%, and the range is about 52% to 83%.
 */
export function wilson(hits: number, total: number, z = Z_95): Interval {
  if (total === 0) return { low: 0, high: 1 };
  const p = hits / total;
  const z2 = z * z;
  const centre = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / (1 + z2 / total);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export function share(hits: number, total: number): Share {
  return { hits, total, rate: total === 0 ? null : hits / total, range: total === 0 ? null : wilson(hits, total) };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** "70% (21/30, range 52% to 83%)", or "n/a (0 counted)". */
export function formatShare(s: Share): string {
  if (s.rate === null || s.range === null) return 'n/a (0 counted)';
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return `${pct(s.rate)} (${s.hits}/${s.total}, range ${pct(s.range.low)} to ${pct(s.range.high)})`;
}
