import type { TriageResult } from '../../server/workflows/errors/types.ts';
import type { GradeResult } from '../core/types.ts';
import type { TriageCase, TriageGrader } from './types.ts';

const DISMISSES = /^don'?t report it/i;

/** What triage said about the fix size: `bot-safe` is its "a small fix" verdict. */
export const saidSmallFix = (result: TriageResult): boolean => result.tags.includes('bot-safe');

/** Hiding an error: told to drop it, or called a test message. */
export const dismissed = (result: TriageResult): boolean => DISMISSES.test(result.suggestion) || result.tags.includes('test-event');

const result = (grader: string, passed: boolean, detail: string): GradeResult => ({ grader, passed, detail });

/** Did it get "a small fix or not" right. */
export class SmallFixGrader implements TriageGrader {
  readonly name = 'small-fix';
  grade(c: TriageCase, r: TriageResult): GradeResult {
    const said = saidSmallFix(r);
    return result(
      this.name,
      said === c.gold.smallFix,
      `said ${said ? 'small fix' : 'not a small fix'}, expected ${c.gold.smallFix ? 'small fix' : 'not a small fix'}`,
    );
  }
}

/** The hard gate: a real failure must never be dismissed. */
export class DismissalGrader implements TriageGrader {
  readonly name = 'no-dismissal';
  grade(c: TriageCase, r: TriageResult): GradeResult {
    if (!c.gold.mustNotDismiss) return result(this.name, true, 'a test message: dismissing is allowed');
    return result(
      this.name,
      !dismissed(r),
      dismissed(r) ? `hid a real failure (suggestion: "${r.suggestion.slice(0, 60)}", tags: ${r.tags.join(', ')})` : 'kept a real failure',
    );
  }
}

/** Required tags present, forbidden tags absent. */
export class TagGrader implements TriageGrader {
  readonly name = 'tags';
  grade(c: TriageCase, r: TriageResult): GradeResult {
    const missing = c.gold.requireTags.filter((t) => !r.tags.includes(t));
    const extra = c.gold.forbidTags.filter((t) => r.tags.includes(t));
    const problems = [...missing.map((t) => `missing ${t}`), ...extra.map((t) => `should not have ${t}`)];
    return result(this.name, problems.length === 0, problems.length === 0 ? 'tags as expected' : problems.join('; '));
  }
}

/** Does the message name the place the error came from: the function or the file. */
export class CulpritGrader implements TriageGrader {
  readonly name = 'culprit';
  grade(c: TriageCase, r: TriageResult): GradeResult {
    const where = c.gold.throwSite;
    if (!where) return result(this.name, true, 'nothing to point at');
    const text = r.message.toLowerCase();
    const named = text.includes(where.fn.toLowerCase()) || text.includes(where.file.toLowerCase());
    return result(this.name, named, named ? `names ${where.fn} or ${where.file}` : `does not name ${where.fn} or ${where.file}`);
  }
}

export const defaultGraders = (): TriageGrader[] => [new SmallFixGrader(), new DismissalGrader(), new TagGrader(), new CulpritGrader()];
