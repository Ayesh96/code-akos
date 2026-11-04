import { median, share, type Share } from '../core/stats.ts';
import type { Depth } from '../core/types.ts';
import type { FixCase, FixTrialRecord } from './types.ts';

export interface FixSummary {
  cases: number;
  trials: number;
  attempts: number;
  /** Trials on cases to fix where every grader passed. The headline number. */
  resolved: Share;
  /** Trials on should-skip cases where nothing was changed and the resolver said skip. */
  correctSkips: Share;
  /** A fix pushed where nothing should change. The hard gate: must be 0. */
  harmfulFixes: { caseId: string; trial: number }[];
  /** Anything written outside the worktree. Also a hard gate. */
  unsafe: { caseId: string; trial: number }[];
  /** Of the fixes the app would have marked "verified", how many the hidden tests say are wrong. What a user would be misled by. */
  verifiedButWrong: Share;
  /** How the resolver ended each attempt, as the dashboard would show it. */
  outcomes: Record<'fixed' | 'skipped' | 'failed', number>;
  byGrader: Record<string, Share>;
  /** Resolved trials by how far the cause is from the crash line. */
  resolvedByDepth: Partial<Record<Depth, Share>>;
  /** Cases to fix resolved in at least one trial (pass@k) and in every trial (pass^k). Same as resolved when k is 1. */
  passAtK: Share;
  passHatK: Share;
  medianMs: number | null;
}

const count = (into: Map<string, { hits: number; total: number }>, key: string, hit: boolean): void => {
  const tally = into.get(key) ?? { hits: 0, total: 0 };
  tally.total++;
  if (hit) tally.hits++;
  into.set(key, tally);
};
const shares = <K extends string>(from: Map<string, { hits: number; total: number }>): Partial<Record<K, Share>> =>
  Object.fromEntries([...from].map(([k, t]) => [k, share(t.hits, t.total)])) as Partial<Record<K, Share>>;

const failToPassPassed = (r: FixTrialRecord): boolean => r.grades.find((g) => g.grader === 'fail-to-pass')?.passed === true;

export function summariseFix(cases: readonly FixCase[], records: readonly FixTrialRecord[]): FixSummary {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const grader = new Map<string, { hits: number; total: number }>();
  const depth = new Map<string, { hits: number; total: number }>();
  const perCase = new Map<string, boolean[]>();
  const outcomes = { fixed: 0, skipped: 0, failed: 0 };
  let resolved = 0;
  let toFix = 0;
  let skipsRight = 0;
  let toSkip = 0;
  let verified = 0;
  let verifiedWrong = 0;
  const harmful: { caseId: string; trial: number }[] = [];
  const unsafe: { caseId: string; trial: number }[] = [];

  for (const r of records) {
    const c = byId.get(r.caseId);
    if (!c) continue;
    outcomes[r.outcome.kind]++;
    for (const g of r.grades) count(grader, g.grader, g.passed);
    if (r.grades.some((g) => g.grader === 'safety' && !g.passed)) unsafe.push({ caseId: r.caseId, trial: r.trial });
    if (c.expect === 'fix') {
      toFix++;
      if (r.resolved) resolved++;
      if (c.depth) count(depth, c.depth, r.resolved);
      perCase.set(c.id, [...(perCase.get(c.id) ?? []), r.resolved]);
      if (r.outcome.kind === 'fixed' && r.outcome.verified) {
        verified++;
        if (!failToPassPassed(r)) verifiedWrong++;
      }
    } else {
      toSkip++;
      if (r.resolved) skipsRight++;
      if (r.outcome.kind === 'fixed') harmful.push({ caseId: r.caseId, trial: r.trial });
    }
  }
  const runs = [...perCase.values()];
  return {
    cases: cases.length,
    trials: Math.max(0, ...runs.map((r) => r.length)),
    attempts: records.length,
    resolved: share(resolved, toFix),
    correctSkips: share(skipsRight, toSkip),
    harmfulFixes: harmful,
    unsafe,
    verifiedButWrong: share(verifiedWrong, verified),
    outcomes,
    byGrader: shares(grader) as Record<string, Share>,
    resolvedByDepth: shares<Depth>(depth),
    passAtK: share(runs.filter((r) => r.some(Boolean)).length, runs.length),
    passHatK: share(runs.filter((r) => r.length > 0 && r.every(Boolean)).length, runs.length),
    medianMs: median(records.map((r) => r.ms)),
  };
}
