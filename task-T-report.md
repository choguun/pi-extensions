# Task T.1 + T.2 Report — Skills-Polish + Progress Tests

## Status

✅ **COMPLETE** — both test files written, all tests green, committed.

- **Commit**: `0f0c60d`
- **Tests**: 154 baseline + 15 (T.1) + 6 (T.2) = **175 pass, 0 fail**
- **Typecheck**: clean

## T.1 — skills-polish.test.ts (15 tests)

**Created:** `extensions/aidlc-workflow/test/skills-polish.test.ts`

15 content tests covering F8 (receiving-code-review) and F9
(finishing-a-development-branch) skills — verbatim from plan T.1 step 1.

### F8 tests (8)

1. SKILL.md exists
2. Valid frontmatter (name + description)
3. Description ≤ 1024 chars
4. Contains `## The Response Pattern` + all 6 discipline step words
   (READ, UNDERSTAND, VERIFY, EVALUATE, RESPOND, IMPLEMENT)
5. Contains ban-list phrases (You're absolutely right!, Great point!, Thanks!)
6. Contains `## Handling Unclear Feedback`
7. Contains `## When To Push Back`
8. install.sh symlink points to right path (skips if symlink missing)

### F9 tests (7)

9. SKILL.md exists
10. Valid frontmatter
11. Description ≤ 1024 chars
12. Contains `pi-extensions-worktrees/feat/` (AIDLC worktree detection)
13. Contains 4 options (Merge back, Push and create PR, Keep as-is, Discard)
14. Contains `git worktree remove` + `git worktree prune` (cleanup)
15. install.sh symlink points to right path

### Discovery during TDD

The "F8 contains ban-list phrases" test (5) failed RED with the SKILL.md
as-committed: the file banned `"Thanks for catching that!"` and
`"Thanks for [anything]"` but not the exact literal `"Thanks!"` that
the plan's test (verbatim) requires.

**Minimal fix:** added one bullet `❌ "Thanks!"` to the existing
"Acknowledging Correct Feedback" ban-list. This aligns the SKILL.md
content with the plan's test contract (which was approved at
`7d69cc4`); the new bullet is consistent with the surrounding list
("Thanks!" is the canonical performative phrase to ban — the
existing entries are broader regex-style bans of the same pattern).

No other production code modified by T.1.

## T.2 — progress.test.ts (6 tests)

**Created:** `extensions/aidlc-workflow/test/progress.test.ts`

6 tests covering the F12 `.aidlc-progress.md` ledger file format +
read/append semantics. Tests the underlying file operations directly
(the `aidlc` tool itself needs ExtensionAPI mock; the file I/O is the
load-bearing part).

1. `append-progress format: complete-status line` — `- T-001: complete (commits abc..def, review clean)`
2. `append-progress format: BLOCKED-status line with reason` — `- T-003: BLOCKED (waiting for human input)`
3. `read-progress: returns array of task lines` — parses lines starting with `- T-<id>: `
4. `read-progress: returns empty when file missing` — fresh checkout, no ledger yet
5. `read-progress: filters non-task lines` — skips markdown headers, dates, prose
6. `append-progress: appends (not overwrites) on repeat` — `appendFileSync` accumulates

Minor deviation from plan: the plan's test 6 used
`const { appendFileSync } = await import("node:fs")` inside a
non-async test function (which would error). Fixed by importing
`appendFileSync` at module top with the other fs imports — same
behavior, valid syntax.

## Verification

```bash
$ cd extensions/aidlc-workflow && npm test
ℹ tests 175
ℹ pass 175
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 1391.248458
```

```bash
$ npx tsc --noEmit
EXIT: 0
```

## Files changed

- `extensions/aidlc-workflow/test/skills-polish.test.ts` (NEW, 5036 B)
- `extensions/aidlc-workflow/test/progress.test.ts` (NEW, 4215 B)
- `extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md`
  (added 1 line: `❌ "Thanks!"` to the ban-list)

## Follow-ups (none blocking)

- The brief said "14 content tests" but T.1 verbatim has 15 (8 + 7).
  Counted by inspecting the actual test code. The brief also said
  "154 + 14 + 6 = 174" (which doesn't arithmetically close to 174).
  Real count: 154 + 15 + 6 = **175**.
