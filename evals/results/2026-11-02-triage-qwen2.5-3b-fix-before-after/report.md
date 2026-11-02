# Triage eval: qwen2.5:3b before vs after the test-event fix

Date 2026-11-02. Before: commit `9c8cf30`. After: commit `6da40ef` ("Stop model triage from calling an error-level or failure message a test").
37 cases x 3 trials = 111 runs each, Intel MacBook Pro (i9, 32 GB), Ollama, model `qwen2.5:3b`. Triage only.
This is a pipeline check with a small model, not a product baseline. Output of `evals/triage/compare.ts`.

| | before | after |
|---|---|---|
| Real failures hidden (must be 0) | 15 | **0** |
| Triage errors | 0 | 0 |
| Small-fix precision | n/a (never said small fix) | n/a |
| Small-fix recall | 0% (0/45, range 0% to 8%) | 0% (0/45, range 0% to 8%) |
| Grader: small-fix | 59% (66/111) | 59% (66/111) |
| Grader: no-dismissal | 86% (96/111, range 79% to 92%) | **100% (111/111, range 97% to 100%)** |
| Grader: tags | 78% (87/111, range 70% to 85%) | 84% (93/111, range 76% to 89%) |
| Grader: culprit | 56% (62/111) | 56% (62/111) |
| Median time per error | 6535 ms | 7082 ms |
| Total run time | 13 min 13 s | 14 min 10 s |

Case by case (a case passes when every grader passes in every trial): both pass 9, neither 24, only after 4 (nostack-error-message, hardneg-test-runner-crashed, hardneg-payment-test-failed, logged-cache-skip), only before 0.

## Misses left after the fix (same in all 3 trials unless noted)

These are the model's weakness, not the fixed bug.

- Never says "small fix": all 15 small-fix cases.
- Culprit not named: py-none-rstrip, py-none-subscript, py-int-plus-str, js-null-addlistener, js-reference-not-defined, lint-eslint-unused, hardneg-reference-test-word, py-valueerror-config-d3, py-keyerror-cache-d4, infra-permission-denied, infra-assistive-access, infra-http-503, infra-disk-full, logged-assistive-access; 2 of 3 trials: py-keyerror-guard-removed, py-indexerror-off-by-one, js-not-a-function; 1 of 3: go-nil-pointer.
- Missing `infrastructure`: infra-permission-denied, infra-assistive-access, infra-http-503, logged-assistive-access.
- Missing `third-party`: third-party-axios, third-party-sqlalchemy.
