---
name: plan
description: Breaks the AIDLC spec into ordered, testable tasks. Use when the current AIDLC phase=planning. Reads `.aidlc/spec.md`; produces `.aidlc/plan.md` with one task per vertical slice.
---

<HARD-GATE>
Every plan task MUST follow TDD-ordered format: reference ≥1 ST-NNN scenario, RED-GREEN-REFACTOR steps with full code, independently committable. Planner refuses to commit orphan tasks.
</HARD-GATE>

<HARD-GATE>
Plans use the full superpowers writing-plans format. See `_template.md` at `extensions/aidlc-workflow/docs/plans/_template.md` for the canonical structure. Plans without `**Files:**`, `**Steps:**` with complete code, or exact commands are invalid.
</HARD-GATE>

# Plan

Decompose the spec into tasks. Each task is a **vertical slice** (one complete feature path: schema + API + UI for one user-visible thing), not a horizontal slice (all DB, then all API, then all UI).

## When to use

- The current AIDLC phase is `planning`
- The user said `/plan`
- A spec exists at `.aidlc/spec.md`

## Inputs

- `.aidlc/spec.md`
- The project structure (so tasks target real files)

## Output

`.aidlc/plan.md` — the plan, with:
- A dependency graph (what depends on what)
- Ordered tasks (T-001, T-002, …)
- Each task has: description, files to touch, acceptance criteria, test approach

## Template

```markdown
# Plan: <Feature Name>

## Dependency Graph

```
DB schema for X
   │
   ├── API endpoint /x
   │       │
   │       ├── Frontend page /x
   │       │
   │       └── Test
   │
   └── DB seed / migration
```

Implementation order follows the graph bottom-up: foundations first.

## Tasks

### T-001: <Title>

**Files:**
- `src/feature/model.ts` (new)
- `src/feature/__tests__/model.test.ts` (new)

**Description:**
One paragraph. What this task delivers as a user-visible thing.

**Acceptance criteria:**
- [ ] AC1: Specific, testable
- [ ] AC2: Specific, testable
- [ ] AC3: Specific, testable

**Test approach:**
Unit test for the model. Snapshot for the API. E2E for the user flow.

**Estimated effort:** S / M / L

### T-002: <Title>

... (same structure)
```

## How to slice

**Vertical (good):**
- T-001: User can sign up
- T-002: User can log in
- T-003: User can view their profile
- T-004: User can update their profile

Each task delivers a working, testable feature path.

**Horizontal (bad):**
- T-001: Build the entire database
- T-002: Build all API endpoints
- T-003: Build all UI components
- T-004: Connect everything

This makes T-001, T-002, T-003 invisible to the user until T-004. Each task is a "dead end" with no working feature.

**Heuristic for slicing:** each task should be a sentence a user could say "yes, I can see that working." If the task is invisible to a user, it's a horizontal slice.

## Task sizing

- **S (small):** < 30 minutes, 1-2 files, no new abstractions
- **M (medium):** 30-120 minutes, 3-5 files, may add a small abstraction
- **L (large):** > 2 hours, 6+ files, introduces a new module or pattern

If a task is L, **split it**. L tasks are where TDD breaks down and quality drifts.

**Maximum:** 10 tasks per plan. If you have more, you're not slicing finely enough OR the feature is too big for one AIDLC cycle (split into multiple cycles).

## After writing

1. Commit: `git add .aidlc/ && git commit -m "plan: <feature>"`
2. Push: `git push`
3. Update the PR description: append a "Plan" section with a link to `.aidlc/plan.md`
4. Update `.aidlc/state.md`:
   - `phase: implementing`
   - `next_action: Run /implement T-001`
   - `last_action: <timestamp>`

## Common mistakes

- **Tasks are too big**: if any task has more than 5 acceptance criteria, split it
- **Tasks depend on each other in a chain**: T-002 needs T-001 done, T-003 needs T-002 done. Find the parallelizable work.
- **No acceptance criteria**: "implement X" is not a task. "Implement X such that A, B, C are testable" is.
- **No test approach**: every task has a test approach. If you can't write a test, you can't know the task is done.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "I'll figure it out as I go" | As-you-go is no plan. The implementer will guess — and guess wrong. |
| "This is too simple for a plan" | Simple plans are fast. Write one anyway. |
| "T-001 isn't user-visible, that's fine" | If a user can't say "yes I see that", it's a horizontal slice. Reslice. |
| "Tasks depend on each other" | Sequential chains kill parallelism. Find the parallelizable work. |
| "I'll add ACs as I implement" | ACs are the spec. If you find one mid-implementation, the spec was incomplete. |
| "The test approach is 'TBD'" | TBD = no plan. Pick unit/integration/e2e now. |
| "L-sized tasks are fine if I'm fast" | L tasks are where TDD breaks down. Split them. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "I'll add tasks later" | The plan is the contract. Missing task = missing acceptance criterion. |
| "No test approach is fine for trivial tasks" | No test = no done. Always include. |
| "10+ tasks is fine" | Hard cap. Split into multiple AIDLC cycles if needed. |
| "Dependency chains are realistic" | Chains are realistic. They also kill parallelism. Restructure. |
| "The plan can be one big T-001" | One task = one feature path, not the whole feature. Slice vertically. |
| "I don't know the file paths yet" | Read the codebase first. Then plan. "I'll find out" = hand-waving. |
