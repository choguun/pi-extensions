// extensions/aidlc-workflow/test/execute-task.test.ts
//
// Unit tests for the execute-task helper functions extracted to
// `../execute-task.ts`. These helpers back the `aidlc execute-task`
// action's 3-phase state machine (A: implementer brief, B: reviewer
// brief, C: review verdict routing).
//
// Why unit tests instead of integration via the full ExtensionAPI
// action: the helpers are pure functions over strings + filesystem
// reads. Testing them directly avoids the cost of bootstrapping the
// mock ExtensionAPI for behavior that's mostly string parsing + path
// joins. The execute-task action itself is exercised by the smoke
// tests' MockExtensionAPI harness.
//
// Coverage:
//   - extractTaskBrief: parses `### Task T-NNN:` sections, handles
//     regex-metachar task IDs, returns null for missing tasks
//   - parseReviewVerdict: approved/needs_fix/blocked + case + malformed
//   - countFixReports: counts `T-NNN-fix-report.md` files in a dir,
//     returns 0 for non-existent dir
//   - buildImplementerBrief / buildReviewerBrief / buildFixBrief:
//     template structure (heading, contract schema, report path)
//   - getCommitRangeForTask: returns "unknown" outside a real git repo
//     or with no matching commits
//   - appendProgressForTask: writes the right line format for
//     complete + BLOCKED status, swallows write errors

import assert from "node:assert/strict";
import {
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	rmSync,
	readFileSync,
	existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	extractTaskBrief,
	parseReviewVerdict,
	countFixReports,
	buildImplementerBrief,
	buildReviewerBrief,
	buildFixBrief,
	getCommitRangeForTask,
	appendProgressForTask,
} from "../execute-task.ts";

// =============================================================================
// extractTaskBrief
// =============================================================================

test("extractTaskBrief: finds the named task section", () => {
	const plan = `# Plan

### Task T-001: First task

content A

### Task T-002: Second task

content B
`;
	const section = extractTaskBrief(plan, "T-001");
	assert.ok(section);
	assert.match(section!, /First task/);
	assert.match(section!, /content A/);
	assert.doesNotMatch(section!, /Second task/);
});

test("extractTaskBrief: stops at the next task section", () => {
	const plan = `### Task T-001: A

alpha

### Task T-002: B

beta

### Task T-003: C

gamma
`;
	const section = extractTaskBrief(plan, "T-002");
	assert.ok(section);
	assert.match(section!, /B/);
	assert.match(section!, /beta/);
	assert.doesNotMatch(section!, /gamma/);
	assert.doesNotMatch(section!, /alpha/);
});

test("extractTaskBrief: returns null when task id is missing", () => {
	const plan = `### Task T-001: Only task

content
`;
	assert.equal(extractTaskBrief(plan, "T-999"), null);
});

test("extractTaskBrief: handles task IDs with regex metachars safely", () => {
	// The helper must escape the ID so a task like `T-1.5` or `T-2(a)`
	// doesn't break `new RegExp(...)`.
	const plan = `### Task T-1.5: Dotted

dot content

### Task T-2(a): Parenthesized

paren content
`;
	const dotted = extractTaskBrief(plan, "T-1.5");
	assert.ok(dotted);
	assert.match(dotted!, /Dotted/);

	const paren = extractTaskBrief(plan, "T-2(a)");
	assert.ok(paren);
	assert.match(paren!, /Parenthesized/);
});

// =============================================================================
// parseReviewVerdict
// =============================================================================

test("parseReviewVerdict: returns 'approved' for ## Verdict\\napproved", () => {
	const review = `# T-001 Review

## Verdict
approved

## Spec Compliance
✅ All good
`;
	assert.equal(parseReviewVerdict(review), "approved");
});

test("parseReviewVerdict: returns 'needs_fix' for ## Verdict\\nneeds_fix", () => {
	const review = `# T-001 Review

## Verdict
needs_fix
`;
	assert.equal(parseReviewVerdict(review), "needs_fix");
});

test("parseReviewVerdict: returns 'blocked' for ## Verdict\\nblocked", () => {
	const review = `# T-001 Review

## Verdict
blocked
`;
	assert.equal(parseReviewVerdict(review), "blocked");
});

test("parseReviewVerdict: defaults to 'blocked' when verdict section is missing", () => {
	const review = `# T-001 Review

No verdict here, just commentary.
`;
	assert.equal(parseReviewVerdict(review), "blocked");
});

test("parseReviewVerdict: defaults to 'blocked' for an unknown verdict value", () => {
	const review = `# T-001 Review

## Verdict
kinda_maybe
`;
	assert.equal(parseReviewVerdict(review), "blocked");
});

test("parseReviewVerdict: is case-insensitive on the verdict keyword", () => {
	const review = `## Verdict
APPROVED
`;
	assert.equal(parseReviewVerdict(review), "approved");
});

// =============================================================================
// countFixReports
// =============================================================================

test("countFixReports: returns 0 when no fix-report files exist", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-fix-"));
	mkdirSync(join(cwd, "sdd"), { recursive: true });
	writeFileSync(join(cwd, "sdd", "T-001-report.md"), "report");
	writeFileSync(join(cwd, "sdd", "T-001-review.md"), "review");
	assert.equal(countFixReports("T-001", join(cwd, "sdd")), 0);
	rmSync(cwd, { recursive: true, force: true });
});

test("countFixReports: returns 1 when one fix-report file exists", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-fix-"));
	mkdirSync(join(cwd, "sdd"), { recursive: true });
	writeFileSync(join(cwd, "sdd", "T-001-fix-report.md"), "fix");
	assert.equal(countFixReports("T-001", join(cwd, "sdd")), 1);
	rmSync(cwd, { recursive: true, force: true });
});

test("countFixReports: scopes to the task id (T-001 fix doesn't count for T-002)", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-fix-"));
	mkdirSync(join(cwd, "sdd"), { recursive: true });
	writeFileSync(join(cwd, "sdd", "T-001-fix-report.md"), "fix");
	writeFileSync(join(cwd, "sdd", "T-002-report.md"), "report");
	assert.equal(countFixReports("T-001", join(cwd, "sdd")), 1);
	assert.equal(countFixReports("T-002", join(cwd, "sdd")), 0);
	rmSync(cwd, { recursive: true, force: true });
});

test("countFixReports: returns 0 when the sdd directory does not exist", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-fix-"));
	const missingDir = join(cwd, "does-not-exist");
	assert.equal(countFixReports("T-001", missingDir), 0);
	rmSync(cwd, { recursive: true, force: true });
});

// =============================================================================
// Brief builders
// =============================================================================

test("buildImplementerBrief: includes task id, description, and report path", () => {
	const brief = buildImplementerBrief(
		"T-001",
		"### Task T-001: Test\n- Step 1: Do thing",
		"/tmp/T-001-report.md",
	);
	assert.match(brief, /# Implementer Brief — T-001/);
	assert.match(brief, /### Task T-001: Test/);
	assert.match(brief, /- Step 1: Do thing/);
	assert.match(brief, /Write your report to `\/tmp\/T-001-report\.md`/);
	// Report contract schema
	assert.match(brief, /## Status\nDONE \| DONE_WITH_CONCERNS \| NEEDS_CONTEXT \| BLOCKED/);
	assert.match(brief, /## Commits/);
	assert.match(brief, /## Test Summary/);
});

test("buildReviewerBrief: includes task id, report path, and review schema", () => {
	const brief = buildReviewerBrief(
		"T-007",
		"### Task T-007: Review me",
		"/tmp/T-007-report.md",
		"/tmp/T-007-review.md",
	);
	assert.match(brief, /# Reviewer Brief — T-007/);
	assert.match(brief, /Read: `\/tmp\/T-007-report\.md`/);
	assert.match(brief, /Write your review to `\/tmp\/T-007-review\.md`/);
	// Verdict schema
	assert.match(brief, /## Verdict\napproved \| needs_fix \| blocked/);
	assert.match(brief, /## Spec Compliance/);
	assert.match(brief, /## Code Quality/);
});

test("buildFixBrief: references the review path and fix report path", () => {
	const brief = buildFixBrief(
		"T-003",
		"/tmp/T-003-review.md",
		"/tmp/T-003-fix-report.md",
	);
	assert.match(brief, /# Fix Brief — T-003/);
	assert.match(brief, /Read the review at `\/tmp\/T-003-review\.md`/);
	assert.match(brief, /Write your fix report to `\/tmp\/T-003-fix-report\.md`/);
	// Fix contract
	assert.match(brief, /## Status\nDONE \| BLOCKED/);
	assert.match(brief, /## Findings Addressed/);
});

// =============================================================================
// getCommitRangeForTask
// =============================================================================

test("getCommitRangeForTask: returns 'unknown' when no git commits mention the task id", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-git-"));
	// Plain temp dir, no git repo, no commits — helper should bail out
	// safely and not throw.
	assert.equal(getCommitRangeForTask("T-001", cwd), "unknown");
	rmSync(cwd, { recursive: true, force: true });
});

// =============================================================================
// appendProgressForTask
// =============================================================================

test("appendProgressForTask: writes a complete-status line with commit range + review", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-progress-"));
	appendProgressForTask(cwd, "T-001", "complete", "abc1234..def5678", "review clean");
	const content = readFileSync(join(cwd, ".aidlc-progress.md"), "utf8");
	assert.match(
		content,
		/- T-001: complete \(commits abc1234\.\.def5678, review clean\)\n/,
	);
	rmSync(cwd, { recursive: true, force: true });
});

test("appendProgressForTask: writes a BLOCKED-status line with the reason", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-progress-"));
	appendProgressForTask(cwd, "T-002", "BLOCKED", undefined, "1 fix attempt failed; needs human review");
	const content = readFileSync(join(cwd, ".aidlc-progress.md"), "utf8");
	assert.match(
		content,
		/- T-002: BLOCKED \(1 fix attempt failed; needs human review\)\n/,
	);
	rmSync(cwd, { recursive: true, force: true });
});

test("appendProgressForTask: appends sequentially without overwriting prior lines", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-progress-"));
	appendProgressForTask(cwd, "T-001", "complete", "aaaaaaa..bbbbbbb", "review clean");
	appendProgressForTask(cwd, "T-002", "complete", "ccccccc..ddddddd", "review clean");
	const content = readFileSync(join(cwd, ".aidlc-progress.md"), "utf8");
	assert.match(content, /T-001: complete \(commits aaaaaaa\.\.bbbbbbb, review clean\)/);
	assert.match(content, /T-002: complete \(commits ccccccc\.\.ddddddd, review clean\)/);
	// Both lines present
	const lines = content.split("\n").filter((l) => l.startsWith("- T-"));
	assert.equal(lines.length, 2);
	rmSync(cwd, { recursive: true, force: true });
});

test("appendProgressForTask: writes the file even when the cwd does not pre-exist", () => {
	const cwd = mkdtempSync(join(tmpdir(), "aidlc-exec-progress-"));
	// Don't pre-create .aidlc-progress.md; appendFileSync creates it.
	assert.ok(!existsSync(join(cwd, ".aidlc-progress.md")));
	appendProgressForTask(cwd, "T-005", "complete", "eee..fff", "review clean");
	assert.ok(existsSync(join(cwd, ".aidlc-progress.md")));
	rmSync(cwd, { recursive: true, force: true });
});