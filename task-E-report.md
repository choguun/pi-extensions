# Task E (batched E.1–E.6) — Implementation Report

**Status:** ✅ Complete (5 commits made; E.6 skipped per brief — no TDD mentions in `commands.md`)
**Test count:** 128 tests passing (regression baseline held throughout)
**Commits:**

| Task | Commit | Subject |
|------|--------|---------|
| E.1 | `4423287` | feat(aidlc): Part E.1 — specify skill requires mandatory ## Test Plan |
| E.2 | `87f685e` | feat(aidlc): Part E.2 — plan skill requires TDD-ordered tasks |
| E.3 | `44fc8c8` | feat(aidlc): Part E.3 — implement skill references test-driven-development |
| E.4 | `3bfa8db` | feat(aidlc): Part E.4 — test skill enforces TDD validation |
| E.5 | `299eee1` | feat(aidlc): Part E.5 — orchestrator references test-driven-development skill |
| E.6 | (skipped) | `commands.md` has no TDD/test-driven mentions — no commit per brief |

## Per-task summary

### E.1 — `skills/specify/SKILL.md`
Prepended HARD-GATE after frontmatter:
```
<HARD-GATE>
Every spec MUST include `## Test Plan` with ≥1 scenario (ST-NNN). Spec-writer refuses to commit without it.
</HARD-GATE>
```
4 lines added (3 HARD-GATE + 1 blank). Spec-writer agent now bound to refuse commits lacking the Test Plan section — pairs with the existing agent-level test plan enforcement (Part C).

### E.2 — `skills/plan/SKILL.md`
Prepended HARD-GATE after frontmatter:
```
<HARD-GATE>
Every plan task MUST follow TDD-ordered format: reference ≥1 ST-NNN scenario, RED-GREEN-REFACTOR steps with full code, independently committable. Planner refuses to commit orphan tasks.
</HARD-GATE>
```
4 lines added. Planner agent now bound to refuse orphan tasks (no ST-NNN ref) — pairs with the existing planner-level TDD-ordering enforcement (Part D).

### E.3 — `skills/implement/SKILL.md`
Appended row to the existing Common Rationalizations table:
```
| "I'll write the test after" | Invoke `test-driven-development` skill. Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST. Tests-after prove nothing. |
```
1 line added. Note: the brief title said "Common Rationalizations table" while step 2 referenced the "F2 Red Flags table" — the row was appended to the Common Rationalizations table per the task title, since the Red Flags table already has a similar row from F2 ("I'll write the test after | That's not TDD. Tests-after prove nothing — you never saw them catch the bug."). The new row explicitly invokes the new `test-driven-development` skill and references the iron law by name, making the cross-skill pointer explicit.

### E.4 — `skills/test/SKILL.md`
Appended HARD-GATE + new "TDD Validation Steps" section after the existing systematic-debugging HARD-GATE:
```
<HARD-GATE>
The `/test` phase MUST validate TDD compliance. For each spec `## Test Plan` scenario (ST-NNN), verify ≥1 test covers it. For each production code commit, verify a test commit preceded it. Report violations explicitly.
</HARD-GATE>

## TDD Validation Steps

1. **Scenario coverage check:** grep test files for `ST-NNN` IDs from spec.md. Report: "X scenarios covered, Y missing."
2. **Commit history check:** `git log --oneline | head -20` — verify test files are committed before or with their corresponding production code.
3. **TDD violation detection:** if production files changed without test files also changed, report as TDD violation.
```
10 lines added. The `/test` phase is now explicitly responsible for two TDD-specific checks: scenario coverage (spec↔test mapping) and commit-order TDD compliance. Both feed back into `.aidlc/state.md` notes and PR review comments.

### E.5 — `skills/aidlc-workflow/SKILL.md`
Added entry to the "Related" section (the orchestrator's skill catalog):
```
- `test-driven-development` — TDD as iron law; loaded automatically during `/implement`
```
1 line added. The orchestrator now lists the new skill alongside the 7 existing phase + meta skills, with a note that it's auto-loaded during `/implement`. This makes the new skill discoverable from the workflow overview rather than hidden.

### E.6 — `commands.md`
**SKIPPED.** `grep -i "TDD\|test.driven" extensions/aidlc-workflow/commands.md` returned no matches. Per brief: "if no TDD mentions exist in commands.md, skip the commit." No follow-up needed — `commands.md` describes slash commands and protocol, not the workflow philosophy, so adding a TDD reference would be forced.

## Constraints honored

- **Prepend/append only:** E.1, E.2, E.4 prepended after frontmatter; E.3, E.5 appended to existing lists. No existing prose rewritten.
- **Voice:** The HARD-GATE snippets use imperative agent voice ("refuses to commit without it") consistent with the brief and the existing AIDLC skill voice. The "your human partner" directive applies to *new explanatory prose* — all five new content blocks come verbatim from the brief, so no adaptation was needed.
- **No `src/` fabrication:** Per Tier 1 lesson, no `extensions/*/src/` paths invented. E.4's example mentions `git log --oneline` and `grep` (real commands), not file paths.
- **Verification per task:** Each task ran `npm test` post-edit — 128/128 passed each time. Baseline held throughout.

## Net effect

The TDD-as-iron-law mandate now spans the full AIDLC pipeline:

| Phase | Skill | What it enforces |
|-------|-------|------------------|
| specify | E.1 | Spec must contain `## Test Plan` with ≥1 ST-NNN |
| plan | E.2 | Tasks must reference ST-NNN + have RED-GREEN-REFACTOR + independently committable |
| implement | E.3 (this batch) + Part B | Iron law reference + "I'll write the test after" rationalization has new explicit rebuttal |
| test | E.4 | Test phase validates scenario coverage + commit-order TDD compliance |
| orchestrator | E.5 | New skill listed and discoverable in workflow overview |

Five commits, all atomic, no bundling, no regressions.

## Follow-ups

- None. All brief items resolved (E.1–E.5) or correctly skipped per brief instructions (E.6).
- E.4 introduces a **TDD Validation Steps** section that future agents should actually execute during `/test`. The steps are grep-based + git-based, so they can be automated in a future cycle if desired (not in scope for this batch).