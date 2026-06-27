# Task C.1 Report — spec-writer enforces mandatory `## Test Plan`

**Status:** ✅ Complete
**Commit:** `7564b99ad045d0a2ed0eccf148f2144eae8355c6`
**Tests:** 128 / 128 pass (0 fail, 0 skip)

## Summary

Prepended a HARD-GATE and a Mandatory `## Test Plan` section to
`extensions/aidlc-workflow/agents/spec-writer.md`. Every `.aidlc/spec.md`
produced by the spec-writer must now include a `## Test Plan` block with
ST-NNN scenarios (acceptance, edge, error) before commit; the agent
refuses to commit otherwise.

## Changes

**File:** `extensions/aidlc-workflow/agents/spec-writer.md` (+44 lines, 0 deletions)

Added (between frontmatter and the existing "You are a specification
writer..." body):

1. **H1 title** `# Spec Writer (TDD-aware)` — flags the file's role in
   the TDD-as-iron-law fusion.
2. **HARD-GATE block** — every spec MUST include `## Test Plan` before
   commit; refuse to commit otherwise.
3. **Mandatory `## Test Plan` section** — the required structure
   (ST-NNN scenarios with Given/When/Then, plus Edge Cases / Error Cases
   subsections).
4. **Minimum requirements** — at least one ST-NNN per acceptance
   criterion, at least one edge OR error case, sequential IDs, IDs
   referenced by plan tasks and tests.
5. **Hard Rules** (5 rules) — refuse without Test Plan, sequential IDs,
   testable scenarios, explicit edge/error subsections, Test Plan
   ordered before Implementation Notes.

## Verification

Brief's Step 3 grep (`grep -A2 "Test Plan" extensions/aidlc-workflow/agents/spec-writer.md | head -10`)
returns the HARD-GATE line and the section header — confirms the
content is present.

Test suite (`cd extensions/aidlc-workflow && npm test` from the
worktree):

```
ℹ tests 128
ℹ pass 128
ℹ fail 0
```

Matches the brief's target (`128 tests still pass`).

## Notes / Follow-ups

- No new test was added for the agent file itself. The brief's
  verification target is regression-only ("128 tests still pass"); the
  Test Plan enforcement is meta-guidance for future `.aidlc/spec.md`
  files, not a runtime check. If a future task wants to lint spec.md
  for the Test Plan section, that would be a new task (e.g., add a
  `test/spec-lint.test.ts` that reads `.aidlc/spec.md`).
- Running `npm test` from the main checkout (`/Users/choguun/.../pi-extensions/extensions/aidlc-workflow`)
  surfaces a pre-existing failure of `install.sh symlink points to
  verification-before-completion` because `install.sh` was last run
  from the worktree, so `~/.pi/agent/skills/verification-before-completion/SKILL.md`
  points at the worktree path. This failure is unrelated to C.1
  (introduced when F3 was installed) and disappears when tests run from
  the worktree, which matches the brief's verification command.
- The spec-writer.md change is markdown-only; no TypeScript changed, so
  typecheck is unaffected.