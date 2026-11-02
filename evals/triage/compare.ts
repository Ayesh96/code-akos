import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatShare } from '../core/stats.ts';
import { TRIAGE_CASES } from './cases.ts';
import { summarise, type TriageSummary } from './metrics.ts';
import type { TriageCase, TrialRecord } from './types.ts';

export interface RunResult {
  profile: string;
  records: TrialRecord[];
}

/** A case counts as passed when every trial of it passed every grader. A trial where the triager threw is a miss. */
export function casePassed(caseId: string, records: readonly TrialRecord[]): boolean {
  const trials = records.filter((r) => r.caseId === caseId);
  return trials.length > 0 && trials.every((r) => r.error === null && r.grades.every((g) => g.passed));
}

const pct = (n: number, total: number) => (total === 0 ? 'n/a' : `${Math.round((n / total) * 100)}%`);

/**
 * Puts two runs of the same cases side by side. Both must have run the same cases: the comparison is paired,
 * so a difference is a case one model got right and the other did not, not a difference between two samples.
 */
export function renderComparison(a: RunResult, b: RunResult, cases: readonly TriageCase[] = TRIAGE_CASES): string {
  const sa: TriageSummary = summarise(cases, a.records);
  const sb: TriageSummary = summarise(cases, b.records);
  const row = (label: string, x: string, y: string) => `| ${label} | ${x} | ${y} |`;
  const graders = [...new Set([...Object.keys(sa.byGrader), ...Object.keys(sb.byGrader)])];

  const onlyA: string[] = [];
  const onlyB: string[] = [];
  let both = 0;
  let neither = 0;
  for (const c of cases) {
    const pa = casePassed(c.id, a.records);
    const pb = casePassed(c.id, b.records);
    if (pa && pb) both++;
    else if (!pa && !pb) neither++;
    else (pa ? onlyA : onlyB).push(c.id);
  }

  return [
    `# Triage eval: ${a.profile} vs ${b.profile}`,
    '',
    `Same ${cases.length} cases for both. Ranges are 95% (Wilson); with this few cases they are wide, so a gap smaller than the ranges is not a finding.`,
    '',
    `| | ${a.profile} | ${b.profile} |`,
    '|---|---|---|',
    row('Real failures hidden (must be 0)', String(sa.dangerousDismissals.length), String(sb.dangerousDismissals.length)),
    row('Triage errors', String(sa.errored), String(sb.errored)),
    row('Small-fix precision', formatShare(sa.precision), formatShare(sb.precision)),
    row('Small-fix recall', formatShare(sa.recall), formatShare(sb.recall)),
    ...graders.map((g) => row(`Grader: ${g}`, sa.byGrader[g] ? formatShare(sa.byGrader[g]) : 'n/a', sb.byGrader[g] ? formatShare(sb.byGrader[g]) : 'n/a')),
    row(
      'Median time per error',
      sa.medianMs === null ? 'n/a' : `${Math.round(sa.medianMs)} ms`,
      sb.medianMs === null ? 'n/a' : `${Math.round(sb.medianMs)} ms`,
    ),
    '',
    '## Case by case (a case passes when every grader passes in every trial)',
    '',
    `- Both pass: ${both} (${pct(both, cases.length)})`,
    `- Neither passes: ${neither} (${pct(neither, cases.length)})`,
    `- Only ${a.profile} passes: ${onlyA.length}${onlyA.length > 0 ? `: ${onlyA.join(', ')}` : ''}`,
    `- Only ${b.profile} passes: ${onlyB.length}${onlyB.length > 0 ? `: ${onlyB.join(', ')}` : ''}`,
    '',
  ].join('\n');
}

function load(dir: string): RunResult {
  const raw = JSON.parse(readFileSync(join(resolve(dir), 'raw.json'), 'utf8')) as RunResult;
  return { profile: raw.profile, records: raw.records };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { a: { type: 'string' }, b: { type: 'string' } } });
  if (!values.a || !values.b) throw new Error('Usage: node evals/triage/compare.ts --a <results dir> --b <results dir>');
  console.log(renderComparison(load(values.a), load(values.b)));
}
