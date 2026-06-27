// extensions/aidlc-workflow/test/aidlc-validation.test.ts
//
// Tier-7 F12.1 polish contract tests for the `aidlc` tool:
//   - AidlcParams TypeBox schema accepts the new optional fields
//     (status, commit_range, review_status, reason) without throwing
//     a validation error — the F12.1 fix that lets the implementer
//     agent pass append-progress params through the typed schema
//     instead of casting through `Record<string, unknown>`.
//   - The unknown-action error message lists every documented action,
//     including `classify` — the F12.1 fix that closed the drift
//     between the schema's `action` description and the runtime
//     error path.
//
// Runs end-to-end through MockExtensionAPI (same harness as
// smoke.test.ts / validate.test.ts). Does NOT require `gh`.

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

/** Create a temp git repo with `.aidlc/` already populated. */
function makeRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-validation-"));
	execSync("git init -q -b main", { cwd: dir });
	execSync('git config user.email "test@example.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
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
	params: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean; details: any }> {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);
	const aidlc = pi.tools.get("aidlc")!;
	return (await aidlc.execute("call", params, undefined, undefined, {
		cwd: dir,
	} as any)) as any;
}

// =============================================================================
// F12.1 Fix 1 — AidlcParams schema accepts new optional fields
// =============================================================================
//
// Before the fix, `append-progress` extracted its optional fields via
// `(params as Record<string, unknown>).task_id as string | undefined`
// because the TypeBox schema didn't list them. After the fix, the
// schema declares them as optional, so the typed `params.task_id`
// access compiles cleanly and the runtime accepts them without a
// schema validation error.

test("AidlcParams: append-progress accepts commit_range + review_status + reason via schema", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, {
			action: "append-progress",
			task_id: "T-001",
			status: "complete",
			commit_range: "abc1234..def5678",
			review_status: "clean",
		});
		assert.equal(
			result.isError,
			undefined,
			`expected no schema validation error, got: ${JSON.stringify(result.content)}`,
		);
		assert.equal(result.details.valid, true);
		assert.match(result.details.appended, /T-001: complete \(commits abc1234\.\.def5678, clean\)/);
	} finally {
		rmRepo(dir);
	}
});

test("AidlcParams: append-progress BLOCKED status with reason works via schema", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, {
			action: "append-progress",
			task_id: "T-002",
			status: "BLOCKED",
			reason: "waiting for human input",
		});
		assert.equal(
			result.isError,
			undefined,
			`expected no schema validation error, got: ${JSON.stringify(result.content)}`,
		);
		assert.equal(result.details.valid, true);
		assert.match(result.details.appended, /T-002: BLOCKED \(waiting for human input\)/);
	} finally {
		rmRepo(dir);
	}
});

// =============================================================================
// F12.1 Fix 4 — unknown-action error message lists `classify`
// =============================================================================
//
// Before the fix, the error string listed every action except
// `classify`, even though the schema's `action` description included
// it. The drift was a Tier-1 review finding.

test("unknown action error lists `classify` as a valid action", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, { action: "bogus-action-name" });
		assert.equal(result.isError, true, "expected unknown action to be an error");
		const text = result.content[0].text;
		// `classify` must appear as a standalone action name, not just as
		// a prefix of `classify-comments` (which `\b` would also match
		// because `-` is a non-word character). The list is comma-
		// separated, so we anchor on a comma boundary.
		assert.match(
			text,
			/(?:^|, )classify(?:,|$)/,
			`error message should list \`classify\` as a standalone action, got: ${text}`,
		);
	} finally {
		rmRepo(dir);
	}
});

test("unknown action error lists every documented action", async () => {
	const dir = makeRepo();
	try {
		const result = await runAction(dir, { action: "nope" });
		assert.equal(result.isError, true);
		const text = result.content[0].text;
		// Smoke-check: every action listed in the AidlcParams
		// description should be present in the error message too.
		// Catches drift between the schema docs and the runtime.
		// Anchor on `Use: ` or comma boundaries so `classify` (a
		// prefix of `classify-comments`) isn't falsely considered
		// present.
		for (const actionName of [
			"start",
			"status",
			"sync",
			"classify-comments",
			"classify",
			"next",
			"verify",
			"triage",
			"validate-spec",
			"validate-plan",
			"validate-tdd",
			"append-progress",
			"read-progress",
			"execute-task",
		]) {
			assert.match(
				text,
				new RegExp(`(?:^|, |Use: )${actionName}(?:,|$)`),
				`error message should list \`${actionName}\`, got: ${text}`,
			);
		}
	} finally {
		rmRepo(dir);
	}
});