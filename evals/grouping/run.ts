import { share, formatShare } from '../core/stats.ts';
import { GROUPING_CASES, groupedTogether } from './cases.ts';

/** Grouping is deterministic, so one pass is the whole eval. It is also run as a test, so a regression fails CI. */
export function gradeGrouping() {
  const rows = GROUPING_CASES.map((c) => ({ id: c.id, why: c.why, expected: c.same, got: groupedTogether(c) }));
  const wrong = rows.filter((r) => r.expected !== r.got);
  const mergedWrongly = rows.filter((r) => !r.expected && r.got).length; // two bugs hidden in one issue
  const splitWrongly = rows.filter((r) => r.expected && !r.got).length; // one bug filed twice
  return { rows, wrong, mergedWrongly, splitWrongly, accuracy: share(rows.length - wrong.length, rows.length) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = gradeGrouping();
  console.log(`Grouping eval: ${formatShare(result.accuracy)}. Two bugs merged: ${result.mergedWrongly}. One bug split: ${result.splitWrongly}.`);
  for (const w of result.wrong) console.log(`  MISS ${w.id}: expected ${w.expected ? 'same issue' : 'different issues'}. ${w.why}`);
  if (result.wrong.length > 0) process.exit(1);
}
