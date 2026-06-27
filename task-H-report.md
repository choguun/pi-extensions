# Task H Report — `aidlc validate-*` Actions

**Branch:** `feat/tier-2-superpowers-fusion-tdd-as-iron-law-f5`
**Baseline:** 136 tests passing (per task brief)
**Final:** 153 tests passing

## Summary

Three new `aidlc` tool actions added, each as a separate TDD cycle (RED → GREEN → REFACTOR → commit):

| Action    | Commit    | Purpose                                                                                         |
| --------- | --------- | ----------------------------------------------------------------------------------------------- |
| `validate-spec`  | `db1266a` | Checks `.aidlc/spec.md` has `## Test Plan` with ≥1 `ST-NNN` scenario heading             |
| `validate-plan`  | `148d224` | Checks every `T-NNN` task in `.aidlc/plan.md` references ≥1 `ST-NNN` (or has `(non-test refactor)` marker) |
| `validate-tdd`   | `89537ac` | Reads `git diff HEAD --numstat` + untracked files; flags production-only changes as TDD violations |

All three return `{ valid: boolean, errors: string[], ...details }`. None block `/ship` — they're advisory gates the implementer skill reads.

## Tests Added

New file: `extensions/aidlc-workflow/test/validate.test.ts` — **17 new tests, all green**.

| Test                                                                          | Phase |
| ----------------------------------------------------------------------------- | ----- |
| `validate-spec: missing spec.md → valid=false, error mentions missing file`   | H.1   |
| `validate-spec: spec.md missing \`## Test Plan\` section → valid=false`       | H.1   |
| `validate-spec: Test Plan present but 0 ST-NNN scenarios → valid=false`       | H.1   |
| `validate-spec: Test Plan with 1 ST-001 scenario → valid=true`                | H.1   |
| `validate-spec: Test Plan with multiple ST-NNN scenarios → scenarioCount matches` | H.1   |
| `validate-plan: missing plan.md → valid=false, error mentions missing file`   | H.2   |
| `validate-plan: plan with no T-NNN tasks → valid=true (vacuously)`            | H.2   |
| `validate-plan: T-001 references ST-001 → valid=true`                         | H.2   |
| `validate-plan: T-NNN missing ST reference and missing (non-test refactor) marker → valid=false` | H.2 |
| `validate-plan: T-NNN with (non-test refactor) marker but no ST reference → valid=true` | H.2 |
| `validate-plan: mixed plan — some tasks have refs, some don't → lists every offender` | H.2 |
| `validate-tdd: clean tree (no changes) → valid=true, both counts zero`        | H.3   |
| `validate-tdd: production file modified, no test changes → valid=false`       | H.3   |
| `validate-tdd: test file modified → valid=true`                                | H.3   |
| `validate-tdd: production + test both changed → valid=true`                   | H.3   |
| `validate-tdd: untracked test file → valid=true (counts as test)`             | H.3   |
| `validate-tdd: untracked production file only → valid=false`                   | H.3   |

## TDD Discipline Followed

Each action followed the iron law: **failing test FIRST, then minimum impl to pass, then commit**. Verified:

1. **RED**: ran `node --test test/validate.test.ts` after writing tests; confirmed each test failed (action returns "Unknown action" → `details: {}` → `result.details.valid === undefined`).
2. **GREEN**: implemented minimum code to pass. Then ran the full suite to confirm 153 passing.
3. **REFACTOR**: small refactors happened during H.2 (line-based parser replaced a multiline regex after debugging showed `lastIndex` confusion).
4. **COMMIT**: one commit per H.x, separately, as the brief required.

## Notable Implementation Details

### `validate-spec`
- Reads `.aidlc/spec.md`; checks for `## Test Plan` heading AND ≥1 `### ST-NNN:` scenario.
- Defensive against missing file (`existsSync` check returns early).
- Returns `scenarioCount` in details for downstream tooling.

### `validate-plan`
- Parses `.aidlc/plan.md` line-by-line, finds every `### T-NNN:` heading, slices the body until the next heading.
- For each task: `body` includes the heading line so `(non-test refactor)` markers placed in the heading (`### T-001: rename foo (non-test refactor)`) are detected.
- Regex alternative was tried first (multiline with lazy `[\s\S]*?` and lookahead) — it silently dropped tasks after the first match. Line-based parser is more debuggable.
- Returns `offendingTasks: string[]` (the task IDs without refs) so callers can highlight them.

### `validate-tdd`
- Uses `git diff HEAD --numstat` for tracked changes (added/removed lines per file).
- Falls back to `git status --porcelain` for untracked files (counts their full line count as "added" — they're brand-new).
- Classifies a file as "test" if path matches `/test/` OR ends in `.test.{ext}` OR `.spec.{ext}`.
- Soft check: returns `valid=false` with a clear "Did you skip RED?" message but doesn't block ship — the implementer skill decides.
- Includes `productionFiles` and `testFiles` counts in details, not just line totals, so callers can distinguish "many small files" from "one huge file".

## Schema + Error-Message Updates

- `AidlcParams.action.description` extended to include all three new actions.
- The "Unknown action" error message lists all 9 valid actions.

## Commits

```
89537ac feat(aidlc): Part H.3 — validate-tdd action for TDD balance check
148d224 feat(aidlc): Part H.2 — validate-plan action for T-NNN ↔ ST-NNN binding
db1266a feat(aidlc): Part H.1 — validate-spec action for Test Plan enforcement
```

## Test Count

| Stage              | Tests |
| ------------------ | ----- |
| Baseline (start)   | 136   |
| After H.1          | 141   (+5) |
| After H.2          | 147   (+6) |
| After H.3 (final)  | 153   (+6) |

All 153 tests pass with clean typecheck.

## Files Changed

- `extensions/aidlc-workflow/index.ts` — 3 new `if (action === "validate-*")` cases, schema description update, unknown-action message update.
- `extensions/aidlc-workflow/test/validate.test.ts` — new file, 17 tests across 3 sections.