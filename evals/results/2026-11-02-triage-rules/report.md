# Triage eval: rules (rule-based, no model)

Date 2026-11-02, commit `5f688cb`. 37 cases x 1 trial(s) = 37 runs. Ranges are 95% (Wilson); with this few cases they are wide.

## Result

- Real failures hidden (must be 0): **0**
- Triage errors (model failed to answer): 0
- Small-fix precision: 100% (10/10, range 72% to 100%)
- Small-fix recall: 67% (10/15, range 42% to 85%)
- Median time per error: 0 ms

## By grader

| Grader | Passed |
|---|---|
| small-fix | 86% (32/37, range 72% to 94%) |
| no-dismissal | 100% (37/37, range 91% to 100%) |
| tags | 97% (36/37, range 86% to 100%) |
| culprit | 100% (37/37, range 91% to 100%) |

## Wrongly called a small fix, by depth of the cause

Only cases that are NOT a small fix. D0 = the crash line is the bug; D3 = the cause is in a file the stack does not show.

| Depth | Wrongly called small fix |
|---|---|
| D2 | 0% (0/1, range 0% to 79%) |
| D3 | 0% (0/1, range 0% to 79%) |
| D4 | 0% (0/3, range 0% to 56%) |
| none | 0% (0/17, range 0% to 18%) |

## Every miss

- `py-keyerror-guard-removed` (trial 1), small-fix: said not a small fix, expected small fix. Why this is the gold answer: A guard was removed; one `.get` or `in` check restores it.
- `py-indexerror-off-by-one` (trial 1), small-fix: said not a small fix, expected small fix. Why this is the gold answer: A loop bound one too far.
- `py-zero-division-empty` (trial 1), small-fix: said not a small fix, expected small fix. Why this is the gold answer: Averaging an empty list; one guard fixes it.
- `py-int-plus-str` (trial 1), small-fix: said not a small fix, expected small fix. Why this is the gold answer: A value read as text and added to a number.
- `go-nil-pointer` (trial 1), small-fix: said not a small fix, expected small fix. Why this is the gold answer: A nil check missing before a field access.
- `infra-disk-full` (trial 1), tags: missing infrastructure. Why this is the gold answer: The disk is full. No regex in the rules knows this wording.
