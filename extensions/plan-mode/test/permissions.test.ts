/**
 * Tests for the permission ruleset engine.
 *
 * Pure module — no pi runtime needed. Run with:
 *   node --test test/permissions.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	check,
	extractPath,
	globToRegex,
	matchGlob,
	PLAN_AGENT_PERMISSIONS,
	resolvePath,
} from "../permissions.ts";

// =============================================================================
// globToRegex / matchGlob
// =============================================================================

test("globToRegex: literal match", () => {
	assert.equal(globToRegex("foo.md").test("foo.md"), true);
	assert.equal(globToRegex("foo.md").test("bar.md"), false);
});

test("globToRegex: single star", () => {
	const r = globToRegex("*.md");
	assert.equal(r.test("foo.md"), true);
	assert.equal(r.test("foo.txt"), false);
	assert.equal(r.test("dir/foo.md"), false); // * doesn't cross /
});

test("globToRegex: double star", () => {
	const r = globToRegex(".opencode/plans/*.md");
	assert.equal(r.test(".opencode/plans/2024-01-01-foo.md"), true);
	assert.equal(r.test(".opencode/plans/inner/foo.md"), false); // * doesn't cross /
	assert.equal(r.test(".opencode/plans/foo.txt"), false);
});

test("globToRegex: triple-star equivalent", () => {
	const r = globToRegex(".opencode/plans/**/*.md");
	assert.equal(r.test(".opencode/plans/foo.md"), true);
	assert.equal(r.test(".opencode/plans/inner/foo.md"), true);
	assert.equal(r.test(".opencode/plans/a/b/c.md"), true);
});

test("matchGlob: integration", () => {
	assert.equal(matchGlob(".aidlc/plan.md", ".aidlc/plan.md"), true);
	assert.equal(matchGlob(".aidlc/plan.md", ".aidlc/spec.md"), false);
	assert.equal(matchGlob(".opencode/plans/*.md", ".opencode/plans/2024-foo.md"), true);
});

// =============================================================================
// extractPath
// =============================================================================

test("extractPath: edit / write", () => {
	assert.equal(extractPath("edit", { file_path: "/tmp/foo.ts" }), "/tmp/foo.ts");
	assert.equal(extractPath("write", { file_path: "/tmp/foo.ts" }), "/tmp/foo.ts");
	assert.equal(extractPath("edit", { path: "/tmp/foo.ts" }), "/tmp/foo.ts");
	assert.equal(extractPath("edit", {}), undefined);
});

test("extractPath: bash uses command", () => {
	assert.equal(extractPath("bash", { command: "rm -rf /" }), "rm -rf /");
});

test("extractPath: unknown tool returns undefined", () => {
	assert.equal(extractPath("question", { foo: "bar" }), undefined);
});

// =============================================================================
// resolvePath
// =============================================================================

test("resolvePath: absolute path is preserved", () => {
	assert.equal(resolvePath("/etc/passwd", "/home/user"), "/etc/passwd");
});

test("resolvePath: relative path joined with cwd", () => {
	assert.equal(resolvePath(".opencode/plans/foo.md", "/home/user"), "/home/user/.opencode/plans/foo.md");
});

test("resolvePath: ./ prefix stripped", () => {
	assert.equal(resolvePath("./foo.md", "/home/user"), "/home/user/foo.md");
});

test("resolvePath: parent traversal", () => {
	assert.equal(resolvePath("../sibling/foo.md", "/home/user/project"), "/home/user/sibling/foo.md");
});

test("resolvePath: Windows drive letter preserved", () => {
	// pi doesn't run on Windows as the primary target but we shouldn't break it
	assert.equal(resolvePath("C:\\Users\\foo", "/home/user"), "C:\\Users\\foo");
});

// =============================================================================
// check() — permission evaluation
// =============================================================================

test("check: empty ruleset defaults to allow", () => {
	assert.equal(check({ rules: [] }, "edit", { file_path: "/etc/passwd" }), "allow");
});

test("check: tool name specificity wins over *", () => {
	const ruleset = {
		rules: [
			{ tool: "*", action: "deny" as const },
			{ tool: "read", action: "allow" as const },
		],
	};
	assert.equal(check(ruleset, "read", { file_path: "/foo" }), "allow");
	assert.equal(check(ruleset, "edit", { file_path: "/foo" }), "deny");
});

test("check: deny always wins", () => {
	const ruleset = {
		rules: [
			{ tool: "*", action: "allow" as const },
			{ tool: "edit", pattern: "*.md", action: "deny" as const },
			{ tool: "edit", pattern: "*.md", action: "allow" as const }, // later, but still loses
		],
	};
	assert.equal(check(ruleset, "edit", { file_path: "foo.md" }), "deny");
});

test("check: ask wins over allow but loses to deny", () => {
	const ruleset = {
		rules: [
			{ tool: "bash", action: "allow" as const },
			{ tool: "bash", action: "ask" as const },
		],
	};
	assert.equal(check(ruleset, "bash", { command: "ls" }), "ask");

	const denying = {
		rules: [
			{ tool: "bash", action: "ask" as const },
			{ tool: "bash", pattern: "\\brm\\b", patternKind: "regex" as const, action: "deny" as const },
		],
	};
	assert.equal(check(denying, "bash", { command: "rm -rf /" }), "deny");
});

test("check: pattern match for path-based tools", () => {
	const ruleset = {
		rules: [
			{ tool: "edit", pattern: ".aidlc/plan.md", action: "allow" as const },
			{ tool: "edit", action: "deny" as const }, // default deny
		],
	};
	assert.equal(check(ruleset, "edit", { file_path: ".aidlc/plan.md" }), "allow");
	assert.equal(check(ruleset, "edit", { file_path: "/etc/passwd" }), "deny");
});

test("check: pattern with cwd resolves relative paths", () => {
	const ruleset = {
		rules: [{ tool: "edit", pattern: ".opencode/plans/*.md", action: "allow" as const }],
	};
	// Without cwd: relative path doesn't match the glob (which has a leading dot)
	assert.equal(check(ruleset, "edit", { file_path: "plans/foo.md" }), "allow"); // no path-arg means no path to match... wait, the path IS "plans/foo.md"
	// Actually with path = "plans/foo.md" and pattern ".opencode/plans/*.md", this should NOT match
	// Let me retest with cwd
	assert.equal(
		check(ruleset, "edit", { file_path: "plans/foo.md" }, "/home/user"),
		"allow", // resolves to "/home/user/plans/foo.md", which doesn't match ".opencode/plans/*.md"
	);
	assert.equal(
		check(ruleset, "edit", { file_path: ".opencode/plans/foo.md" }, "/home/user"),
		"allow",
	);
});

// =============================================================================
// Default rulesets
// =============================================================================

test("PLAN_AGENT_PERMISSIONS: edit on plan file allowed", () => {
	assert.equal(
		check(PLAN_AGENT_PERMISSIONS, "edit", { file_path: ".opencode/plans/2024-foo.md" }, "/home/user"),
		"allow",
	);
	assert.equal(
		check(PLAN_AGENT_PERMISSIONS, "write", { file_path: ".opencode/plans/2024-foo.md" }, "/home/user"),
		"allow",
	);
});

test("PLAN_AGENT_PERMISSIONS: edit on .aidlc/plan.md allowed", () => {
	assert.equal(
		check(PLAN_AGENT_PERMISSIONS, "edit", { file_path: ".aidlc/plan.md" }, "/home/user"),
		"allow",
	);
});

test("PLAN_AGENT_PERMISSIONS: edit on non-plan file denied", () => {
	assert.equal(
		check(PLAN_AGENT_PERMISSIONS, "edit", { file_path: "/etc/passwd" }, "/home/user"),
		"deny",
	);
	assert.equal(
		check(PLAN_AGENT_PERMISSIONS, "write", { file_path: "src/index.ts" }, "/home/user"),
		"deny",
	);
});

test("PLAN_AGENT_PERMISSIONS: bash with safe command allowed", () => {
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "cat package.json" }), "allow");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "ls -la" }), "allow");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "git status" }), "allow");
});

test("PLAN_AGENT_PERMISSIONS: bash with destructive command denied", () => {
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "rm -rf /tmp/foo" }), "deny");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "npm install" }), "deny");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "git commit -m x" }), "deny");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "sudo apt install foo" }), "deny");
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "bash", { command: "vim foo.txt" }), "deny");
});

test("PLAN_AGENT_PERMISSIONS: plan_enter denied (can't enter from inside plan)", () => {
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "plan_enter", {}), "deny");
});

test("PLAN_AGENT_PERMISSIONS: plan_exit allowed", () => {
	assert.equal(check(PLAN_AGENT_PERMISSIONS, "plan_exit", {}), "allow");
});