import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Triager } from '../../server/workflows/errors/triage.ts';
import { rulesTriage } from '../../server/workflows/errors/triage.ts';
import type { TriageResult } from '../../server/workflows/errors/types.ts';
import { TRIAGE_CASES } from '../../evals/triage/cases.ts';
import { CulpritGrader, DismissalGrader, SmallFixGrader, TagGrader } from '../../evals/triage/graders.ts';
import { summarise } from '../../evals/triage/metrics.ts';
import { renderReport } from '../../evals/triage/report.ts';
import { TriageRunner } from '../../evals/triage/runner.ts';

const answer = (over: Partial<TriageResult> = {}): TriageResult => ({
  message: 'm',
  suggestion: 'Report it.',
  tags: ['needs-human'],
  source: 'model',
  ...over,
});
const caseOf = (id: string) => {
  const found = TRIAGE_CASES.find((c) => c.id === id);
  assert.ok(found, `no case ${id}`);
  return found;
};

describe('triage dataset', () => {
  it('has unique ids and a written reason for every case', () => {
    assert.equal(new Set(TRIAGE_CASES.map((c) => c.id)).size, TRIAGE_CASES.length);
    for (const c of TRIAGE_CASES) assert.ok(c.why.length > 10, `${c.id} needs a reason`);
  });

  it('is balanced: small fixes, non-fixes, test messages and hard negatives all present', () => {
    const count = (f: (c: (typeof TRIAGE_CASES)[number]) => boolean) => TRIAGE_CASES.filter(f).length;
    assert.ok(count((c) => c.gold.smallFix) >= 10);
    assert.ok(count((c) => !c.gold.smallFix) >= 20);
    assert.ok(count((c) => !c.gold.mustNotDismiss) >= 3);
    assert.ok(count((c) => c.gold.forbidTags.includes('test-event')) >= 3);
    assert.ok(count((c) => c.depth === 'D3' || c.depth === 'D4') >= 3, 'deep cases are what shows where bot-safe is wrong');
  });

  it('has gold answers that do not contradict themselves', () => {
    for (const c of TRIAGE_CASES) {
      if (c.gold.smallFix) assert.ok(c.gold.mustNotDismiss && !c.gold.requireTags.includes('test-event'), `${c.id}: a small fix is a real failure`);
      if (!c.gold.mustNotDismiss) assert.equal(c.gold.smallFix, false, `${c.id}: a test message is not a fix`);
      for (const t of c.gold.requireTags) assert.ok(!c.gold.forbidTags.includes(t), `${c.id}: ${t} is both required and forbidden`);
      if (c.gold.smallFix) assert.ok(c.depth === 'D0' || c.depth === 'D1', `${c.id}: a one-place fix has a shallow cause`);
    }
  });
});

describe('triage graders', () => {
  it('SmallFixGrader reads bot-safe as "a small fix"', () => {
    const grader = new SmallFixGrader();
    assert.equal(grader.grade(caseOf('py-nameerror-typo'), answer({ tags: ['bot-safe'] })).passed, true);
    assert.equal(grader.grade(caseOf('py-nameerror-typo'), answer()).passed, false);
    assert.equal(grader.grade(caseOf('py-recursion-d2'), answer({ tags: ['bot-safe'] })).passed, false);
  });

  it('DismissalGrader fails when a real failure is dismissed, by wording or by tag, and allows it for a test message', () => {
    const grader = new DismissalGrader();
    const real = caseOf('py-recursion-d2');
    assert.equal(grader.grade(real, answer({ suggestion: "Don't report it: not valid." })).passed, false);
    assert.equal(grader.grade(real, answer({ suggestion: 'Dont report it', tags: ['test-event'] })).passed, false);
    assert.equal(grader.grade(real, answer({ tags: ['test-event'] })).passed, false);
    assert.equal(grader.grade(real, answer()).passed, true);
    assert.equal(grader.grade(caseOf('test-hello-world'), answer({ suggestion: "Don't report it", tags: ['test-event'] })).passed, true);
  });

  it('TagGrader checks required and forbidden tags', () => {
    const grader = new TagGrader();
    assert.equal(grader.grade(caseOf('infra-disk-full'), answer({ tags: ['infrastructure', 'needs-human'] })).passed, true);
    assert.match(grader.grade(caseOf('infra-disk-full'), answer()).detail, /missing infrastructure/);
    assert.match(grader.grade(caseOf('hardneg-test-runner-crashed'), answer({ tags: ['test-event'] })).detail, /should not have test-event/);
  });

  it('CulpritGrader wants the function or the file named', () => {
    const grader = new CulpritGrader();
    assert.equal(grader.grade(caseOf('py-nameerror-typo'), answer({ message: 'It fails in handle_key.' })).passed, true);
    assert.equal(grader.grade(caseOf('py-nameerror-typo'), answer({ message: 'See AUDIO.PY.' })).passed, true);
    assert.equal(grader.grade(caseOf('py-nameerror-typo'), answer({ message: 'Something broke.' })).passed, false);
    assert.equal(grader.grade(caseOf('test-hello-world'), answer({ message: 'x' })).passed, true);
  });
});

describe('triage runner and summary', () => {
  const small = TRIAGE_CASES.filter((c) => c.gold.smallFix);
  const rest = TRIAGE_CASES.filter((c) => !c.gold.smallFix);

  it('runs every case for every trial', async () => {
    const records = await new TriageRunner(async () => answer()).run(TRIAGE_CASES, { trials: 3 });
    assert.equal(records.length, TRIAGE_CASES.length * 3);
  });

  it('records a triager that throws as an error, and counts it', async () => {
    const triager: Triager = async () => {
      throw new Error('The triage model did not answer with JSON');
    };
    const records = await new TriageRunner(triager).run(TRIAGE_CASES.slice(0, 2), { trials: 1 });
    const summary = summarise(TRIAGE_CASES.slice(0, 2), records);
    assert.equal(summary.errored, 2);
    assert.equal(records[0]?.error, 'The triage model did not answer with JSON');
  });

  it('an "always bot-safe" triager has full recall, poor precision, and is caught at every depth', async () => {
    const records = await new TriageRunner(async () => answer({ tags: ['bot-safe'] })).run(TRIAGE_CASES, { trials: 1 });
    const summary = summarise(TRIAGE_CASES, records);
    assert.equal(summary.recall.rate, 1);
    assert.equal(summary.precision.hits, small.length);
    assert.equal(summary.precision.total, TRIAGE_CASES.length);
    assert.equal(summary.falseSmallFixByDepth.D3?.rate, 1);
  });

  it('a triager that dismisses everything trips the hard gate on every real failure', async () => {
    const records = await new TriageRunner(async () => answer({ suggestion: "Don't report it", tags: ['test-event'] })).run(TRIAGE_CASES, { trials: 1 });
    const realFailures = TRIAGE_CASES.filter((c) => c.gold.mustNotDismiss).length;
    assert.equal(summarise(TRIAGE_CASES, records).dangerousDismissals.length, realFailures);
  });

  it('flags a case whose answer changes between trials', async () => {
    let call = 0;
    const flip: Triager = async () => answer({ tags: call++ % 2 === 0 ? ['bot-safe'] : ['needs-human'] });
    const records = await new TriageRunner(flip).run(rest.slice(0, 1), { trials: 2 });
    assert.deepEqual(summarise(rest.slice(0, 1), records).unstableCases, [rest[0]?.id]);
  });

  it('the shipped rule-based triage never hides a real failure (the hard gate)', async () => {
    const records = await new TriageRunner(async (event) => rulesTriage(event)).run(TRIAGE_CASES, { trials: 1 });
    const summary = summarise(TRIAGE_CASES, records);
    assert.deepEqual(summary.dangerousDismissals, []);
    assert.equal(summary.errored, 0);
  });

  it('the report lists every miss with its reason, and the headline numbers', async () => {
    const records = await new TriageRunner(async () => answer()).run(TRIAGE_CASES, { trials: 1 });
    const text = renderReport({ profile: 'fake', date: '2026-11-02', commit: 'abc' }, summarise(TRIAGE_CASES, records), TRIAGE_CASES, records);
    assert.match(text, /Real failures hidden \(must be 0\): \*\*0\*\*/);
    assert.match(text, /py-nameerror-typo.*small-fix.*Why this is the gold answer/);
  });
});
