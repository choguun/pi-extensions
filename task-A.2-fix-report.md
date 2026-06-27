# Task A.2 Fix Report — Review findings correction

**Branch:** `feat/tier-2-superpowers-fusion-tdd-as-iron-law-f5`
**Commit:** `882aab4`
**File touched:** `extensions/aidlc-workflow/skills/test-driven-development/SKILL.md`
**Diff:** 1 file changed, 4 insertions(+), 5 deletions(-)

## Fixes applied

All 5 findings from `.superpowers/sdd/task-A.2-review.md` resolved.

| # | Finding | Fix | Line (after) |
|---|---|---|---|
| 1 | Fabricated `extensions/*/src/` path | Removed; now `extensions/*/*.ts` only | 32 |
| 2 | Speculative `ST-NNN grep` | Reworded to `spec coverage (spec.md acceptance criteria)` | 408 |
| 3 | Misattributed `via iron law` phrase | Reworded to `enforces TDD by mandating the RED step` | 409 |
| 4 | Wrong `ReferenceError` hypothetical | Changed to `expected /some/cwd, got undefined` | 351 |
| 5 | Duplicate "Tests live in..." bullet | Removed the AIDLC-Specific Notes copy; kept the AIDLC test patterns copy (earlier, more contextual) | n/a |

## Verification

- `wc -l`: **418** (was 419 — net -1, the duplicate bullet)
- `npm test`: **121/121 pass** in 1.35s (baseline preserved; no test surface touched)
- `git diff --stat`: 1 file, 4+/5- lines
- `git status`: clean

## Out of scope (not addressed)

The review also flagged two suggestions (item 6) and two pre-existing issues (items 7–8). Per the user's instruction ("Fix A.2 review findings (4 factual inaccuracies + 1 duplication)"), these were not touched:

- 6. Example "GREEN" diff could be expanded
- 7. `bootstrap.ts:146-149` real comment is richer than the example
- 8. `agents/implementer.md` doesn't link to `test-driven-development` skill

These remain in the follow-up backlog for A.2.1+ or Part G.

## Tests

- 121/121 pass (no change from baseline)
- No new tests added (content-only change; Part G will add coverage for the skill content)
