# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (Tier 4 F6) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Global Constraints

[Project-wide requirements — version floors, dependency limits, naming
and copy rules, platform requirements. One line each, with exact values
copied verbatim from `.aidlc/spec.md`. Every task's requirements
implicitly include this section.]

---

## File Structure

[Locked-in by this plan. List the files that will be created or modified,
grouped by Create / Modify. Add a brief one-line purpose for each.]

### Create

| Path | Purpose | Lines (est.) |
|---|---|---|
| `path/to/new/file.ts` | What it does | ~NN |

### Modify

| Path | Change |
|---|---|
| `path/to/existing/file.ts` | One-line summary |

---

## Task Sequencing

```
Commit 1: <fusion-id> — <one-line summary>
   ↓
Commit 2: <fusion-id> — <one-line summary>
   ↓
...
```

Implementation follows commit order: each commit must leave the tree
green and shippable. Tasks within a commit may be sequential; commits
themselves are independent and may be reviewed separately.

---

# Commit 1: <Fusion ID> — <Short Title>

### Task T-001: <Component Name>

**Implements:** ST-NNN [, ST-NNN]

**Files:**
- Create: `exact/path/to/new/file.ts`
- Modify: `exact/path/to/existing/file.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

**Steps:**

- [ ] **Step 1: Write the failing test**

```typescript
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("specific behavior under test", () => {
    const result = functionUnderTest(input);
    assert.equal(result, expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="specific behavior"`
Expected: FAIL with "function not defined".

- [ ] **Step 3: Write minimal implementation**

```typescript
export function functionUnderTest(input: string): string {
    return expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="specific behavior"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/exact/path/to/test.ts path/to/new/file.ts
git commit -m "feat(<scope>): T-001 — <one-line summary>"
```

---

### Task T-002: <Next Component>

[Repeat the Task T-001 structure. Every task has Files, Interfaces, and
Steps with complete code blocks. No placeholders — copy the structure,
fill in real content.]

---

# Self-Review

After writing the complete plan, run this checklist against `.aidlc/spec.md`
with fresh eyes. Fix issues inline; do not re-review.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you
point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search the plan for red flags — any of "TBD",
"TODO", "implement later", "add appropriate error handling", "similar
to Task N", or steps that describe what to do without showing how. Fix
them.

**3. Type consistency:** Do the types, method signatures, and property
names used in later tasks match what earlier tasks defined? A function
called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. ST-NNN linkage:** Every task should reference the spec scenarios it
implements (from `.aidlc/spec.md` `## Test Plan`). Orphan tasks (no ST-NNN
ref) and orphaned scenarios (no implementing task) are both bugs.

---

# Execution Handoff

After saving the plan, the implementer invokes `aidlc execute-task T-NNN`
to dispatch a fresh subagent per task with a two-stage review protocol
(see `subagent-driven-development` skill, Tier 4 F6). Inline implementation
is forbidden; orchestrator-only dispatch is the iron law.