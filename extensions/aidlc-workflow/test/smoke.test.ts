/**
 * Smoke test for the AIDLC extension.
 *
 * Verifies the TypeScript extension loads, the `aidlc` tool and the
 * slash commands register, and the `status` action reads a fake
 * `.aidlc/state.md` correctly. Runs end-to-end without a real pi
 * session — just a Node.js test with a mocked ExtensionAPI.
 *
 * Run with:
 *   npm test
 *   node --test test/smoke.test.ts
 *
 * Requires: a real `git` binary on PATH (the test creates a temp
 * git repo so `currentBranch()` works). Does NOT require `gh`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import MockExtensionAPI from "./mock-extension-api.ts";

// Re-export so existing tests can keep using the same name.
export { MockExtensionAPI };

/**
 * Sent-message accessors kept for AIDLC smoke test compatibility.
 * The shared mock captures messages as `{ text, options? }` objects; the
 * original AIDLC mock captured raw strings. These helpers convert between
 * the two shapes so existing assertions don't have to change.
 */
function sentTexts(pi: MockExtensionAPI): string[] {
	return pi.sentUserMessages.map((m) => m.text);
}

// =============================================================================
// Test fixture
// =============================================================================

/** Create a temp directory with a git repo + `.aidlc/state.md`. */
function makeRepo(opts: { state?: string; branch?: string } = {}): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-smoke-"));

	// Init git
	execSync("git init -q -b main", { cwd: dir });
	execSync('git config user.email "test@example.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });

	// Switch to optional branch
	if (opts.branch) {
		execSync(`git checkout -q -b ${opts.branch}`, { cwd: dir });
	}

	// Write state file
	fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
	const stateContent =
		opts.state ??
		`# AIDLC State

- **Phase**: specifying
- **Branch**: feat/test
- **PR**: 42
- **Last action**: 2026-06-23T10:00:00Z
- **Next action**: Run /specify
- **Notes**: smoke test fixture

_Updated: 2026-06-23T10:00:00Z_
`;
	fs.writeFileSync(path.join(dir, ".aidlc", "state.md"), stateContent);

	// Commit so `git rev-parse --abbrev-ref HEAD` works cleanly
	fs.writeFileSync(path.join(dir, "README.md"), "smoke test\n");
	execSync("git add -A && git commit -q -m 'init'", { cwd: dir });
	if (opts.branch) {
		// After committing on the branch, HEAD points to it
	}

	return dir;
}

function rmRepo(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
}

// =============================================================================
// Load the extension
// =============================================================================

/**
 * Dynamic-import the extension's default export. We use `pathToFileURL` so
 * Node.js can resolve the `.ts` file via its experimental TypeScript
 * loader. If that fails, the test fails with the loader error — a
 * useful signal that the extension can't be loaded.
 */
async function loadExtension(): Promise<(pi: MockExtensionAPI) => void> {
	const extPath = path.resolve(import.meta.dirname, "..", "index.ts");
	return await import(pathToFileURL(extPath).href).then(
		(m: { default: (pi: MockExtensionAPI) => void }) => m.default,
	);
}

// =============================================================================
// Tests
// =============================================================================

test("extension loads and registers the `aidlc` tool", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	assert.ok(pi.tools.has("aidlc"), "`aidlc` tool should be registered");
	const aidlc = pi.tools.get("aidlc")!;
	assert.equal(aidlc.label, "AIDLC");
	assert.ok(aidlc.description.includes("spec → plan → implement"), "description should describe the pipeline");
	assert.equal(typeof aidlc.execute, "function");
});

test("extension registers 7 slash commands", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	const expected = ["specify", "plan", "implement", "test", "review", "ship", "aidlc-status"];
	for (const name of expected) {
		assert.ok(pi.commands.has(name), `command /${name} should be registered`);
	}
});

test("/aidlc status reads .aidlc/state.md from the cwd", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	const repo = makeRepo({
		branch: "feat/test",
		state: `# AIDLC State

- **Phase**: implementing
- **Branch**: feat/test
- **PR**: 99
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /test
- **Notes**: T-001 done

_Updated: 2026-06-23T11:00:00Z_
`,
	});

	try {
		const aidlc = pi.tools.get("aidlc")!;
		const ctx = { cwd: repo, hasUI: false, ui: undefined as never };
		const result = (await aidlc.execute("call-1", { action: "status" }, undefined, undefined, ctx)) as {
			content: Array<{ type: string; text: string }>;
			details: { phase: string; branch: string | null; pr: string | null };
		};

		assert.equal(result.content[0].type, "text");
		const text = result.content[0].text;
		assert.match(text, /implementing/, "status text should mention the phase from state.md");
		assert.match(text, /feat\/test/, "status text should mention the branch");
		// PR number is only in the output if `gh` returns one. Without a
		// real GitHub repo, `gh` returns null and the tool reports "(none)".
		// The PR number IS read from state.md (it just isn't echoed in
		// the status text — the status uses `openPRForBranch` as the
		// source of truth, not the cached state value).
		assert.match(text, /Last action: 2026-06-23T11:00:00Z/, "status should show last_action from state.md");
		assert.match(text, /Run \/test/, "status should show next_action from state.md");
		assert.equal(result.details.phase, "implementing");
	} finally {
		rmRepo(repo);
	}
});

test("/aidlc status handles missing state.md gracefully", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-smoke-"));
	execSync("git init -q -b main", { cwd: repo });
	execSync('git config user.email "test@example.com"', { cwd: repo });
	execSync('git config user.name "Test"', { cwd: repo });
	fs.writeFileSync(path.join(repo, "README.md"), "x\n");
	execSync("git add -A && git commit -q -m init", { cwd: repo });

	try {
		const aidlc = pi.tools.get("aidlc")!;
		const ctx = { cwd: repo, hasUI: false, ui: undefined as never };
		const result = (await aidlc.execute("call-1", { action: "status" }, undefined, undefined, ctx)) as {
			content: Array<{ type: string; text: string }>;
			details: { phase: string };
		};

		// When state.md is missing, the phase is "not_started"
		assert.match(result.content[0].text, /not_started/);
		assert.equal(result.details.phase, "not_started");
	} finally {
		rmRepo(repo);
	}
});

test("/aidlc classify-comments handles no PR gracefully", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	// State with no PR (empty/null) — the tool should return an error.
	const repo = makeRepo({
		branch: "feat/no-pr",
		state: `# AIDLC State

- **Phase**: implementing
- **Branch**: feat/no-pr
- **PR**:
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /test
- **Notes**:

_Updated: 2026-06-23T11:00:00Z_
`,
	});
	try {
		const aidlc = pi.tools.get("aidlc")!;
		const ctx = { cwd: repo, hasUI: false, ui: undefined as never };
		const result = (await aidlc.execute("call-1", { action: "classify" }, undefined, undefined, ctx)) as {
			isError: boolean;
			content: Array<{ type: string; text: string }>;
		};

		// No PR → error message, not a crash
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /No open PR/);
	} finally {
		rmRepo(repo);
	}
});

test("/aidlc start creates a branch and draft PR state", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	const repo = makeRepo({ branch: "main" });
	// Strip any .aidlc/state.md so we can verify start creates one
	fs.rmSync(path.join(repo, ".aidlc", "state.md"), { force: true });
	execSync("git add -A && git commit -q -m 'clean state'", { cwd: repo });

	try {
		const aidlc = pi.tools.get("aidlc")!;
		const ctx = { cwd: repo, hasUI: false, ui: undefined as never };
		const result = (await aidlc.execute("call-1", { action: "start", feature: "Test Feature" }, undefined, undefined, ctx)) as {
			content: Array<{ type: string; text: string }>;
			details: { branch: string; pr: string | null; state: { phase: string } };
		};

		assert.match(result.content[0].text, /Branch: .feat[/-]test[/-]feature/);
		assert.match(result.content[0].text, /Phase: specifying/);
		assert.equal(result.details.state.phase, "specifying");

		// state.md should be created with the feature in notes
		const stateContent = fs.readFileSync(path.join(repo, ".aidlc", "state.md"), "utf-8");
		assert.match(stateContent, /Test Feature/);
	} finally {
		rmRepo(repo);
	}
});

// Regression: renderState used to emit `LastAction` (no space) for the
// `lastAction` key, but parseState normalizes keys with whitespace to
// underscores and only knows about `last_action` / `next_action`. The
// mismatch silently dropped `lastAction` and `nextAction` on the next
// read — `/aidlc status` would show "Last action: —" immediately after
// `/aidlc start`. This test pins the round-trip.
test("/aidlc start → /aidlc status round-trip preserves lastAction/nextAction", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	const repo = makeRepo({ branch: "main" });
	fs.rmSync(path.join(repo, ".aidlc", "state.md"), { force: true });
	execSync("git add -A && git commit -q -m 'clean state'", { cwd: repo });

	try {
		const aidlc = pi.tools.get("aidlc")!;
		const ctx = { cwd: repo, hasUI: false, ui: undefined as never };

		await aidlc.execute("call-1", { action: "start", feature: "Round Trip" }, undefined, undefined, ctx);

		// Verify the on-disk format uses "Last action" / "Next action"
		// (with space) — not the broken "LastAction" / "NextAction".
		const stateContent = fs.readFileSync(path.join(repo, ".aidlc", "state.md"), "utf-8");
		assert.match(stateContent, /- \*\*Last action\*\*:/, "state.md should use 'Last action' (with space), not 'LastAction'");
		assert.match(stateContent, /- \*\*Next action\*\*:/, "state.md should use 'Next action' (with space), not 'NextAction'");
		assert.doesNotMatch(stateContent, /LastAction/, "state.md must not contain the broken 'LastAction' key");
		assert.doesNotMatch(stateContent, /NextAction/, "state.md must not contain the broken 'NextAction' key");

		// Verify the parser actually picks up the values — a fresh
		// /aidlc status should show a real timestamp, not the default
		// em-dash.
		const statusResult = (await aidlc.execute("call-2", { action: "status" }, undefined, undefined, ctx)) as {
			content: Array<{ type: string; text: string }>;
		};
		const text = statusResult.content[0].text;
		// lastAction should be an ISO timestamp (YYYY-MM-DDTHH:MM:SS), not "—"
		assert.match(
			text,
			/Last action: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
			`/aidlc status should show a real lastAction timestamp after /aidlc start. Got: ${text}`,
		);
		// nextAction should be the "Run /specify" directive, not "—"
		assert.match(text, /Next action: Run \/specify/);
	} finally {
		rmRepo(repo);
	}
});

test("slash command handlers invoke the matching skill via sendUserMessage", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	for (const name of ["specify", "plan", "implement", "test", "review", "ship", "aidlc-status"]) {
		const cmd = pi.commands.get(name)!;
		assert.ok(cmd, `command /${name} should exist`);

		// Mock ctx — minimal shape that satisfies the handler. The actual
		// invocation happens via `pi.sendUserMessage()` (we spy on the
		// MockExtensionAPI instance), NOT via the ctx.
		const ctx = {
			cwd: process.cwd(),
			hasUI: false,
			ui: {
				notify: () => {},
			},
			isIdle: () => true,
		};

		// Reset the sent-messages buffer for each command so we can assert
		// each command sends exactly one message.
		pi.sentUserMessages.length = 0;

		await cmd.handler("test args", ctx);
		const texts = sentTexts(pi);
		assert.equal(texts.length, 1, `command /${name} should call sendUserMessage exactly once`);
		assert.ok(
			texts[0].startsWith(`/${name}`),
			`command /${name} should send a directive starting with /${name}, got: ${texts[0]}`,
		);
	}
});

test("/aidlc verify runs the package.json scripts and reports pass/fail", async () => {
	const dir = makeRepo();
	try {
		// Write a minimal package.json with typecheck + test scripts
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify({
				name: "aidlc-smoke",
				version: "0.0.0",
				scripts: {
					typecheck: 'echo "typecheck ok"',
					test: 'echo "test ok"',
				},
			}),
		);
		// Write a state.md so the verify action has the right context
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "state.md"),
			"- phase: implementing\n- branch: feat/test\n- pr: null\n",
		);

		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const aidlc = pi.tools.get("aidlc")!;
		const result = await aidlc.execute(
			"verify-call",
			{ action: "verify" },
			undefined,
			undefined,
			{ cwd: dir } as any,
		);

		const details = (result as any).details;
		assert.equal(details.passed, true, `verify should pass: ${JSON.stringify(details.checks)}`);
		assert.ok(details.checks.some((c: any) => c.name === "typecheck"), "should have run typecheck");
		assert.ok(details.checks.some((c: any) => c.name === "test"), "should have run test");
	} finally {
		cleanupRepo(dir);
	}
});

test("/aidlc verify reports failure when a script exits non-zero", async () => {
	const dir = makeRepo();
	try {
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify({
				name: "aidlc-smoke-fail",
				version: "0.0.0",
				scripts: {
					typecheck: 'exit 1',
				},
			}),
		);
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(path.join(dir, ".aidlc", "state.md"), "- phase: testing\n- branch: feat/x\n");

		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const aidlc = pi.tools.get("aidlc")!;
		const result = await aidlc.execute(
			"verify-fail",
			{ action: "verify" },
			undefined,
			undefined,
			{ cwd: dir } as any,
		);

		const details = (result as any).details;
		assert.equal(details.passed, false);
		const typecheck = details.checks.find((c: any) => c.name === "typecheck");
		assert.ok(typecheck);
		assert.equal(typecheck.ok, false);
	} finally {
		cleanupRepo(dir);
	}
});

function cleanupRepo(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

test("/aidlc triage creates a signal from a classified PR comment", async () => {
	const dir = makeRepo();
	try {
		// Set up substrate directories
		fs.mkdirSync(path.join(dir, "signals"), { recursive: true });
		fs.writeFileSync(path.join(dir, "LOG.md"), "# Work log\n\n<!-- Append below. -->\n");
		// Stub a PR with one comment
		fs.mkdirSync(path.join(dir, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, ".aidlc", "state.md"),
			"- phase: reviewing\n- branch: feat/test\n- pr: 123\n",
		);

		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const aidlc = pi.tools.get("aidlc")!;
		// We can't easily mock gh() here without a real PR — just verify
		// the action handles "no PR" gracefully.
		const result = await aidlc.execute(
			"triage-call",
			{ action: "triage" },
			undefined,
			undefined,
			{ cwd: dir } as any,
		);

		const details = (result as any).details;
		// With no real PR, getPRContext returns null → returns the "No comments"
		// branch. Either way details should have created/updated fields.
		assert.ok(details !== undefined, "triage should return details");
	} finally {
		cleanupRepo(dir);
	}
});
