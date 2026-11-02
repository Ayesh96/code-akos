import { formatShare } from '../core/stats.ts';
import type { TriageSummary } from './metrics.ts';
import type { TriageCase, TrialRecord } from './types.ts';

export interface ReportContext {
  profile: string;
  date: string;
  commit: string;
}

/** The report a person reads. It lists every failure on purpose: a published number with its misses is easier to trust. */
export function renderReport(ctx: ReportContext, summary: TriageSummary, cases: readonly TriageCase[], records: readonly TrialRecord[]): string {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const lines: string[] = [
    `# Triage eval: ${ctx.profile}`,
    '',
    `Date ${ctx.date}, commit \`${ctx.commit}\`. ${summary.cases} cases x ${summary.trials} trial(s) = ${summary.attempts} runs. Ranges are 95% (Wilson); with this few cases they are wide.`,
    '',
    '## Result',
    '',
    `- Real failures hidden (must be 0): **${summary.dangerousDismissals.length}**`,
    `- Triage errors (model failed to answer): ${summary.errored}`,
    `- Small-fix precision: ${formatShare(summary.precision)}`,
    `- Small-fix recall: ${formatShare(summary.recall)}`,
    `- Median time per error: ${summary.medianMs === null ? 'n/a' : `${Math.round(summary.medianMs)} ms`}`,
    ...(summary.unstableCases.length > 0 ? [`- Cases whose answer changed between trials: ${summary.unstableCases.join(', ')}`] : []),
    '',
    '## By grader',
    '',
    '| Grader | Passed |',
    '|---|---|',
    ...Object.entries(summary.byGrader).map(([name, s]) => `| ${name} | ${formatShare(s)} |`),
    '',
    '## Wrongly called a small fix, by depth of the cause',
    '',
    'Only cases that are NOT a small fix. D0 = the crash line is the bug; D3 = the cause is in a file the stack does not show.',
    '',
    '| Depth | Wrongly called small fix |',
    '|---|---|',
    ...Object.entries(summary.falseSmallFixByDepth).map(([depth, s]) => `| ${depth} | ${s ? formatShare(s) : 'n/a'} |`),
    '',
    '## Every miss',
    '',
  ];
  const misses = records.flatMap((r) =>
    r.error !== null
      ? [`- \`${r.caseId}\` (trial ${r.trial}): triage failed: ${r.error}`]
      : r.grades
          .filter((g) => !g.passed)
          .map((g) => `- \`${r.caseId}\` (trial ${r.trial}), ${g.grader}: ${g.detail}. Why this is the gold answer: ${byId.get(r.caseId)?.why ?? ''}`),
  );
  lines.push(...(misses.length > 0 ? misses : ['None.']), '');
  return lines.join('\n');
}
