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

// =============================================================================
// validate-tdd
// =============================================================================

test("validate-tdd: clean tree (no changes) → valid=true, both counts zero", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.equal(result.details.productionLines, 0);
		assert.equal(result.details.testLines, 0);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: production file modified, no test changes → valid=false", async () => {
	const dir = makeRepo();
	try {
		fs.writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
		execSync("git add -A && git commit -q -m 'add feature'", { cwd: dir });

		// Now make a follow-up edit and stage it (untracked-only wouldn't
		// show in `git diff HEAD` — we want a tracked modification).
		fs.writeFileSync(path.join(dir, "feature.ts"), "export const x = 2;\nexport const y = 3;\n");
		execSync("git add feature.ts", { cwd: dir });

		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, false, `expected invalid, errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(result.details.productionLines > 0, `expected productionLines > 0, got ${result.details.productionLines}`);
		assert.equal(result.details.testLines, 0);
		assert.ok(
			result.details.errors.some((e: string) => /TDD|skip.*RED/i.test(e)),
			`expected error mentioning TDD/RED, got: ${JSON.stringify(result.details.errors)}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: test file modified → valid=true", async () => {
	const dir = makeRepo();
	try {
		fs.mkdirSync(path.join(dir, "test"), { recursive: true });
		fs.writeFileSync(path.join(dir, "test", "x.test.ts"), "test('placeholder', () => {});\n");
		execSync("git add -A && git commit -q -m 'add test'", { cwd: dir });

		// Now modify the test file
		fs.writeFileSync(
			path.join(dir, "test", "x.test.ts"),
			"test('placeholder', () => {});\ntest('added', () => { expect(true).toBe(true); });\n",
		);
		execSync("git add test/x.test.ts", { cwd: dir });

		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(result.details.testLines > 0, `expected testLines > 0, got ${result.details.testLines}`);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: production + test both changed → valid=true", async () => {
	const dir = makeRepo();
	try {
		fs.writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
		fs.writeFileSync(path.join(dir, "feature.test.ts"), "test('placeholder', () => {});\n");
		execSync("git add -A && git commit -q -m 'initial'", { cwd: dir });

		// Modify both
		fs.writeFileSync(path.join(dir, "feature.ts"), "export const x = 2;\nexport const y = 3;\n");
		fs.writeFileSync(
			path.join(dir, "feature.test.ts"),
			"test('placeholder', () => {});\ntest('checks x', () => { expect(2).toBe(2); });\n",
		);
		execSync("git add -A", { cwd: dir });

		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(result.details.productionLines > 0);
		assert.ok(result.details.testLines > 0);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: untracked test file → valid=true (counts as test)", async () => {
	const dir = makeRepo();
	try {
		// Add a tracked production file as the base
		fs.writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
		execSync("git add -A && git commit -q -m 'initial'", { cwd: dir });

		// Create a brand-new untracked test file (not yet `git add`-ed)
		fs.writeFileSync(
			path.join(dir, "feature.test.ts"),
			"test('new', () => { expect(true).toBe(true); });\n",
		);

		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, true, `errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(result.details.testLines > 0, `expected testLines > 0, got ${result.details.testLines}`);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: untracked production file only → valid=false", async () => {
	const dir = makeRepo();
	try {
		// Brand-new untracked production file with no test counterpart
		fs.writeFileSync(path.join(dir, "new-feature.ts"), "export const x = 1;\nexport const y = 2;\n");

		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, false, `expected invalid, errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(result.details.productionLines > 0);
		assert.equal(result.details.testLines, 0);
	} finally {
		rmRepo(dir);
	}
});

test("validate-tdd: non-git directory → valid=false, error mentions git", async () => {
	// Temp dir WITHOUT `git init` — `git diff HEAD --numstat` will fail
	// with "fatal: not a git repository", `tryRun` returns null, and the
	// guard at index.ts:917-922 short-circuits with a clear error.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-nogit-"));
	try {
		const result = await runAction(dir, "validate-tdd");
		assert.equal(result.details.valid, false, `expected invalid, errors: ${JSON.stringify(result.details.errors)}`);
		assert.ok(
			result.details.errors.some((e: string) => /git/i.test(e)),
			`expected error mentioning git, got: ${JSON.stringify(result.details.errors)}`,
		);
		// Counts should be zero in the early-return path.
		assert.equal(result.details.productionLines, 0);
		assert.equal(result.details.testLines, 0);
	} finally {
		rmRepo(dir);
	}
});