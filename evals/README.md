# Evals

Measures how good Code Akos is at triage and (later) fixing, with answers written down first. Not part of the shipped app. Plan: see the project's eval plan.

## Run

```
npm run eval:triage                          # rule-based triage, free, instant
npm run eval:triage -- --model qwen3-14b     # a local model through Ollama
npm run eval:triage -- --model qwen3-14b --trials 3 --gate
npm run eval:grouping                        # issue grouping, deterministic
```

- Models are named profiles in `models.json`. Add one with one more line. Keys stay in the environment: the file only names the variable (`apiKeyEnv`).
- `--trials N` runs every case N times. Cases whose answer changes between trials are listed.
- `--gate` exits 1 if any real failure was hidden ("Don't report it" or tagged a test message). That count must be 0.
- Reports go to `evals/results/<date>-triage-<profile>/` (`report.md` and `raw.json`). They list every miss. Numbers carry a 95% range; with 37 cases the ranges are wide.

## Layout

- `core/` stats (Wilson range), model profiles, shared types.
- `triage/` cases (`cases.ts`), graders, runner, metrics, report, CLI.
- `grouping/` pairs of events and whether they belong in one issue. Also runs in `npm test`.

## Adding a case

Add it to `triage/cases.ts` with a `why` line a second person can disagree with. Do not change a case after a published run because a model got it wrong. A new grader is a new class implementing `TriageGrader`; the runner does not change.

`depth` says how far the real cause is from the crash line (D0 the crash line itself, D3 a file the stack does not show, D4 data or state). The report shows where `bot-safe` is wrongly given by depth.
