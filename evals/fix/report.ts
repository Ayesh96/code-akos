import { formatShare } from '../core/stats.ts';
import type { FixSummary } from './metrics.ts';
import type { FixCase, FixTrialRecord } from './types.ts';

export interface FixReportContext {
  profile: string;
  date: string;
  commit: string;
  /** Cases left out of this run, and why (for example no python3 on the machine). */
  leftOut: string[];
}

const outcomeText = (r: FixTrialRecord): string =>
  r.outcome.kind === 'fixed' ? `fixed${r.outcome.verified ? ' (verified)' : ''}` : r.outcome.kind === 'skipped' ? 'skipped' : 'failed';

/** The fix eval report. Lists every miss with the agent's log, so a number is never shown without what is behind it. */
export function renderFixReport(ctx: FixReportContext, s: FixSummary, cases: readonly FixCase[], records: readonly FixTrialRecord[]): string {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const lines: string[] = [
    `# Fix eval: ${ctx.profile}`,
    '',
    `Date ${ctx.date}, commit \`${ctx.commit}\`. ${s.cases} cases x ${s.trials} trial(s) = ${s.attempts} attempts, through the resolver's real \`attemptFix\` with push turned off.`,
    'Seeded bugs, dev set: prompts may be tuned on these, so they are not a number to publish. Ranges are 95% (Wilson) and wide.',
    ...(ctx.leftOut.length ? ['', `Left out: ${ctx.leftOut.join('; ')}.`] : []),
    '',
    '## Result',
    '',
    `- Fixes pushed where nothing should change (must be 0): **${s.harmfulFixes.length}**`,
    `- Attempts that wrote outside their worktree (must be 0): **${s.unsafe.length}**`,
    `- Bugs resolved (every grader passed): ${formatShare(s.resolved)}`,
    `- Should-skip cases left alone: ${formatShare(s.correctSkips)}`,
    `- Marked "verified" but the hidden test still fails: ${formatShare(s.verifiedButWrong)}`,
    ...(s.trials > 1
      ? [
          `- Cases resolved in at least one trial (pass@${s.trials}): ${formatShare(s.passAtK)}`,
          `- Cases resolved in every trial (pass^${s.trials}): ${formatShare(s.passHatK)}`,
        ]
      : []),
    `- Outcomes: ${s.outcomes.fixed} fixed, ${s.outcomes.skipped} skipped, ${s.outcomes.failed} failed`,
    `- Median time per attempt: ${s.medianMs === null ? 'n/a' : `${(s.medianMs / 1000).toFixed(1)} s`}`,
    '',
    '## By grader',
    '',
    'G1 outcome, G2 build, G3 fail-to-pass (the bug is gone), G4 pass-to-pass (nothing else broke), G5 diff-rules, G6 safety.',
    '',
    '| Grader | Passed |',
    '|---|---|',
    ...Object.entries(s.byGrader).map(([name, share]) => `| ${name} | ${formatShare(share)} |`),
    '',
    '## Resolved, by depth of the cause',
    '',
    'D0 the crash line is the bug, D1 same function, D2 another function in the file, D3 a file the stack does not show, D4 data or state.',
    '',
    '| Depth | Resolved |',
    '|---|---|',
    ...Object.entries(s.resolvedByDepth).map(([depth, share]) => `| ${depth} | ${share ? formatShare(share) : 'n/a'} |`),
    '',
    '## Every case',
    '',
    '| Case | Depth | Expect | Resolved | Outcomes | Lines changed |',
    '|---|---|---|---|---|---|',
  ];
  for (const c of cases) {
    const runs = records.filter((r) => r.caseId === c.id);
    if (runs.length === 0) continue;
    lines.push(
      `| \`${c.id}\` | ${c.depth ?? '-'} | ${c.expect} | ${runs.filter((r) => r.resolved).length}/${runs.length} | ${runs.map(outcomeText).join(', ')} | ${runs.map((r) => r.diff.added + r.diff.removed).join(', ')} |`,
    );
  }
  lines.push('', '## Every miss', '');
  const misses = records
    .filter((r) => !r.resolved)
    .map((r) => {
      const failed = r.grades.filter((g) => !g.passed).map((g) => `${g.grader}: ${g.detail}`);
      return `- \`${r.caseId}\` (trial ${r.trial}): ${failed.join('; ')}${r.logFile ? ` Log: \`${r.logFile}\`.` : ''} What a right fix is: ${byId.get(r.caseId)?.why ?? ''}`;
    });
  lines.push(...(misses.length ? misses : ['None.']), '');
  return lines.join('\n');
}
