// extensions/aidlc-workflow/execute-task.ts
//
// Helpers backing the `aidlc execute-task` action's 3-phase state machine
// (F6 — fresh-subagent-per-task orchestration):
//
//   A. No report on disk  → write an implementer brief, return dispatch hint
//   B. Report, no review  → write a reviewer brief,     return dispatch hint
//   C. Review exists      → parse verdict, route to approve / fix / blocked
//
// Each helper is pure (over strings or filesystem reads) so it can be
// unit-tested without the full ExtensionAPI harness. The action in
// `index.ts` imports these and stitches them into the state machine.
//
// The state machine itself (the `aidlc execute-task` action) is in
// `index.ts` because it needs `cwd`, `pi`, `AIDLC_DIR`, etc. — moving
// that would drag the whole ExtensionAPI into a new module. The helpers
// here are the data-shaping layer that doesn't need any of that.

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/** Pull the `### Task T-NNN: ...` block from `.aidlc/plan.md`. Returns null if not found. */
export function extractTaskBrief(planContent: string, taskId: string): string | null {
	// Escape regex metacharacters in the task ID so e.g. `T-1.5` or `T-2(a)`
	// don't blow up `new RegExp`. T-NNN is already alphanumeric+dash but
	// the planner may one day emit other IDs — be defensive.
	const escapedId = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// Flags: `s` = dotall so `.` matches newlines (multi-line task descriptions).
	// We deliberately do NOT use the `m` flag — with `m`, `$` in the lookahead
	// would match at end of line, causing the lazy `.*?` to stop after the
	// task heading instead of capturing the full section content.
	const regex = new RegExp(`### Task ${escapedId}:.*?(?=### Task T-|$)`, "s");
	const match = planContent.match(regex);
	return match ? match[0].trim() : null;
}

/**
 * Parse the reviewer's verdict from a review file. Looks for `## Verdict`
 * followed by `approved` / `needs_fix` / `blocked`. Returns `"blocked"`
 * when the review is missing, malformed, or has an unknown verdict —
 * "blocked" is the safe default (forces human review) rather than
 * silently approving unparseable content.
 */
export function parseReviewVerdict(reviewContent: string): "approved" | "needs_fix" | "blocked" {
	const match = reviewContent.match(/##\s*Verdict\s*\n+(\w+)/i);
	if (!match) return "blocked";
	const verdict = match[1].toLowerCase().trim();
	if (verdict.includes("approved")) return "approved";
	if (verdict.includes("needs_fix") || verdict.includes("needs fix") || verdict.includes("needsfix")) return "needs_fix";
	if (verdict.includes("blocked")) return "blocked";
	return "blocked";
}

/** Count how many `T-NNN-fix-report.md` files exist in `.aidlc/sdd/`. Caps the fix loop. */
export function countFixReports(taskId: string, sddDir: string): number {
	try {
		const files = fs.readdirSync(sddDir) as string[];
		const pattern = new RegExp(`^${taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-fix-report\\.md$`);
		return files.filter((f) => pattern.test(f)).length;
	} catch {
		return 0;
	}
}

/** Build the implementer brief — what the implementer subagent reads. */
export function buildImplementerBrief(taskId: string, taskBrief: string, reportPath: string): string {
	return `# Implementer Brief — ${taskId}

## Task Description

${taskBrief}

## Before You Begin

If anything in the task description is unclear, ask now. Otherwise proceed.

## After Completion

Write your report to \`${reportPath}\` following this contract:

\`\`\`markdown
# ${taskId} Report

## Status
DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

## Commits
<list of commit hashes created for this task>

## Test Summary
\`npm test\` result: <one-line summary>

## Concerns
<any concerns about later tasks, or "none">
\`\`\`

Return ONLY status + commits + one-line test summary. Do NOT paste the full report into your reply.
`;
}

/** Build the reviewer brief — what the reviewer subagent reads. */
export function buildReviewerBrief(taskId: string, taskBrief: string, reportPath: string, reviewPath: string): string {
	return `# Reviewer Brief — ${taskId}

## Task Being Reviewed

${taskBrief}

## Implementer's Report

Read: \`${reportPath}\`

## Your Job

Write your review to \`${reviewPath}\` using this schema:

\`\`\`markdown
# ${taskId} Review

## Verdict
approved | needs_fix | blocked

## Spec Compliance
✅ / ❌ <findings against the spec/plan>

## Code Quality
✅ / ❌ <findings about code quality, naming, structure>

## Findings (Critical / Important / Minor)
- <each finding with file:line refs>

## Recommendation
Approve | Fix needed
\`\`\`

Return ONLY the verdict + a one-line summary. Do NOT paste the full review.
`;
}

/** Build the fix brief — what the implementer subagent reads on a fix iteration. */
export function buildFixBrief(taskId: string, reviewPath: string, fixReportPath: string): string {
	return `# Fix Brief — ${taskId}

## Reviewer Findings

Read the review at \`${reviewPath}\`. Address ALL Critical and Important findings. Minor findings are optional.

## Constraints

- Same task scope — don't expand beyond the original task
- Maintain existing tests (don't break them)
- TDD: write a failing test FIRST if adding new behavior
- Keep commits atomic (one commit per logical change)

## After Completion

Write your fix report to \`${fixReportPath}\` following this contract:

\`\`\`markdown
# ${taskId} Fix Report

## Status
DONE | BLOCKED

## Changes
<list of files changed + commit hashes>

## Findings Addressed
<each Critical/Important finding → how addressed>

## Findings Not Addressed
<any findings skipped, with reason>
\`\`\`

Return ONLY status + commit hashes + one-line summary.
`;
}

/**
 * Find the most recent commits referencing this task ID (used to record
 * the commit range in `.aidlc-progress.md` after approval). Returns
 * "unknown" when no matching commits exist or git isn't available.
 *
 * `cwd` is optional for backward compatibility with the original
 * signature; when omitted, falls back to `process.cwd()`.
 */
export function getCommitRangeForTask(taskId: string, cwd?: string): string {
	try {
		const opts = cwd ? { encoding: "utf8" as const, cwd } : { encoding: "utf8" as const };
		const result = execSync(`git log --oneline -20 --grep="${taskId}" 2>/dev/null | head -3`, opts);
		const lines = result.trim().split("\n").filter((l) => l.length > 0);
		if (lines.length === 0) return "unknown";
		const hashes = lines.map((l) => l.split(" ")[0]);
		return `${hashes[hashes.length - 1]}..${hashes[0]}`;
	} catch {
		return "unknown";
	}
}

/**
 * Append a single line to `.aidlc-progress.md`. The ledger is the
 * compaction-recovery record (see F12 in ARCHITECTURE). Errors are
 * non-fatal — a write failure here shouldn't block the parent phase
 * (the git log is the ground truth).
 */
export function appendProgressForTask(cwd: string, taskId: string, status: string, commitRange?: string, reviewStatus?: string): void {
	try {
		const progressPath = path.join(cwd, ".aidlc-progress.md");
		const line = status === "BLOCKED"
			? `- ${taskId}: BLOCKED (${reviewStatus ?? "no reason given"})\n`
			: `- ${taskId}: ${status} (commits ${commitRange ?? "unknown"}, ${reviewStatus ?? "review pending"})\n`;
		fs.appendFileSync(progressPath, line);
	} catch (err) {
		console.warn(`[aidlc] appendProgress failed for ${taskId}: ${err}`);
	}
}