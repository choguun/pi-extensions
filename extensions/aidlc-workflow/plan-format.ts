// extensions/aidlc-workflow/plan-format.ts
//
// Plan format validator — single source of truth for the superpowers
// writing-plans format that `agents/planner.md` (F7.1) commits to producing.
//
// Required format:
//   - Plan header:    **Goal:** + **Architecture:** + **Tech Stack:**
//   - Per task:       **Files:** + **Steps:** (with code blocks)
//
// Optional (recognized but not required):
//   - **Interfaces:** (superpowers full-format)
//   - ST-NNN references (Tier 2 spec-scenario links)
//   - # Self-Review section
//
// `validatePlanFormat()` is exported so the `aidlc validate-plan` action
// can wire it up (no duplicated regex set in `index.ts`). This was the
// F7.1 deferred polish — the format-checker was unit-tested but not
// reachable from any action.
//
// `isLegacyPlan()` flags pre-F7.1 plans (T-NNN summaries with no Files/
// Steps) so an automated migration can fire. Currently informational —
// not consumed by `validate-plan`.

export interface PlanFormatResult {
	valid: boolean;
	errors: string[];
	scenarioCount: number;
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
export function extractTaskSections(planContent: string): Array<{ id: string; body: string }> {
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
 *
 * `scenarioCount` reports how many `ST-NNN` references appear anywhere in
 * the plan (Tier 2 spec-scenario links). This is informational — ST-NNN
 * refs don't gate validity, but the count is useful for the
 * `validate-plan` action to report alongside the format verdict.
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

	// ---- Scenario count (informational) ----
	// Count every `ST-NNN` reference in the plan. Mirrors the
	// `validate-spec` action's `scenarioCount` semantics — number of
	// scenario references in the document. ST-NNN refs don't gate
	// `valid`; they just surface how well the plan is tied back to the
	// spec. (The previous `validate-plan` action that required every
	// T-NNN to reference an ST-NNN was an over-strict contract — see
	// F12.2 brief.)
	const scenarioMatches = planContent.match(/\bST-\d+\b/g) ?? [];

	return {
		valid: errors.length === 0,
		errors,
		scenarioCount: scenarioMatches.length,
	};
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
