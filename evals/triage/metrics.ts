import { DEPTHS, type Depth } from '../core/types.ts';
import { median, share, type Share } from '../core/stats.ts';
import { dismissed, saidSmallFix } from './graders.ts';
import type { TriageCase, TrialRecord } from './types.ts';

export interface TriageSummary {
  cases: number;
  trials: number;
  attempts: number;
  /** Trials where the triager threw. In the app these show as ERRORED. */
  errored: number;
  /** Real failures that were hidden. The hard gate: must be 0. */
  dangerousDismissals: { caseId: string; trial: number }[];
  /** Of the errors it called a small fix, how many truly were. */
  precision: Share;
  /** Of the true small fixes, how many it found. */
  recall: Share;
  /** Of the cases that are NOT a small fix, how many it wrongly called one, by how deep the cause is. */
  falseSmallFixByDepth: Partial<Record<Depth | 'none', Share>>;
  /** Per grader: share of graded trials that passed. */
  byGrader: Record<string, Share>;
  /** Cases whose small-fix answer changed between trials (only meaningful with more than one trial). */
  unstableCases: string[];
  medianMs: number | null;
}

const key = (d: Depth | null): Depth | 'none' => d ?? 'none';

export function summarise(cases: readonly TriageCase[], records: readonly TrialRecord[]): TriageSummary {
  const byId = new Map(cases.map((c) => [c.id, c]));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const falseByDepth = new Map<Depth | 'none', { hits: number; total: number }>();
  const grader = new Map<string, { hits: number; total: number }>();
  const dangerous: { caseId: string; trial: number }[] = [];
  const verdicts = new Map<string, Set<boolean>>();

  for (const record of records) {
    const c = byId.get(record.caseId);
    if (!c || !record.result) continue;
    const said = saidSmallFix(record.result);
    if (said && c.gold.smallFix) tp++;
    else if (said && !c.gold.smallFix) fp++;
    else if (!said && c.gold.smallFix) fn++;
    if (!c.gold.smallFix) {
      const bucket = falseByDepth.get(key(c.depth)) ?? { hits: 0, total: 0 };
      bucket.total++;
      if (said) bucket.hits++;
      falseByDepth.set(key(c.depth), bucket);
    }
    if (c.gold.mustNotDismiss && dismissed(record.result)) dangerous.push({ caseId: record.caseId, trial: record.trial });
    for (const g of record.grades) {
      const tally = grader.get(g.grader) ?? { hits: 0, total: 0 };
      tally.total++;
      if (g.passed) tally.hits++;
      grader.set(g.grader, tally);
    }
    verdicts.set(record.caseId, (verdicts.get(record.caseId) ?? new Set()).add(said));
  }

  const falseSmallFixByDepth: TriageSummary['falseSmallFixByDepth'] = {};
  for (const depth of [...DEPTHS, 'none'] as const) {
    const bucket = falseByDepth.get(depth);
    if (bucket) falseSmallFixByDepth[depth] = share(bucket.hits, bucket.total);
  }

  return {
    cases: cases.length,
    trials: Math.max(0, ...records.map((r) => r.trial)),
    attempts: records.length,
    errored: records.filter((r) => r.error !== null).length,
    dangerousDismissals: dangerous,
    precision: share(tp, tp + fp),
    recall: share(tp, tp + fn),
    falseSmallFixByDepth,
    byGrader: Object.fromEntries([...grader].map(([name, t]) => [name, share(t.hits, t.total)])),
    unstableCases: [...verdicts].filter(([, set]) => set.size > 1).map(([id]) => id),
    medianMs: median(records.map((r) => r.ms)),
  };
}
