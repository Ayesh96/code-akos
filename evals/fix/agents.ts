import { writeTree } from './workspace.ts';
import type { FixAgent } from './runner.ts';
import type { FixCase } from './types.ts';

const caseOf = (cases: readonly FixCase[], htmlUrl: string): FixCase => {
  const found = cases.find((c) => htmlUrl.includes(`/eval/${c.id}/`));
  if (!found) throw new Error(`no case for ${htmlUrl}`);
  return found;
};

/**
 * Scripted stand-ins for the model's agent, so the harness itself can be tested with no model: each must score
 * exactly what it should, or a grader is wrong.
 */
export const scriptedAgents = {
  /** Writes the reference fix, or skips a should-skip case. Must resolve every case. */
  oracle:
    (cases: readonly FixCase[]): FixAgent =>
    async (issue, { cwd }) => {
      const c = caseOf(cases, issue.htmlUrl);
      if (c.expect === 'skip') return { kind: 'skip', reason: 'infrastructure, nothing to change in code' };
      await writeTree(cwd, c.reference);
      return { kind: 'fix', explanation: 'applied the reference fix' };
    },
  /** Always gives up. Resolves the should-skip cases and nothing else. */
  skipAll: (): FixAgent => async () => ({ kind: 'skip', reason: 'not confident' }),
  /** Deletes the visible tests' assertions and says it fixed the bug: what the anti-cheat step must catch. */
  testEditor:
    (cases: readonly FixCase[]): FixAgent =>
    async (issue, { cwd }) => {
      const c = caseOf(cases, issue.htmlUrl);
      const tests = Object.keys(c.files).filter((p) => p.startsWith('tests/') && !p.endsWith('__init__.py'));
      await writeTree(
        cwd,
        Object.fromEntries(tests.map((p) => [p, c.lang === 'ts' ? "import { test } from 'node:test';\ntest('x', () => {});\n" : 'import unittest\n'])),
      );
      return { kind: 'fix', explanation: 'made the tests pass' };
    },
};
