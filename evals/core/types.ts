/** What one grader said about one run. A grader judges what was produced, never the path taken. */
export interface GradeResult {
  grader: string;
  passed: boolean;
  detail: string;
}

/** How far the real cause is from where the error shows up. See the plan, section 12. */
export const DEPTHS = ['D0', 'D1', 'D2', 'D3', 'D4'] as const;
export type Depth = (typeof DEPTHS)[number];
