import type { Triager } from '../../server/workflows/errors/triage.ts';
import { defaultGraders } from './graders.ts';
import type { TriageCase, TriageGrader, TrialRecord } from './types.ts';

export interface RunOptions {
  trials: number;
  graders?: TriageGrader[];
  /** Called after each trial, for progress output. */
  onTrial?: (record: TrialRecord) => void;
}

/**
 * Runs every case through a triager, `trials` times each, and grades each answer. A triager that throws is
 * recorded as an error, the same way the app records it (the error shows as ERRORED), and counts as a miss.
 */
export class TriageRunner {
  private readonly triager: Triager;

  constructor(triager: Triager) {
    this.triager = triager;
  }

  async run(cases: readonly TriageCase[], options: RunOptions): Promise<TrialRecord[]> {
    const graders = options.graders ?? defaultGraders();
    const records: TrialRecord[] = [];
    for (const testCase of cases) {
      for (let trial = 1; trial <= options.trials; trial++) {
        const started = performance.now();
        let record: TrialRecord;
        try {
          const result = await this.triager(testCase.event);
          record = { caseId: testCase.id, trial, result, error: null, ms: performance.now() - started, grades: graders.map((g) => g.grade(testCase, result)) };
        } catch (err) {
          record = {
            caseId: testCase.id,
            trial,
            result: null,
            error: err instanceof Error ? err.message : String(err),
            ms: performance.now() - started,
            grades: [],
          };
        }
        records.push(record);
        options.onTrial?.(record);
      }
    }
    return records;
  }
}
