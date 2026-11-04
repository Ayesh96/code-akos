import type { NormalizedEvent, TriageResult, TriageTag } from '../../server/workflows/errors/types.ts';
import type { Depth, GradeResult } from '../core/types.ts';

/** What a careful person says the right answer is. Written before any model is run. */
export interface TriageGold {
  /** A change of a few lines in one place would fix it, so `bot-safe` is right. */
  smallFix: boolean;
  /** A real failure: saying "Don't report it" or tagging it a test message would hide a bug. */
  mustNotDismiss: boolean;
  requireTags: TriageTag[];
  forbidTags: TriageTag[];
  /** Where it was thrown or logged from. The message should name the function or the file. Null for events with nothing to point at. */
  throwSite: { file: string; fn: string } | null;
}

export type CaseSource = 'macremote' | 'scenario' | 'new';

export interface TriageCase {
  id: string;
  /** One line a person can read to see why the gold answer is what it is. */
  why: string;
  source: CaseSource;
  /** How far the cause is from the crash line; null when there is no code to change. */
  depth: Depth | null;
  event: NormalizedEvent;
  gold: TriageGold;
}

export interface TriageGrader {
  readonly name: string;
  grade(testCase: TriageCase, result: TriageResult): GradeResult;
}

export interface TrialRecord {
  caseId: string;
  trial: number;
  result: TriageResult | null;
  error: string | null;
  ms: number;
  grades: GradeResult[];
}
