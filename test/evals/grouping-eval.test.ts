import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GROUPING_CASES } from '../../evals/grouping/cases.ts';
import { gradeGrouping } from '../../evals/grouping/run.ts';

describe('grouping eval', () => {
  it('has both kinds of pair, so "always merge" and "never merge" both fail', () => {
    assert.ok(GROUPING_CASES.some((c) => c.same));
    assert.ok(GROUPING_CASES.some((c) => !c.same));
    assert.equal(new Set(GROUPING_CASES.map((c) => c.id)).size, GROUPING_CASES.length);
  });

  it('groups every pair the way a person would', () => {
    const result = gradeGrouping();
    assert.deepEqual(
      result.wrong.map((w) => w.id),
      [],
    );
  });
});
