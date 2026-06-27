---
title: Tier 7 F12-polish: 7 deferred fixes (schema + tool list + normalizer + unknown-action + validate-plan + parseFrontmatter fixes)
type: spec
status: approved
domain: [aidlc-workflow]
---

# Tier 7 F12-polish — design

7 small fixes that were deferred across Tiers 1-5. Final polish release.

## Goal

Clean up 7 small issues filed as "non-blocking" or "future loop" items during Tiers 1-5 reviews. All are minor, all have identified fixes, all have clear tests (where behavior changes).

## Scope

**In scope (7 fixes, 2 commits):**

**Commit 1 — Tier 1 polish (4 fixes):**
- **Fix 1**: `AidlcParams` TypeBox schema declares `task_id`, `status`, `commit_range`, `review_status`, `reason`, `previous_report`, `previous_review` as optional Strings. Remove `params as Record<string, unknown>` cast.
- **Fix 2**: `implementer.md` frontmatter `tools:` list adds `aidlc`.
- **Fix 3**: `skills.test.ts:113` symlink target normalizer uses correct regex pattern.
- **Fix 4**: `index.ts:1212` unknown-action error message includes `classify`.

**Commit 2 — Tier 5 polish (3 fixes):**
- **Fix 5**: Wire `validatePlanFormat` from `test/plan-format.test.ts` into a new `aidlc validate-plan` action. New tests in `test/validate.test.ts`.
- **Fix 6**: `parseFrontmatter` strips `|` block-scalar indicator from captured values.
- **Fix 7**: `parseFrontmatter` schema validation — check required fields, reject unknown keys.

**Out of scope:** F10 (multi-harness adapters — deferred for cross-harness users), trailing newlines, "expected_behavior" unused, other small cleanups.

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Commit structure | **B. 2 commits grouped by tier** (Tier 1 / Tier 5) |
| 2 | Test additions | **A. Tests for behavioral changes only** (fix 2 has no test — markdown self-evident) |
| 3 | Scope strictness | **A. Strict 7 only** — no scope creep |

## Architecture

### Modify

**Commit 1 — Tier 1 polish:**
- `extensions/aidlc-workflow/index.ts` — Fix 1 (schema) + Fix 4 (unknown-action message)
- `extensions/aidlc-workflow/agents/implementer.md` — Fix 2 (tools list)
- `extensions/aidlc-workflow/test/skills.test.ts` — Fix 3 (normalizer)

**Commit 2 — Tier 5 polish:**
- `extensions/aidlc-workflow/index.ts` — Fix 5 (validate-plan action case)
- `extensions/aidlc-workflow/plan-format.ts` (NEW) — extract `validatePlanFormat` + `isLegacyPlan` from test
- `extensions/aidlc-workflow/test/evals/harness.ts` — Fix 6 (strip `|`) + Fix 7 (schema validation)
- `extensions/aidlc-workflow/test/plan-format.test.ts` — update import path
- `extensions/aidlc-workflow/test/validate.test.ts` — new tests for validate-plan action

### No changes

- `bootstrap.ts`, agent files other than implementer.md, skill files, docs

### Commit structure

```
Commit 1: F12.1 — Tier 1 polish (AidlcParams schema, implementer tools, normalizer, unknown-action)
Commit 2: F12.2 — Tier 5 polish (validate-plan action, parseFrontmatter fix, schema validation)
```

## Components

(Full component details captured in the planning conversation; implementation will follow the established patterns from Tiers 1-5.)

## Timeline

2026-06-26 | spec drafted + approved — user approved all 3 design decisions and requested immediate implementation. 7 small fixes total, 2 commits.

## Timeline (continued)

2026-06-26 | F12-polish shipped — 7 small fixes (AidlcParams TypeBox schema, implementer tools list, normalizer regex, unknown-action message, validate-plan action + plan-format.ts module, parseFrontmatter strip |, parseFrontmatter schema validation) in 2 commits. 14 new tests (4 for Commit 1 + 10 for Commit 2). Total: 230 tests passing.
