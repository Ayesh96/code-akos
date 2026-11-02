import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TRIAGE_CASES } from '../../evals/triage/cases.ts';
import { casePassed, renderComparison } from '../../evals/triage/compare.ts';
import { TriageRunner } from '../../evals/triage/runner.ts';
import { rulesTriage } from '../../server/workflows/errors/triage.ts';
import type { TriageResult } from '../../server/workflows/errors/types.ts';

const nothing = async (): Promise<TriageResult> => ({ message: 'm', suggestion: 'Report it.', tags: ['needs-human'], source: 'model' });

describe('triage comparison', () => {
  it('lists the cases only one side passes, and the cases both pass', async () => {
    const rules = { profile: 'rules', records: await new TriageRunner(async (e) => rulesTriage(e)).run(TRIAGE_CASES, { trials: 1 }) };
    const dull = { profile: 'dull', records: await new TriageRunner(nothing).run(TRIAGE_CASES, { trials: 1 }) };
    const text = renderComparison(rules, dull);
    assert.match(text, /# Triage eval: rules vs dull/);
    assert.match(text, /Only rules passes: \d+: /);
    assert.match(text, /Real failures hidden \(must be 0\) \| 0 \| 0/);
    const together = renderComparison(rules, rules);
    assert.match(together, /Only rules passes: 0/);
  });

  it('counts a case as passed only if every trial of it passed', async () => {
    let call = 0;
    const flaky = async (e: Parameters<typeof rulesTriage>[0]): Promise<TriageResult> => (call++ % 2 === 0 ? rulesTriage(e) : nothing());
    const first = TRIAGE_CASES.filter((c) => c.id === 'py-nameerror-typo');
    const records = await new TriageRunner(flaky).run(first, { trials: 2 });
    assert.equal(casePassed('py-nameerror-typo', records), false);
    assert.equal(casePassed('missing-case', records), false);
  });
});
