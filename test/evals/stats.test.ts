import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatShare, median, share, wilson } from '../../evals/core/stats.ts';

describe('eval stats', () => {
  it('gives the known range for 21 of 30 (about 52% to 83%)', () => {
    const { low, high } = wilson(21, 30);
    assert.ok(Math.abs(low - 0.521) < 0.01, `low was ${low}`);
    assert.ok(Math.abs(high - 0.834) < 0.01, `high was ${high}`);
  });

  it('stays inside 0..1 at the edges and says nothing is known for no data', () => {
    assert.equal(wilson(0, 10).low, 0);
    assert.equal(wilson(10, 10).high, 1);
    assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
  });

  it('narrows as the count grows', () => {
    const small = wilson(7, 10);
    const large = wilson(70, 100);
    assert.ok(large.high - large.low < small.high - small.low);
  });

  it('formats a share, and an empty one', () => {
    assert.equal(formatShare(share(21, 30)), '70% (21/30, range 52% to 83%)');
    assert.equal(formatShare(share(0, 0)), 'n/a (0 counted)');
  });

  it('takes the median of odd, even and empty lists', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
  });
});
