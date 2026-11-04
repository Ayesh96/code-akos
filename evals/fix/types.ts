import type { FixOutcome } from '../../server/workflows/resolver/types.ts';
import type { NormalizedEvent } from '../../server/workflows/errors/types.ts';
import type { Depth, GradeResult } from '../core/types.ts';

export type Lang = 'ts' | 'py';

/**
 * Hidden tests: never in the repository the agent sees. Copied in only after the attempt, the way SWE-bench
 * keeps FAIL_TO_PASS and PASS_TO_PASS out of the model's reach.
 */
export interface HiddenTests {
  files: Record<string, string>;
  /** Fails on the buggy code, passes once the bug is fixed. Shell line, run from the repository root. */
  failToPass: string;
  /** Passes on the buggy code and must still pass after the fix. */
  passToPass: string;
}

/** One seeded bug: a small working repository with one bug put in, the error it throws, and how to tell a real fix. */
export interface FixCase {
  id: string;
  /** Why the case exists and what a right fix looks like, so a second reader can disagree. */
  why: string;
  lang: Lang;
  depth: Depth | null;
  /** `skip`: nothing in this repository should change (infrastructure, a dependency). A fix there is a wrong fix. */
  expect: 'fix' | 'skip';
  /** The repository as the agent gets it, bug included. Paths are relative to its root. */
  files: Record<string, string>;
  /** The project's own check, as a user would set it. It passes on the buggy code: the visible tests miss the bug. */
  verifyCommand: string;
  /** The error the bug throws, as the SDK would report it. The issue body is built from it by the app's own formatter. */
  event: NormalizedEvent;
  hidden: HiddenTests | null;
  /** The fixed files (only the ones that change). Used to check the case itself, never shown to the agent. */
  reference: Record<string, string>;
  /** The most lines a fix may add plus remove before it stops being a small, local change. */
  maxChangedLines: number;
}

/** What the agent changed, read from git after the attempt. */
export interface Diff {
  files: string[];
  added: number;
  removed: number;
}

/** What one attempt left behind, for the graders. Commands have already run; graders only read results. */
export interface AttemptEvidence {
  outcome: FixOutcome;
  diff: Diff;
  /** The source files still compile or import, after test files were put back. */
  build: CommandResult;
  /** null when the case has no hidden tests (should-skip cases). */
  failToPass: CommandResult | null;
  passToPass: CommandResult | null;
  /** Things that changed outside the attempt's own working copy. Must be empty. */
  outsideWrites: string[];
}

export interface CommandResult {
  passed: boolean;
  output: string;
}

/** A grader returns null when it does not apply to a case, so it is left out of that grader's count. */
export interface FixGrader {
  readonly name: string;
  grade(testCase: FixCase, evidence: AttemptEvidence): GradeResult | null;
}

export interface FixTrialRecord {
  caseId: string;
  trial: number;
  outcome: FixOutcome;
  diff: Diff;
  grades: GradeResult[];
  /** Every grader that applied passed. */
  resolved: boolean;
  ms: number;
  /** The agent's turn log for this attempt, kept for reading misses. */
  logFile: string | null;
}
