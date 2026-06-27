# Task B.1 Fix Report

## Change

Removed the `extensions/*/src/` fabrication from `extensions/aidlc-workflow/agents/implementer.md` Hard Rule #1, per review finding B.1 Warning #1.

**File:** `extensions/aidlc-workflow/agents/implementer.md` (line 32)

**Before:**
```
1. **Write the failing test FIRST.** Before any production code in `extensions/*/src/` or `extensions/*/*.ts`.
```

**After:**
```
1. **Write the failing test FIRST.** Before any production code in `extensions/<extension>/*.ts`.
```

**Diff size:** +1 / -1 (single line replacement).

## Rationale

The path `extensions/*/src/` does not exist in any extension. Production code lives at `extensions/<extension>/*.ts` (verified: `bootstrap.ts`, `worktree.ts`, `classifier.ts`, `index.ts`, `substrate.ts`, `commands.ts` all sit next to `test/`, not under `src/`). The same path error was flagged in the Task A.2 review — applying the same fix here.

## Verification

`cd extensions/aidlc-workflow && npm test`

```
ℹ tests 128
ℹ suites 0
ℹ pass 128
ℹ fail 0
```

All 128 tests pass (no regression).

## Follow-up

Per the review's Warning #7, the same `extensions/*/src/` path error also appears in the brief (`docs/plans/2026-06-26-aidlc-tier-2-f5-tdd-as-iron-law.md`). A follow-up brief-correction task should drop `extensions/*/src/` across all brief path references before Parts C/D/E start, so the wrong path doesn't propagate further. This task only fixes the agent-file manifestation of the error.
