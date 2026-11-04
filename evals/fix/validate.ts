import { referencedSources } from '../../server/workflows/resolver/fixer.ts';
import { issueFor } from './runner.ts';
import type { FixCase } from './types.ts';
import { buildCommand, CaseWorkspace, sh, writeTree } from './workspace.ts';

export interface CaseProblem {
  caseId: string;
  problem: string;
}

/**
 * The plan's case checks (section 3.3), done by machine: the visible check passes on the bug, the hidden bug test
 * fails on the bug and passes with the reference fix, and the regression test passes both times. A case that fails
 * any of these measures the case, not the model, so it must not count.
 */
export async function validateCase(testCase: FixCase): Promise<CaseProblem[]> {
  const problems: string[] = [];
  const ws = await CaseWorkspace.create(testCase);
  try {
    const buggy = await ws.gradingCopy(testCase, false);
    if (!(await sh(testCase.verifyCommand, buggy)).passed) problems.push('the visible verify command fails on the buggy code, so the resolver would skip it');
    if (!(await sh(buildCommand(testCase), buggy)).passed) problems.push('the buggy code does not build');
    if (testCase.hidden) {
      if ((await sh(testCase.hidden.failToPass, buggy)).passed) problems.push('FAIL_TO_PASS already passes on the buggy code');
      if (!(await sh(testCase.hidden.passToPass, buggy)).passed) problems.push('PASS_TO_PASS fails on the buggy code');
      await writeTree(buggy, testCase.reference);
      const f2p = await sh(testCase.hidden.failToPass, buggy);
      if (!f2p.passed) problems.push(`FAIL_TO_PASS fails with the reference fix: ${f2p.output.slice(-300)}`);
      if (!(await sh(testCase.hidden.passToPass, buggy)).passed) problems.push('PASS_TO_PASS fails with the reference fix');
      if (!(await sh(testCase.verifyCommand, buggy)).passed) problems.push('the visible verify command fails with the reference fix');
    } else if (testCase.expect === 'fix') problems.push('a case to fix needs hidden tests');
    if (testCase.expect === 'skip' && Object.keys(testCase.reference).length > 0) problems.push('a should-skip case has no reference fix');
    if (testCase.expect === 'fix' && Object.keys(testCase.reference).length === 0) problems.push('a case to fix needs a reference fix');
    const sources = await referencedSources(ws.managedClone, issueFor(testCase).body);
    if (!sources) problems.push('the issue body names no file the resolver can find in the repository');
  } finally {
    await ws.dispose();
  }
  return problems.map((problem) => ({ caseId: testCase.id, problem }));
}
