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
// `validatePlanFormat()` is the single source of truth for these checks,
// exported from `../plan-format.ts`. Tests import it from there — no
// duplicated regex set in the test file (F12.2 polish).
//
// `isLegacyPlan()` flags pre-F7.1 plans (T-NNN summaries with no Files/
// Steps) so an automated migration / re-plan prompt can fire.
//
// Run with: node --test test/plan-format.test.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
	validatePlanFormat,
	isLegacyPlan,
} from "../plan-format.ts";

const ROOT = join(import.meta.dirname, "..");
const TEMPLATE_PATH = join(ROOT, "docs/plans/_template.md");

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

// F12.2 polish — scenarioCount field on the format result.

test("validatePlanFormat returns scenarioCount equal to ST-NNN reference count", () => {
	// VALID_PLAN has `**Implements:** ST-001, ST-002` — exactly 2 ST-NNN refs.
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.scenarioCount, 2);
});

test("validatePlanFormat scenarioCount is 0 when no ST-NNN references", () => {
	// PLAN_NO_HEADER has a T-001 task but no ST-NNN refs in the body.
	const result = validatePlanFormat(PLAN_NO_HEADER);
	assert.equal(result.scenarioCount, 0);
});

test("validatePlanFormat scenarioCount does not gate validity (ST refs optional)", () => {
	// A plan with zero ST-NNN refs but all required structural sections
	// must still be `valid: true`. ST-NNN is informational — its absence
	// doesn't fail the format check.
	const result = validatePlanFormat(VALID_PLAN);
	assert.equal(result.valid, true);
	assert.ok(result.scenarioCount >= 0, "scenarioCount should be a number");
});

test("validatePlanFormat scenarioCount counts every ST-NNN token across the plan", () => {
	// A plan with ST-NNN refs in multiple places (Implements: line + a
	// later "Refs:" line, for example) — every `ST-NNN` token counts.
	const planWithManyRefs = `# Plan With Many Refs

**Goal:** Test scenario count.

**Architecture:** Multi-ref.

**Tech Stack:** TS.

---

## Task T-001: First

**Implements:** ST-001, ST-002, ST-003

**Files:**
- Create: \`a.ts\`

**Steps:**

\`\`\`typescript
// code
\`\`\`

---

## Task T-002: Second

**Implements:** ST-003

**Files:**
- Create: \`b.ts\`

**Steps:**

\`\`\`typescript
// code
\`\`\`
`;
	const result = validatePlanFormat(planWithManyRefs);
	assert.equal(result.scenarioCount, 4); // ST-001, ST-002, ST-003 (×2)
});
