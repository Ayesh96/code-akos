import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LlmGateway } from '../../server/llm/index.ts';
import { scriptedAgents } from '../../evals/fix/agents.ts';
import { FIX_CASES } from '../../evals/fix/cases.ts';
import { DiffRulesGrader, OutcomeGrader, SafetyGrader } from '../../evals/fix/graders.ts';
import { summariseFix } from '../../evals/fix/metrics.ts';
import { renderFixReport } from '../../evals/fix/report.ts';
import { FixRunner, issueFor } from '../../evals/fix/runner.ts';
import type { AttemptEvidence, FixTrialRecord } from '../../evals/fix/types.ts';
import { validateCase } from '../../evals/fix/validate.ts';
import { isTestPath } from '../../evals/fix/workspace.ts';

const NO_MODEL = {
  isAvailable: () => false,
  clientFor: () => ({ chat: async () => assert.fail('a scripted run must not call a model') }),
  run: async () => assert.fail('a scripted run must not call a model'),
} as unknown as LlmGateway;
const quiet = { trials: 1, logDir: '' };
const caseOf = (id: string) => {
  const found = FIX_CASES.find((c) => c.id === id);
  assert.ok(found, `no case ${id}`);
  return found;
};
const evidence = (over: Partial<AttemptEvidence> = {}): AttemptEvidence => ({
  outcome: { kind: 'fixed', explanation: 'x', filesChanged: ['src/users.ts'], verifyRan: true, verified: true, branchName: 'b', baseBranch: 'main' },
  diff: { files: ['src/users.ts'], added: 1, removed: 1 },
  build: { passed: true, output: '' },
  failToPass: { passed: true, output: '' },
  passToPass: { passed: true, output: '' },
  outsideWrites: [],
  ...over,
});

describe('fix dataset', () => {
  it('has unique ids, a reason, every depth, and should-skip cases', () => {
    assert.equal(new Set(FIX_CASES.map((c) => c.id)).size, FIX_CASES.length);
    for (const c of FIX_CASES) assert.ok(c.why.length > 20, `${c.id} needs a reason`);
    const depths = new Set(FIX_CASES.filter((c) => c.expect === 'fix').map((c) => c.depth));
    for (const d of ['D0', 'D1', 'D2', 'D3', 'D4']) assert.ok(depths.has(d as never), `no fix case at ${d}`);
    assert.ok(FIX_CASES.filter((c) => c.expect === 'skip').length >= 2);
    assert.ok(new Set(FIX_CASES.map((c) => c.lang)).size === 2, 'both TypeScript and Python');
  });

  it('keeps hidden tests out of the repository the agent sees', () => {
    for (const c of FIX_CASES) {
      for (const path of Object.keys(c.hidden?.files ?? {})) assert.equal(c.files[path], undefined, `${c.id} leaks ${path}`);
      assert.ok(!issueFor(c).body.includes('hidden/'), `${c.id} issue body mentions hidden tests`);
    }
  });

  it('passes every case check: the bug test fails on the bug and passes with the reference fix', async () => {
    const problems = (await Promise.all(FIX_CASES.map(validateCase))).flat();
    assert.deepEqual(problems, []);
  });
});

describe('fix graders', () => {
  it('treats tests and hidden tests as files a fix may not touch', () => {
    for (const p of ['tests/users.test.ts', 'tests/test_cart.py', 'src/a.test.ts', 'hidden/bug.test.ts']) assert.ok(isTestPath(p), p);
    for (const p of ['src/users.ts', 'app/cart.py', 'app/testing_utils.py']) assert.ok(!isTestPath(p), p);
  });

  it('fails any change on a should-skip case, and a fix that is too big', () => {
    const skip = caseOf('ts-db-refused-skip');
    assert.equal(new DiffRulesGrader().grade(skip, evidence()).passed, false);
    assert.equal(new OutcomeGrader().grade(skip, evidence()).passed, false);
    const big = new DiffRulesGrader().grade(caseOf('ts-guest-name-d0'), evidence({ diff: { files: ['src/users.ts'], added: 30, removed: 0 } }));
    assert.equal(big.passed, false);
    assert.match(big.detail, /cap is/);
  });

  it('fails a write outside the worktree', () => {
    assert.equal(new SafetyGrader().grade(caseOf('ts-guest-name-d0'), evidence({ outsideWrites: ['x changed'] })).passed, false);
  });
});

describe('fix runner, through the real attemptFix', () => {
  it('the reference fix resolves every case', async () => {
    const records = await new FixRunner(NO_MODEL, scriptedAgents.oracle(FIX_CASES)).run(FIX_CASES, quiet);
    assert.deepEqual(
      records.filter((r) => !r.resolved).map((r) => `${r.caseId}: ${r.grades.filter((g) => !g.passed).map((g) => g.detail)}`),
      [],
    );
    const s = summariseFix(FIX_CASES, records);
    assert.equal(s.resolved.rate, 1);
    assert.equal(s.harmfulFixes.length, 0);
    assert.equal(s.unsafe.length, 0);
  });

  it('giving up on everything resolves only the should-skip cases', async () => {
    const records = await new FixRunner(NO_MODEL, scriptedAgents.skipAll()).run(FIX_CASES, quiet);
    for (const r of records) assert.equal(r.resolved, caseOf(r.caseId).expect === 'skip', r.caseId);
  });

  it('an agent that edits the tests to pass gets no credit, and is caught on a should-skip case', async () => {
    const records = await new FixRunner(NO_MODEL, scriptedAgents.testEditor(FIX_CASES)).run(FIX_CASES, quiet);
    for (const r of records) {
      assert.equal(r.resolved, false, r.caseId);
      assert.equal(r.grades.find((g) => g.grader === 'diff-rules')?.passed, false, r.caseId);
    }
    const s = summariseFix(FIX_CASES, records);
    assert.equal(s.harmfulFixes.length, 2);
    assert.equal(s.verifiedButWrong.hits, s.verifiedButWrong.total, 'the visible tests pass, so the app calls every one verified');
  });
});

describe('fix report', () => {
  it('shows the gates first and lists every miss', () => {
    const c = caseOf('ts-guest-name-d0');
    const miss: FixTrialRecord = {
      caseId: c.id,
      trial: 1,
      outcome: { kind: 'skipped', reason: 'unsure' },
      diff: { files: [], added: 0, removed: 0 },
      grades: [new OutcomeGrader().grade(c, evidence({ outcome: { kind: 'skipped', reason: 'unsure' } }))],
      resolved: false,
      ms: 1200,
      logFile: 'logs/x.log',
    };
    const report = renderFixReport({ profile: 'p', date: 'd', commit: 'c', leftOut: [] }, summariseFix([c], [miss]), [c], [miss]);
    assert.match(report, /must be 0\): \*\*0\*\*/);
    assert.match(report, /`ts-guest-name-d0` \(trial 1\): outcome: expected fixed, got skipped \(unsure\) Log: `logs\/x.log`/);
  });
});
