# Triage eval: deepseek (deepseek: deepseek-flash)

Date 2026-11-02, commit `9c8cf30` (before the test-event fix). 37 cases x 1 trial(s) = 37 runs. Ranges are 95% (Wilson); with this few cases they are wide. Run on an Intel MacBook Pro; only report.md was kept.

## Result

- Real failures hidden (must be 0): **2**
- Triage errors (model failed to answer): 0
- Small-fix precision: 83% (15/18, range 61% to 94%)
- Small-fix recall: 100% (15/15, range 80% to 100%)
- Median time per error: 1301 ms

## By grader

| Grader | Passed |
|---|---|
| small-fix | 92% (34/37, range 79% to 97%) |
| no-dismissal | 95% (35/37, range 82% to 99%) |
| tags | 92% (34/37, range 79% to 97%) |
| culprit | 97% (36/37, range 86% to 100%) |

## Wrongly called a small fix, by depth of the cause

Only cases that are NOT a small fix. D0 = the crash line is the bug; D3 = the cause is in a file the stack does not show.

| Depth | Wrongly called small fix |
|---|---|
| D2 | 100% (1/1, range 21% to 100%) |
| D3 | 100% (1/1, range 21% to 100%) |
| D4 | 33% (1/3, range 6% to 79%) |
| none | 0% (0/17, range 0% to 18%) |

## Every miss

- `py-valueerror-config-d3` (trial 1), small-fix: said small fix, expected not a small fix. Why this is the gold answer: The crash line only parses; the bad value was written by a loader in another file that is not in the stack.
- `py-recursion-d2` (trial 1), small-fix: said small fix, expected not a small fix. Why this is the gold answer: Two functions call each other; fixing it is a design change.
- `py-keyerror-cache-d4` (trial 1), small-fix: said small fix, expected not a small fix. Why this is the gold answer: Works unless a cache entry expired mid-request; a state problem.
- `infra-permission-denied` (trial 1), culprit: does not name open_log or log.py. Why this is the gold answer: The process may not write its log file.
- `hardneg-test-runner-crashed` (trial 1), no-dismissal: hid a real failure (suggestion: "Don't report it as a code bug; if it is noisy, check why run", tags: test-event, no-stack-trace). Why this is the gold answer: Words say "test", but it reports a crash at error level.
- `hardneg-test-runner-crashed` (trial 1), tags: should not have test-event. Why this is the gold answer: Words say "test", but it reports a crash at error level.
- `hardneg-payment-test-failed` (trial 1), no-dismissal: hid a real failure (suggestion: "Don't report it as a code bug; if the decline is unexpected,", tags: test-event). Why this is the gold answer: A failed payment in a test-named flow, at error level.
- `hardneg-payment-test-failed` (trial 1), tags: should not have test-event. Why this is the gold answer: A failed payment in a test-named flow, at error level.
- `logged-assistive-access` (trial 1), tags: missing infrastructure. Why this is the gold answer: A logged permission problem.
