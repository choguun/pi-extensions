/**
 * Tests for the three `aidlc validate-*` actions:
 *   - validate-spec  → checks `.aidlc/spec.md` has `## Test Plan` with ≥1 ST-NNN scenario
 *   - validate-plan  → checks `.aidlc/plan.md` — every T-NNN references ≥1 ST-NNN (or is a refactor)
 *   - validate-tdd   → checks `git diff` ratio — tests changed ≥ as much as production
 *
 * Mirrors the existing smoke.test.ts pattern (MockExtensionAPI + a temp git repo).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import MockExtensionAPI from "./mock-extension-api.ts";

async function loadExtension(): Promise<(pi: MockExtensionAPI) => void> {
	const extPath = path.resolve(import.meta.dirname, "..", "index.ts");
	return await import(pathToFileURL(extPath).href).then(
		(m: { default: (pi: MockExtensionAPI) => void }) => m.default,
	);
}

/** Create a temp git repo (no .aidlc files yet). */
function makeRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-validate-"));
	execSync("git init -q -b main", { cwd: dir });
	execSync('git config user.email "test@example.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	fs.writeFileSync(path.join(dir, "README.md"), "init\n");
	execSync("git add -A && git commit -q -m 'init'", { cwd: dir });
	return dir;
}

function rmRepo(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

async function runAction(
	dir: string,
	action: string,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean; details: any }> {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);
	const aidlc = pi.tools.get("aidlc")!;
	return (await aidlc.execute("call", { action }, undefined, undefined, {
		cwd: dir,
	} as any)) as any;
}

// =============================================================================
// validate-spec
// =============================================================================

test("validate-spec: missing spec.md → valid=false, error mentions missing file", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, "validate-spec");
		assert.equal(result.details.valid, false);
		assert.ok(
			result.details.errors.some((e: string) => /spec\.md/i.test(e)),
			`expected an error mentioning spec.md, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-spec: spec.md missing `## Test Plan` section → valid=false", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "spec.md"),
			"# Spec\n\n## Acceptance Criteria\n- AC1\n",
		);
		const result = await runAction(dir, "validate-spec");
		assert.equal(result.details.valid, false);
		assert.ok(
			result.details.errors.some((e: string) => /Test Plan/i.test(e)),
			`expected error mentioning Test Plan, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-spec: Test Plan present but 0 ST-NNN scenarios → valid=false", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "spec.md"),
			"# Spec\n\n## Test Plan\n\nJust a paragraph, no scenarios.\n",
		);
		const result = await runAction(dir, "validate-spec");
		assert.equal(result.details.valid, false);
		assert.ok(
			result.details.errors.some((e: string) => /ST-NNN/.test(e)),
			`expected error about missing ST-NNN scenarios, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-spec: Test Plan with 1 ST-001 scenario → valid=true", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "spec.md"),
			"# Spec\n\n## Test Plan\n\n### ST-001: validates one thing\n- Given a thing\n- When an action\n- Then a result\n",
		);
		const result = await runAction(dir, "validate-spec");
		assert.equal(result.details.valid, true, `expected valid=true, errors: ${JSON.stringify(result.details.errors)}`);
		assert.equal(result.details.scenarioCount, 1);
	} finally {
		rmRepo(dir);
	}
});

test("validate-spec: Test Plan with multiple ST-NNN scenarios → scenarioCount matches", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "spec.md"),
			[
				"# Spec",
				"",
				"## Test Plan",
				"",
				"### ST-001: first",
				"- Given X",
				"",
				"### ST-002: second",
				"- Given Y",
				"",
				"### ST-003: third",
				"- Given Z",
				"",
			].join("\n"),
		);
		const result = await runAction(dir, "validate-spec");
		assert.equal(result.details.valid, true);
		assert.equal(result.details.scenarioCount, 3);
	} finally {
		rmRepo(dir);
	}
});

// =============================================================================
// validate-plan
// =============================================================================

test("validate-plan: missing plan.md → valid=false, error mentions missing file", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, false);
		assert.ok(
			result.details.errors.some((e: string) => /plan\.md/i.test(e)),
			`expected error mentioning plan.md, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-plan: plan with no T-NNN tasks → valid=true (vacuously)", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "plan.md"),
			"# Plan\n\nJust some prose, no task headings.\n",
		);
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.equal(result.details.taskCount, 0);
	} finally {
		rmRepo(dir);
	}
});

test("validate-plan: T-001 references ST-001 → valid=true", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "plan.md"),
			[
				"# Plan",
				"",
				"### T-001: do thing",
				"",
				"Implements ST-001 (validates one thing).",
				"",
				"### T-002: do other thing",
				"",
				"Implements ST-002 and ST-003.",
				"",
			].join("\n"),
		);
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.equal(result.details.taskCount, 2);
	} finally {
		rmRepo(dir);
	}
});

test("validate-plan: T-NNN missing ST reference and missing (non-test refactor) marker → valid=false", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "plan.md"),
			[
				"# Plan",
				"",
				"### T-001: do thing",
				"",
				"This task has no scenario reference at all.",
				"",
			].join("\n"),
		);
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, false);
		assert.ok(
			result.details.errors.some((e: string) => /T-001/.test(e) && /ST-NNN/.test(e)),
			`expected error about T-001 missing ST reference, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-plan: T-NNN with (non-test refactor) marker but no ST reference → valid=true", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "plan.md"),
			[
				"# Plan",
				"",
				"### T-001: rename a helper (non-test refactor)",
				"",
				"Internal rename — no scenario required.",
				"",
			].join("\n"),
		);
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
	} finally {
		rmRepo(dir);
	}
});

test("validate-plan: mixed plan — some tasks have refs, some don't → lists every offender", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "plan.md"),
			[
				"# Plan",
				"",
				"### T-001: with ref",
				"",
				"Implements ST-001.",
				"",
				"### T-002: missing ref",
				"",
				"No scenario here.",
				"",
				"### T-003: also missing ref",
				"",
				"Also nothing.",
				"",
			].join("\n"),
		);
		const result = await runAction(dir, "validate-plan");
		assert.equal(result.details.valid, false);
		assert.equal(result.details.taskCount, 3);
		const offendingIds: string[] = result.details.offendingTasks ?? [];
		assert.ok(offendingIds.includes("T-002"), `expected T-002 in offenders, got: ${offendingIds}`);
		assert.ok(offendingIds.includes("T-003"), `expected T-003 in offenders, got: ${offendingIds}`);
		assert.ok(!offendingIds.includes("T-001"), `T-001 should not be an offender, got: ${offendingIds}`);
	} finally {
		rmRepo(dir);
	}
});