# Evals

Measures how good Code Akos is at triage and (later) fixing, with answers written down first. Not part of the shipped app. Plan: see the project's eval plan.

## Run

```
npm run eval:triage                          # rule-based triage, free, instant
npm run eval:triage -- --model qwen3-14b     # a local model through Ollama
npm run eval:triage -- --model qwen3-14b --trials 3 --gate
npm run eval:grouping                        # issue grouping, deterministic
npm run eval:fix                             # fix eval dry run: reference fixes, no model (must be 100%)
npm run eval:fix -- --model qwen2.5-3b --gate
npm run eval:fix -- --model deepseek --trials 3 --gate
```

- Models are named profiles in `models.json`. Add one with one more line. Keys stay in the environment: the file only names the variable (`apiKeyEnv`).
- `--trials N` runs every case N times. Cases whose answer changes between trials are listed.
- `--gate` exits 1 if any real failure was hidden ("Don't report it" or tagged a test message). That count must be 0.
- Reports go to `evals/results/<date>-triage-<profile>/` (`report.md` and `raw.json`). They list every miss. Numbers carry a 95% range; with 37 cases the ranges are wide.

## Layout

- `core/` stats (Wilson range), model profiles, shared types.
- `triage/` cases (`cases.ts`), graders, runner, metrics, report, CLI.
- `fix/` seeded bugs (`cases.ts`), each a small repository with hidden tests; runner, graders G1 to G6, case checks, metrics, report, CLI.
- `grouping/` pairs of events and whether they belong in one issue. Also runs in `npm test`.

## Adding a case

Add it to `triage/cases.ts` with a `why` line a second person can disagree with. Do not change a case after a published run because a model got it wrong. A new grader is a new class implementing `TriageGrader`; the runner does not change.

`depth` says how far the real cause is from the crash line (D0 the crash line itself, D3 a file the stack does not show, D4 data or state). The report shows where `bot-safe` is wrongly given by depth.

## Fix eval

Each case is a small TypeScript or Python repository with one bug put in, the error it throws, and hidden tests the agent never sees. The runner sends it through the resolver's real `attemptFix` (worktree, verify before and after, the agent, commit). Only `push` is replaced, so nothing leaves the machine.

- Graders: G1 outcome (fixed, or skipped on a should-skip case), G2 build, G3 fail-to-pass (the hidden bug test now passes), G4 pass-to-pass (nothing else broke), G5 diff rules (no test edits, a size cap, no change at all on a should-skip case), G6 safety (nothing outside the worktree changed). A case counts as resolved only when every grader that applies passes.
- Before grading, the original tests are put back and the hidden tests copied in, so editing a test cannot make it pass.
- `--gate` exits 1 on any fix pushed to a should-skip case, or any write outside the worktree.
- Every run first checks every case (the bug test fails on the bug, passes with the reference fix, and the regression test passes both times). A broken case stops the run before any model time is spent. `npm test` runs the same checks.
- Without `python3` the Python cases are left out, and the report says so.
- The 11 cases are a dev set: prompts may be tuned on them, so do not publish a number from them. The plan keeps a separate frozen set for that.

Known product gap the fix eval found: the resolver commits with `git add -A`, so anything the verify command writes and the project does not ignore (for example Python's `__pycache__`) is committed with the fix. The Python cases carry a `.gitignore`, as real projects do.
