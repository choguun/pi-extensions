// extensions/aidlc-workflow/test/plan-format.test.ts
//
// Plan format tests — enforce the full superpowers writing-plans format
// that `agents/planner.md` (F7.1) commits to producing.
//
// The full format requires:
//   - Plan header:    **Goal:** + **Architecture:** + **Tech Stack:**
//   - Per task:       **Files:** + **Steps:** (with code blocks)
//   - Optional:       **Interfaces:** (superpowers full-format)
//                     ST-NNN references (Tier 2 spec-scenario links)
//                     # Self-Review section
//
// `validatePlanFormat()` is the single source of truth for these checks.
// It's exported so future tasks can wire it into `aidlc validate-plan`
// without duplicating the regex set.
//
// Legacy detection: pre-F7.1 plans used `## T-NNN: <summary>` with no
// Files/Steps/Interfaces. `isLegacyPlan()` flags those so an automated
// migration / re-plan prompt can fire.
//
// Run with: node --test test/plan-format.test.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const TEMPLATE_PATH = join(ROOT, "docs/plans/_template.md");

// ---------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------

export interface PlanFormatResult {
	valid: boolean;
	errors: string[];
}

/**
 * Pull every task section out of a plan and return its body lines.
 *
 * We accept `## Task T-NNN:` (the canonical style used by existing
 * plans under docs/plans/) and `### Task T-NNN:` (the form shown in
 * `agents/planner.md`). Both are recognized — the validator's job is
 * to enforce format, not to pick a fight about heading level. Body
 * runs from the heading itself up to (but not including) the next task
 * heading — same line-based walk used by `validate-plan` in `index.ts`.
 */
function extractTaskSections(planContent: string): Array<{ id: string; body: string }> {
	const lines = planContent.split("\n");
	const indices: Array<{ line: number; id: string }> = [];
	for (let i = 0; i < lines.length; i++) {
		// Match `## Task T-NNN:` / `### Task T-NNN:` / `## T-NNN:` / `### T-NNN:`
		const m = lines[i].match(/^#{2,3}\s+(?:Task\s+)?(T-\d+):/);
		if (m) indices.push({ line: i, id: m[1] });
	}
	return indices.map((idx, k) => {
		const start = idx.line;
		const end = k + 1 < indices.length ? indices[k + 1].line : lines.length;
		return { id: idx.id, body: lines.slice(start, end).join("\n") };
	});
}

/**
 * Validate a plan against the full superpowers writing-plans format.
 *
 * Required:
 *   - **Goal:**, **Architecture:**, **Tech Stack:** in the plan header
 *   - At least one task section
 *   - Every task has **Files:** and **Steps:**
 *   - Every task's **Steps:** body contains at least one fenced code block
 *
 * Not enforced (positive features, recognized but not required):
 *   - **Interfaces:** (superpowers full format)
 *   - ST-NNN references (Tier 2 spec-scenario links)
 *   - `# Self-Review` section
 */
export function validatePlanFormat(planContent: string): PlanFormatResult {
	const errors: string[] = [];

	// ---- Header ----
	if (!/\*\*Goal:\*\*/.test(planContent)) {
		errors.push("Plan header missing **Goal:**");
	}
	if (!/\*\*Architecture:\*\*/.test(planContent)) {
		errors.push("Plan header missing **Architecture:**");
	}
	if (!/\*\*Tech Stack:\*\*/.test(planContent)) {
		errors.push("Plan header missing **Tech Stack:**");
	}

	// ---- Tasks ----
	const tasks = extractTaskSections(planContent);
	if (tasks.length === 0) {
		errors.push("Plan contains no task sections (## Task T-NNN: or ### Task T-NNN:)");
	}
	for (const task of tasks) {
		if (!/\*\*Files:\*\*/.test(task.body)) {
			errors.push(`${task.id} missing **Files:**`);
		}
		if (!/\*\*Steps:\*\*/.test(task.body)) {
			errors.push(`${task.id} missing **Steps:**`);
		}
		// Steps must include at least one fenced code block. We look at the
		// whole task body (not just a Steps sub-block) because extracting the
		// sub-block robustly across heading-level variants is fiddly; any
		// fenced block anywhere in the task is good enough as a placeholder
		// for "Steps shows actual code". A more precise check would extract
		// only the Steps sub-body — left for a follow-up if it matters.
		if (/\*\*Steps:\*\*/.test(task.body) && !/```/.test(task.body)) {
			errors.push(`${task.id} **Steps:** lacks code blocks`);
		}
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Detect a legacy-style plan: task headings present, but none of them
 * have **Files:** or **Steps:**. Pre-F7.1 plans had only a summary
 * line per task and no structured fields — that's the shape we want
 * to flag for migration.
 */
export function isLegacyPlan(planContent: string): boolean {
	const lines = planContent.split("\n");
	let taskCount = 0;
	let fullFormatCount = 0;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^#{2,3}\s+(?:Task\s+)?(T-\d+):/);
		if (!m) continue;
		taskCount++;
		// Look ahead ~40 lines for either Files: or Steps: — enough to
		// cover a per-task block without scanning the whole file.
		const lookahead = lines.slice(i, i + 40).join("\n");
		if (/\*\*Files:\*\*/.test(lookahead) || /\*\*Steps:\*\*/.test(lookahead)) {
			fullFormatCount++;
		}
	}
	return taskCount > 0 && fullFormatCount === 0;
}

// ---------------------------------------------------------------------
// Canonical-structure fixture (used by the _template.md test)
// ---------------------------------------------------------------------

/**
 * The expected skeleton of `docs/plans/_template.md`. If the template
 * file exists on disk, the test verifies it contains every required
 * marker. If it doesn't exist yet, the test is skipped with a clear
 * message (the template is created by a later F7 task).
 */
const CANONICAL_TEMPLATE_MARKERS = [
	"**Goal:**",
	"**Architecture:**",
	"**Tech Stack:**",
	"### Task T-001:",
	"**Files:**",
	"**Steps:**",
	"**Interfaces:**",
	"# Self-Review",
] as const;

// ---------------------------------------------------------------------
// Test fixtures (all written by hand — keep them stable, no .replace()
// magic that can silently drop markers if the source format shifts)
// ---------------------------------------------------------------------

const VALID_PLAN = `# Sample Plan

**Goal:** Sample goal for format testing.

**Architecture:** Sample architecture description.

**Tech Stack:** TypeScript, Node 24, \`node --test\`.

---

## File Structure

### Create

| Path | Lines |
|---|---|
| \`extensions/aidlc-workflow/sample.ts\` | ~50 |

---

# F1: Sample Fusion

## Task T-001: Sample task

**Implements:** ST-001, ST-002

**Files:**
- Create: \`extensions/aidlc-workflow/sample.ts\`
- Test: \`npm test test/sample.test.ts\`

**Interfaces:**
- Consumes: nothing
- Produces: \`sample(): string\`

**Steps:**
- [ ] **Step 1: Write failing test**

\`\`\`typescript
// test code
assert.equal(sample(), "ok");
\`\`\`

- [ ] **Step 2: Run test, verify FAIL**

Run: \`npm test test/sample.test.ts\`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

\`\`\`typescript
export function sample(): string { return "ok"; }
\`\`\`

- [ ] **Step 4: Run test, verify PASS**

Run: \`npm test test/sample.test.ts\`
Expected: PASS.

---

# Self-Review

**1. Spec coverage:** all scenarios covered.

**2. Placeholder scan:** no placeholders.
`;

const PLAN_NO_FILES = `# Sample Plan

**Goal:** Sample goal.

**Architecture:** Sample architecture.

**Tech Stack:** TypeScript.

---

# F1: Sample Fusion

## Task T-001: No files section

**Implements:** ST-001

**Interfaces:**
- Produces: \`sample(): string\`

**Steps:**
- [ ] **Step 1: Implement**

\`\`\`typescript
export function sample(): string { return "ok"; }
\`\`\`

---

# Self-Review

Done.
`;

const PLAN_NO_STEPS = `# Sample Plan

**Goal:** Sample goal.

**Architecture:** Sample architecture.

**Tech Stack:** TypeScript.

---

# F1: Sample Fusion

## Task T-001: No steps section

**Implements:** ST-001

**Files:**
- Create: \`extensions/aidlc-workflow/sample.ts\`

**Interfaces:**
- Produces: \`sample(): string\`

---

# Self-Review

Done.
`;

const PLAN_STEPS_NO_CODE = `# Plan Without Code Blocks in Steps

**Goal:** Sample.

**Architecture:** Sample.

**Tech Stack:** TypeScript.

---

# F1: Sample Fusion

## Task T-001: Lacking code

**Files:**
- Create: \`foo.ts\`

**Steps:**
- [ ] **Step 1: Do the thing**

Just do the thing — no code shown here.

- [ ] **Step 2: Verify**

Run: \`npm test\`
Expected: PASS.

---

# Self-Review

All good.
`;

const PLAN_NO_HEADER = `# Plan Without Header

Some prose but no Goal/Architecture/Tech Stack markers.

---

# F1: Sample Fusion

## Task T-001: Still has task

**Files:**
- Create: \`foo.ts\`

**Steps:**

\`\`\`typescript
console.log("ok");
\`\`\`
`;

const LEGACY_PLAN = `# Old Style Plan

## T-001: Do thing

Some summary text describing what to do.

## T-002: Do another thing

More summary text.
`;

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

test("plan with all required sections per task is valid", () => {
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.valid, true, `unexpected errors: ${result.errors.join(", ")}`);
	assert.deepEqual(result.errors, []);
});

test("plan missing **Files:** is invalid", () => {
	const result = validatePlanFormat(PLAN_NO_FILES);
	assert.equal(result.valid, false);
	assert.ok(
		result.errors.some((e) => /missing \*\*Files:\*\*/.test(e)),
		`expected a Files-missing error, got: ${result.errors.join(", ")}`,
	);
});

test("plan missing **Steps:** is invalid", () => {
	const result = validatePlanFormat(PLAN_NO_STEPS);
	assert.equal(result.valid, false);
	assert.ok(
		result.errors.some((e) => /missing \*\*Steps:\*\*/.test(e)),
		`expected a Steps-missing error, got: ${result.errors.join(", ")}`,
	);
});

test("plan with Steps lacking code blocks is invalid", () => {
	const result = validatePlanFormat(PLAN_STEPS_NO_CODE);
	assert.equal(result.valid, false);
	assert.ok(
		result.errors.some((e) => /lacks code blocks/.test(e)),
		`expected a code-blocks-missing error, got: ${result.errors.join(", ")}`,
	);
});

test("plan referencing ST-NNN (Tier 2 integration) is valid", () => {
	// ST-NNN is a positive feature (links to spec scenarios) — a plan that
	// references it must still pass the format validator. Use the canonical
	// valid plan, which already includes `**Implements:** ST-001, ST-002`.
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.valid, true);
	assert.ok(
		/\*\*Implements:\*\*\s*ST-001/.test(VALID_PLAN),
		"fixture should include ST-NNN ref so the test is meaningful",
	);
});

test("plan with **Interfaces:** is valid (superpowers full format)", () => {
	// **Interfaces:** is the superpowers full-format marker. A plan that
	// has it must still pass validation. VALID_PLAN already includes it.
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.valid, true);
	assert.ok(
		/\*\*Interfaces:\*\*/.test(VALID_PLAN),
		"fixture should include **Interfaces:** so the test is meaningful",
	);
});

test("_template.md matches canonical structure", (t) => {
	// The template is created by a later F7 task. If it doesn't exist yet,
	// skip with a clear message rather than failing — the format validation
	// tests above already enforce the canonical structure on real plans.
	if (!existsSync(TEMPLATE_PATH)) {
		t.skip("docs/plans/_template.md not yet created (later F7 task)");
		return;
	}
	const content = readFileSync(TEMPLATE_PATH, "utf8");
	for (const marker of CANONICAL_TEMPLATE_MARKERS) {
		assert.ok(
			content.includes(marker),
			`_template.md missing canonical marker "${marker}"`,
		);
	}
});

test("old-style plan (T-NNN + summary only) is detected as legacy", () => {
	assert.equal(isLegacyPlan(LEGACY_PLAN), true);
	// Sanity: a full-format plan must NOT be flagged as legacy.
	assert.equal(isLegacyPlan(VALID_PLAN), false);
});

test("plan with Self-Review section is valid", () => {
	// # Self-Review is a positive feature — plans that include it must
	// still pass the format validator. VALID_PLAN already ends with it.
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.valid, true);
	assert.ok(
		/# Self-Review/.test(VALID_PLAN),
		"fixture should include # Self-Review so the test is meaningful",
	);
});

test("plan header (Goal/Architecture/Tech Stack) is required", () => {
	const result = validatePlanFormat(PLAN_NO_HEADER);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some((e) => /missing \*\*Goal:\*\*/.test(e)));
	assert.ok(result.errors.some((e) => /missing \*\*Architecture:\*\*/.test(e)));
	assert.ok(result.errors.some((e) => /missing \*\*Tech Stack:\*\*/.test(e)));
});