# Task D.1 Report — planner produces TDD-ordered tasks with ST-NNN refs

**Status:** ✅ Complete
**Commit:** `87b7287e1a645b74122c9b548f5b865349ac3384`
**Tests:** 128 / 128 pass (0 fail, 0 skip)

## Summary

Prepended a HARD-GATE and a TDD-ordered task format section to
`extensions/aidlc-workflow/agents/planner.md`. Every `.aidlc/plan.md`
produced by the planner must now contain T-XXX tasks whose
`**Implements:**` line references ST-NNN scenarios from
`.aidlc/spec.md`, with a full Steps block (RED → GREEN → commit) that
the implementer can copy-paste directly. A documented Orphan Task
Exception lets the planner mark pure refactors with
`**Implements:** (non-test refactor)` when no new test scenario is
introduced.

This closes Part D of the Tier-2 F5 TDD-as-iron-law plan. Part C
(spec-writer → ST-NNN scenarios) and Part D (planner → T-XXX
references to those scenarios) are now linked: spec produces the IDs,
plan references them, implementer executes the RED-GREEN-REFACTOR
cycle per task.

## Changes

**File:** `extensions/aidlc-workflow/agents/planner.md` (+83 lines, 0 deletions)

Added (between frontmatter and the existing "You are a planner…" body):

1. **H1 title** `# Planner (TDD-ordered tasks)` — flags the file's
   role in the TDD-as-iron-law fusion.
2. **HARD-GATE block** — every plan.md MUST contain TDD-ordered tasks
   with `**Implements:** ST-NNN` references; refuse to commit otherwise.
3. **Task Format section** — the required structure for each T-XXX
   task: `Implements` line, Files block, Steps block with five steps
   (RED → verify FAIL → GREEN → verify PASS → commit). Each step
   includes the `Run:` command and the `Expected:` output.
4. **Hard Rules** (5 rules) — every task refs ≥1 ST-NNN; RED first;
   full code per step; each task independently committable; plan
   validated by the `validate-plan` aidlc action (Part H).
5. **Orphan Task Exception** — pure refactors (rename across
   codebase, no new test scenario) use the literal marker
   `**Implements:** (non-test refactor)` and a 4-step baseline-PASS →
   apply → verify-PASS → commit cycle. Includes a worked example
   (T-007 rename `makeSlug` → `slugify`) and four rules governing when
   the exception applies (default to non-exception; behavior-changing
   refactors are NOT exceptions).

The existing body (the planner role description, output contract,
constraints) was preserved unchanged below the new `---` separator.

## Verification

**Brief's Step 3 grep** (`grep -A2 "TDD-ordered" extensions/aidlc-workflow/agents/planner.md | head -10`):

```
# Planner (TDD-ordered tasks)

<HARD-GATE>
Every plan.md MUST contain TDD-ordered tasks with `**Implements:** ST-NNN` references. Refuse to commit a plan whose tasks lack ST-NNN refs unless the Orphan Task Exception applies.
</HARD-GATE>
```

Returns the H1 title + HARD-GATE block — confirms the content is
present.

**Test suite** (`cd extensions/aidlc-workflow && npm test` from the
worktree):

```
ℹ tests 128
ℹ pass 128
ℹ fail 0
```

Matches the brief's target (`128 tests still pass`).

## Notes / Follow-ups

- **TDD iron-law is a no-op for this task.** The brief is a markdown
  documentation change to an agent instruction file. No TypeScript in
  `extensions/*/*.ts` was modified, so the "no production code without
  a failing test first" rule does not trigger. The brief's own
  verification command (`128 tests still pass`) confirms the
  regression baseline is intact.
- **No new test was added for the agent file itself** — same as
  Parts A, B, C. The TDD-ordered task format is meta-guidance for
  future `.aidlc/plan.md` files, not a runtime check. When Part H
  ships the `validate-plan` aidlc action, that validator will enforce
  the `**Implements:** ST-NNN` requirement at runtime.
- **The Orphan Task Exception is forward-looking.** No validator
  exists yet to flag orphan tasks. The exception is a documented
  escape hatch so when the validator lands, pure refactors have a
  sanctioned way to bypass the ST-NNN requirement without lying about
  the task type. The four rules in the section explicitly limit the
  exception's scope (behavior-changing refactors still need ST-NNN).
- **Cross-part coherence.** Part A = test-driven-development skill
  (the operating manual). Part B = implementer.md hardened with iron
  law + RED-GREEN-REFACTOR. Part C = spec-writer.md mandates
  `## Test Plan` with ST-NNN. Part D (this task) = planner.md mandates
  T-XXX tasks with `**Implements:** ST-NNN`. The chain is now
  complete: spec produces scenarios → plan references them → implementer
  executes one cycle per task.
