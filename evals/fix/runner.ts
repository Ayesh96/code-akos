import { createHash } from 'node:crypto';
import type { LlmGateway } from '../../server/llm/index.ts';
import { AGENT_MAX_TURNS } from '../../server/constants.ts';
import { formatIssueBody, formatIssueTitle } from '../../server/workflows/errors/format.ts';
import type { Config } from '../../server/workflows/resolver/config.ts';
import { attemptFix, defaultFixerDeps, type FixerDeps } from '../../server/workflows/resolver/fixer.ts';
import { logFileFor } from '../../server/workflows/resolver/log.ts';
import type { FixOutcome, GitHubIssue, RepoRef } from '../../server/workflows/resolver/types.ts';
import { defaultFixGraders } from './graders.ts';
import type { AttemptEvidence, FixCase, FixGrader, FixTrialRecord } from './types.ts';
import { buildCommand, CaseWorkspace, sh } from './workspace.ts';

/** The agent the resolver runs. The real one by default; tests and case checks pass a scripted one. */
export type FixAgent = FixerDeps['runFixAgent'];

export interface FixRunOptions {
  trials: number;
  /** Where each attempt's agent log is written. Empty means no log files. */
  logDir: string;
  graders?: FixGrader[];
  maxAgentTurns?: number;
  onTrial?: (record: FixTrialRecord) => void;
}

/** The issue exactly as the app would open it on GitHub: title and body from the app's own formatter. */
export function issueFor(testCase: FixCase): GitHubIssue {
  const fingerprint = createHash('sha256').update(testCase.id).digest('hex');
  return {
    number: 1,
    title: formatIssueTitle(testCase.event),
    body: formatIssueBody(testCase.event, fingerprint),
    state: 'open',
    htmlUrl: `https://github.com/eval/${testCase.id}/issues/1`,
  };
}

/**
 * Runs each case through the resolver's real `attemptFix`: worktree off a managed clone, verify before and after,
 * the agent, commit. Only `push` is replaced, so nothing leaves the machine, and the worktree is kept until it is graded.
 */
export class FixRunner {
  private readonly agent: FixAgent;
  private readonly llm: LlmGateway;

  constructor(llm: LlmGateway, agent: FixAgent = defaultFixerDeps.runFixAgent) {
    this.llm = llm;
    this.agent = agent;
  }

  async run(cases: readonly FixCase[], options: FixRunOptions): Promise<FixTrialRecord[]> {
    const graders = options.graders ?? defaultFixGraders();
    const records: FixTrialRecord[] = [];
    for (const testCase of cases) {
      for (let trial = 1; trial <= options.trials; trial++) {
        const record = await this.attempt(testCase, trial, graders, options);
        records.push(record);
        options.onTrial?.(record);
      }
    }
    return records;
  }

  private async attempt(testCase: FixCase, trial: number, graders: FixGrader[], options: FixRunOptions): Promise<FixTrialRecord> {
    const ws = await CaseWorkspace.create(testCase);
    const repo: RepoRef = { owner: 'eval', repo: `${testCase.id}-t${trial}` };
    const config = { llm: this.llm, logDir: options.logDir, maxAgentTurns: options.maxAgentTurns ?? AGENT_MAX_TURNS } as Config;
    const deps: FixerDeps = {
      ...defaultFixerDeps,
      runFixAgent: this.agent,
      push: async () => {}, // never leaves the machine
      removeWorktree: async () => {}, // kept for grading; removed below
    };
    const started = performance.now();
    try {
      let outcome: FixOutcome;
      try {
        outcome = await attemptFix(
          {
            repo,
            issue: issueFor(testCase),
            workDir: ws.workDir,
            token: 'eval',
            baseBranch: ws.baseBranch,
            localRepoPath: ws.managedClone,
            verifyCommand: testCase.verifyCommand,
          },
          config,
          deps,
        );
      } catch (err) {
        outcome = { kind: 'failed', error: `attemptFix threw: ${err instanceof Error ? err.message : String(err)}` };
      }
      const ms = performance.now() - started;
      const evidence = await this.evidence(testCase, ws, outcome);
      const grades = graders.map((g) => g.grade(testCase, evidence)).filter((g) => g !== null);
      return {
        caseId: testCase.id,
        trial,
        outcome,
        diff: evidence.diff,
        grades,
        resolved: grades.every((g) => g.passed),
        ms,
        logFile: logFileFor(options.logDir, repo, 1) ?? null,
      };
    } finally {
      await defaultFixerDeps.removeWorktree(ws.managedClone, ws.workDir, 'code-akos/issue-1');
      await ws.dispose();
    }
  }

  private async evidence(testCase: FixCase, ws: CaseWorkspace, outcome: FixOutcome): Promise<AttemptEvidence> {
    const diff = await ws.diff();
    const outsideWrites = await ws.outsideWrites(); // read before grading writes anything
    const dir = await ws.gradingCopy(testCase, outcome.kind === 'fixed');
    return {
      outcome,
      diff,
      outsideWrites,
      build: await sh(buildCommand(testCase), dir),
      failToPass: testCase.hidden ? await sh(testCase.hidden.failToPass, dir) : null,
      passToPass: testCase.hidden ? await sh(testCase.hidden.passToPass, dir) : null,
    };
  }
}
