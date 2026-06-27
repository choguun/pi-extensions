# Task E Fix Report — Resolve E.3 review finding (duplicate TDD row)

**Branch:** `feat/tier-2-superpowers-fusion-tdd-as-iron-law-f5`
**File touched:** `extensions/aidlc-workflow/skills/implement/SKILL.md`
**Diff:** 1 file changed, 1 insertion(+), 1 deletion(-)

## Root cause

E.3 deviated from the brief: the new row referencing `test-driven-development` was appended to `## Common Rationalizations` instead of folded into the existing `## Red Flags` row that already covered the same `"I'll write the test after"` thought. Result: the file had two rows with identical Thought cells, which makes the table feel redundant and contradicts the brief ("Find the existing table that mentions TDD and append a row referencing the new skill").

The review's verdict was ❌ (Request changes); both fixes it offered were acceptable. **The preferred option was chosen:** edit the existing Red Flags row in place rather than move/copy the row to Common Rationalizations.

## Fix applied

**Option chosen:** *(Preferred per review)* Edit the existing Red Flags row's "Reality" cell to add the skill reference. Do not add a new row.

**Before** (two rows, both with `"I'll write the test after"`):

```
## Red Flags
...
| "I'll write the test after" | That's not TDD. Tests-after prove nothing — you never saw them catch the bug. |
...
## Common Rationalizations
...
| "I'll skip the failing pre-existing test" | Note it. Don't silently bypass. The next phase needs to know. |
| "I'll write the test after" | Invoke `test-driven-development` skill. Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST. Tests-after prove nothing. |
```

**After** (one row, in Red Flags, with skill reference folded in):

```
## Red Flags
...
| "I'll write the test after" | That's not TDD. Invoke `test-driven-development` skill. Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST. Tests-after prove nothing — you never saw them catch the bug. |
...
## Common Rationalizations
...
| "I'll skip the failing pre-existing test" | Note it. Don't silently bypass. The next phase needs to know. |
```

Exactly one row with that thought now exists; the `test-driven-development` skill reference is preserved; the iron law phrasing is preserved verbatim; the Red Flags table stays the single source of truth for "you're rationalizing" thoughts.

## Verification

- **Single source of truth:** `grep -c "I'll write the test after" extensions/aidlc-workflow/skills/implement/SKILL.md` → **1** (was 2)
- **Skill reference preserved:** `grep -c "test-driven-development" extensions/aidlc-workflow/skills/implement/SKILL.md` → **1** (was 1, unchanged)
- **Iron law wording preserved:** "Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST" — 1 occurrence (was 1)
- **Diff stats:** `git diff --stat` → `1 file changed, 1 insertion(+), 1 deletion(-)`
- **Test suite:** `cd extensions/aidlc-workflow && npm test` → **128 / 128 pass** (baseline held)

```
ℹ tests 128
ℹ pass 128
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

## Why preferred over the acceptable alternative

The review's *acceptable* alternative was: remove the existing Red Flags row, keep the new Common Rationalizations row. That option was rejected for two reasons:

1. **The Red Flags row had more nuance.** It already carried "you never saw them catch the bug" — the epistemic reason TDD matters (you didn't observe the test fail). The new row dropped that nuance. Folding the skill reference into the existing row keeps both the action directive (invoke skill) and the epistemic reason (you never saw it catch the bug).
2. **The section semantics matter.** `## Red Flags` = STOP-and-invoke moments (action directive). `## Common Rationalizations` = excuses with rebuttals. The new row's content was always more "Red Flag" style than "Rationalization" style — putting it in Red Flags aligns content with section.

## Audit trail

- `task-E-review.md` (the review that flagged the deviation) — already existed in `.superpowers/sdd/`.
- `task-E-report.md` (the original batch implementation report) — created alongside this fix; lives at the worktree root, matching the pattern set by `task-D.1-report.md` / `task-C.1-report.md` etc. (the report had been written but not yet committed when the review ran, which is why the review noted it as "missing"; this fix commit includes it).
- This file (`task-E-fix-report.md`) — the response to the E.3 ❌ finding.

## Follow-ups (not in this commit)

The review also surfaced three pre-existing issues that are NOT fixed here (out of scope for the E.3 finding; same as how `task-A.2-fix-report.md` left findings 6/7/8 in the backlog):

1. `skills/specify/SKILL.md` template uses `## Testing Strategy`, not `## Test Plan` — D.1 review's template-vs-HARD-GATE mismatch.
2. `skills/plan/SKILL.md` template doesn't include RED-GREEN-REFACTOR Steps block — same mismatch.
3. No content tests for HARD-GATEs in skill files — Part G follow-up.

These remain in the F-series backlog.
