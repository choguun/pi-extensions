/**
 * Bootstrap test — isolated unit test for readAIDLCState() in bootstrap.ts.
 * Run with: node --experimental-strip-types --test test/bootstrap.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	readAIDLCState,
	messageContainsBootstrap,
	firstNonCompactionSummaryIndex,
	type AIDLCState,
} from "../bootstrap.ts";
import bootstrapExtension from "../bootstrap.ts";

function tmpDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

test("readAIDLCState: returns null when .aidlc directory does not exist", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	try {
		const result = readAIDLCState(dir);
		assert.equal(result, null);
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: returns null when .aidlc exists but state.md is missing", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	try {
		const result = readAIDLCState(dir);
		assert.equal(result, null);
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: returns null when state.md has no parseable fields", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		"# AIDLC State\n\n_Updated: 2026-06-26T10:00:00Z_\n",
	);
	try {
		const result = readAIDLCState(dir);
		assert.equal(result, null);
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: parses Phase, Branch, PR, Notes from state.md", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		`# AIDLC State

- **Phase**: implementing
- **Branch**: feat/superpowers-fusion-tier-1
- **PR**: 42
- **Last action**: 2026-06-26T10:00:00Z
- **Next action**: Run /implement F1.3
- **Notes**: F1.2 done

_Updated: 2026-06-26T10:00:00Z_
`,
	);
	try {
		const result = readAIDLCState(dir);
		assert.ok(result, "expected non-null result");
		assert.equal(result.phase, "implementing");
		assert.equal(result.branch, "feat/superpowers-fusion-tier-1");
		assert.equal(result.pr, "42");
		assert.equal(result.notes, "F1.2 done");
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: returns null when only Notes is present (no Phase/Branch/PR)", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	// Only Notes is present — parsed count stays at 0, so we return null.
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		`# AIDLC State

- **Notes**: just notes here

`,
	);
	try {
		const result = readAIDLCState(dir);
		assert.equal(result, null);
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: fills '(unreadable)' for missing Phase/Branch/PR when at least one is present", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	// Only Phase is present — Branch/PR/Notes default.
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		`- **Phase**: implementing
`,
	);
	try {
		const result = readAIDLCState(dir);
		assert.ok(result, "expected non-null result");
		assert.equal(result.phase, "implementing");
		assert.equal(result.branch, "(unreadable)");
		assert.equal(result.pr, "(unreadable)");
		assert.equal(result.notes, "");
	} finally {
		cleanup(dir);
	}
});

test("readAIDLCState: typed return matches AIDLCState interface", () => {
	const dir = tmpDir("aidlc-bootstrap-");
	mkdirSync(join(dir, ".aidlc"));
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		`- **Phase**: testing
- **Branch**: feat/test
- **PR**: 7
- **Notes**: hi
`,
	);
	try {
		const result = readAIDLCState(dir) as AIDLCState | null;
		assert.ok(result);
		// Type-shape check: all four fields exist and are strings.
		assert.equal(typeof result.phase, "string");
		assert.equal(typeof result.branch, "string");
		assert.equal(typeof result.pr, "string");
		assert.equal(typeof result.notes, "string");
	} finally {
		cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// messageContainsBootstrap
// ---------------------------------------------------------------------------

test("messageContainsBootstrap: returns false for undefined", () => {
	assert.equal(messageContainsBootstrap(undefined), false);
});

test("messageContainsBootstrap: returns false for null", () => {
	assert.equal(messageContainsBootstrap(null), false);
});

test("messageContainsBootstrap: returns false for object with no content field", () => {
	assert.equal(messageContainsBootstrap({ role: "user" }), false);
});

test("messageContainsBootstrap: returns true when string content contains the marker", () => {
	const msg = { role: "user", content: "before AIDLC mode after" };
	assert.equal(messageContainsBootstrap(msg), true);
});

test("messageContainsBootstrap: returns false when string content lacks the marker", () => {
	const msg = { role: "user", content: "no marker here" };
	assert.equal(messageContainsBootstrap(msg), false);
});

test("messageContainsBootstrap: returns true when one text part in array content contains the marker", () => {
	const msg = {
		role: "assistant",
		content: [
			{ type: "text", text: "regular text" },
			{ type: "text", text: "AIDLC mode payload" },
		],
	};
	assert.equal(messageContainsBootstrap(msg), true);
});

test("messageContainsBootstrap: returns false when no text part in array content contains the marker", () => {
	const msg = {
		role: "assistant",
		content: [
			{ type: "text", text: "hello" },
			{ type: "image", url: "x" },
		],
	};
	assert.equal(messageContainsBootstrap(msg), false);
});

test("messageContainsBootstrap: returns false for empty content array", () => {
	const msg = { role: "user", content: [] };
	assert.equal(messageContainsBootstrap(msg), false);
});

test("messageContainsBootstrap: returns false when content is a non-string, non-array type", () => {
	const msg = { role: "user", content: 42 };
	assert.equal(messageContainsBootstrap(msg), false);
});

// ---------------------------------------------------------------------------
// firstNonCompactionSummaryIndex
// ---------------------------------------------------------------------------

test("firstNonCompactionSummaryIndex: returns 0 for empty array", () => {
	assert.equal(firstNonCompactionSummaryIndex([]), 0);
});

test("firstNonCompactionSummaryIndex: returns 0 when no message has role=compactionSummary", () => {
	const msgs = [{ role: "user" }, { role: "assistant" }];
	assert.equal(firstNonCompactionSummaryIndex(msgs), 0);
});

test("firstNonCompactionSummaryIndex: skips a single leading compactionSummary", () => {
	const msgs = [{ role: "compactionSummary" }, { role: "user" }];
	assert.equal(firstNonCompactionSummaryIndex(msgs), 1);
});

test("firstNonCompactionSummaryIndex: skips multiple leading compactionSummary messages", () => {
	const msgs = [
		{ role: "compactionSummary" },
		{ role: "compactionSummary" },
		{ role: "user" },
	];
	assert.equal(firstNonCompactionSummaryIndex(msgs), 2);
});

test("firstNonCompactionSummaryIndex: returns length when all messages are compactionSummary", () => {
	const msgs = [
		{ role: "compactionSummary" },
		{ role: "compactionSummary" },
	];
	assert.equal(firstNonCompactionSummaryIndex(msgs), 2);
});

test("firstNonCompactionSummaryIndex: only skips leading compactionSummary, not interior ones", () => {
	const msgs = [
		{ role: "compactionSummary" },
		{ role: "user" },
		{ role: "compactionSummary" },
	];
	assert.equal(firstNonCompactionSummaryIndex(msgs), 1);
});

// ---------------------------------------------------------------------------
// bootstrapExtension (default export) — wiring of event handlers
// ---------------------------------------------------------------------------

/** Mock ctx shape — pi's ExtensionContext has cwd here, not on the event. */
type Ctx = { cwd?: string };

type Handler = (event: unknown, ctx: Ctx) => Promise<unknown>;

class MockExtensionAPI {
	readonly handlers = new Map<string, Handler>();

	on(event: string, handler: Handler): void {
		this.handlers.set(event, handler);
	}
}

function call(
	pi: MockExtensionAPI,
	event: string,
	payload: unknown,
	ctx: Ctx = {},
): Promise<unknown> {
	const handler = pi.handlers.get(event);
	assert.ok(handler, `handler for ${event} should be registered`);
	return handler(payload, ctx);
}

/** Write a minimal valid `.aidlc/state.md` so readAIDLCState() succeeds. */
function writeAIDLCState(dir: string): void {
	mkdirSync(join(dir, ".aidlc"));
	writeFileSync(
		join(dir, ".aidlc", "state.md"),
		`- **Phase**: implementing
- **Branch**: feat/test
- **PR**: 42
- **Notes**: fixture
`,
	);
}

test("bootstrapExtension: registers session_start, session_compact, agent_end, and context handlers", () => {
	const pi = new MockExtensionAPI();
	bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

	assert.ok(pi.handlers.has("session_start"), "session_start handler missing");
	assert.ok(pi.handlers.has("session_compact"), "session_compact handler missing");
	assert.ok(pi.handlers.has("agent_end"), "agent_end handler missing");
	assert.ok(pi.handlers.has("context"), "context handler missing");
});

test("bootstrapExtension: context handler injects bootstrap message at index 0 when .aidlc exists and flag is on", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	writeAIDLCState(dir);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		// session_start sets injectBootstrap = true
		await call(pi, "session_start", {});

		const result = (await call(pi, "context", {
			messages: [{ role: "user", content: "hello" }],
		}, { cwd: dir })) as { messages: Array<{ role: string; content: unknown }> };

		assert.ok(result, "context handler should return a result when injecting");
		assert.ok(Array.isArray(result.messages));
		assert.equal(result.messages.length, 2);
		const inserted = result.messages[0];
		assert.equal(inserted.role, "user");
		// The injected content is an array with at least one text part containing the active-loop template.
		assert.ok(Array.isArray(inserted.content));
		const text = (inserted.content as Array<{ type: string; text: string }>)[0].text;
		assert.equal(typeof text, "string");
		assert.ok(text.length > 0, "inserted message text should be non-empty");
		assert.ok(text.includes("implementing"), "inserted message should include phase from state.md");
		assert.ok(text.includes("feat/test"), "inserted message should include branch from state.md");
		assert.equal(result.messages[1].role, "user"); // original message preserved
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: context handler returns undefined when .aidlc directory is missing", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		await call(pi, "session_start", {});

		const result = await call(pi, "context", {
			messages: [{ role: "user", content: "hello" }],
		}, { cwd: dir });

		assert.equal(result, undefined);
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: context handler skips injection after agent_end resets the flag", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	writeAIDLCState(dir);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		await call(pi, "session_start", {});
		await call(pi, "agent_end", {});

		const result = await call(pi, "context", {
			messages: [{ role: "user", content: "hello" }],
			cwd: dir,
		});

		assert.equal(result, undefined);
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: session_compact re-arms the injection flag", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	writeAIDLCState(dir);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		// Reset flag, then re-arm via session_compact.
		await call(pi, "agent_end", {});
		await call(pi, "session_compact", {});

		const result = (await call(pi, "context", {
			messages: [],
		}, { cwd: dir })) as { messages: Array<unknown> };

		assert.ok(result);
		assert.equal(result.messages.length, 1);
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: context handler does NOT double-inject when bootstrap marker is already present", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	writeAIDLCState(dir);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		await call(pi, "session_start", {});

		const result = await call(pi, "context", {
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: "previous turn — AIDLC mode bootstrap already in history" }],
				},
			],
		}, { cwd: dir });

		assert.equal(result, undefined, "context handler must skip when a message already carries the marker");
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: context handler inserts after leading compactionSummary messages", async () => {
	const dir = tmpDir("aidlc-bootstrap-ext-");
	writeAIDLCState(dir);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		await call(pi, "session_start", {});

		const result = (await call(pi, "context", {
			messages: [
				{ role: "compactionSummary" },
				{ role: "compactionSummary" },
				{ role: "user", content: "hello" },
			],
		}, { cwd: dir })) as { messages: Array<{ role: string; content: unknown }> };

		assert.ok(result);
		assert.equal(result.messages.length, 4);
		// First two are compaction summaries, unchanged.
		assert.equal(result.messages[0].role, "compactionSummary");
		assert.equal(result.messages[1].role, "compactionSummary");
		// Index 2 is the freshly-inserted bootstrap (user role, has non-empty text content).
		assert.equal(result.messages[2].role, "user");
		const insertedContent = result.messages[2].content as Array<{ type: string; text: string }>;
		assert.ok(Array.isArray(insertedContent));
		assert.equal(insertedContent[0].type, "text");
		assert.ok(insertedContent[0].text.length > 0);
		// Index 3 is the original user message, pushed back.
		assert.equal(result.messages[3].role, "user");
	} finally {
		cleanup(dir);
	}
});

test("bootstrapExtension: context handler reads cwd from ctx, not event.cwd or process.cwd()", async () => {
	// Regression test for the F1.5 review's Critical #1: the handler must read
	// `ctx.cwd` (pi's ExtensionContext), not `event.cwd` (which is undefined on
	// ContextEvent) and not `process.cwd()` (which is the shell's cwd, not
	// necessarily the project's cwd).
	const dirWithState = tmpDir("aidlc-bootstrap-ctx-state-");
	mkdirSync(join(dirWithState, ".aidlc"));
	writeFileSync(
		join(dirWithState, ".aidlc", "state.md"),
		`- **Phase**: ctx-cwd-phase
- **Branch**: feat/from-ctx
- **PR**: 99
- **Notes**: ctx-cwd-fixture
`,
	);
	const dirNoState = tmpDir("aidlc-bootstrap-ctx-empty-");
	const originalCwd = process.cwd();
	// Point process.cwd() at a directory with NO `.aidlc/`. If the handler
	// falls back to process.cwd(), it will see no state and skip injection —
	// making this test fail.
	process.chdir(dirNoState);
	try {
		const pi = new MockExtensionAPI();
		bootstrapExtension(pi as unknown as Parameters<typeof bootstrapExtension>[0]);

		await call(pi, "session_start", {});

		// Pass cwd ONLY via ctx. event.cwd is intentionally absent.
		const result = (await call(pi, "context", {
			messages: [{ role: "user", content: "hello" }],
		}, { cwd: dirWithState })) as { messages: Array<{ role: string; content: unknown }> };

		assert.ok(result, "context handler must inject bootstrap when ctx.cwd points at a valid .aidlc/");
		assert.ok(Array.isArray(result.messages));
		assert.equal(result.messages.length, 2);
		const inserted = result.messages[0];
		assert.equal(inserted.role, "user");
		const text = (inserted.content as Array<{ type: string; text: string }>)[0].text;
		assert.ok(
			text.includes("ctx-cwd-phase"),
			`bootstrap must contain phase from ctx.cwd's state.md; got: ${text.slice(0, 200)}`,
		);
		assert.ok(
			text.includes("feat/from-ctx"),
			"bootstrap must contain branch from ctx.cwd's state.md",
		);
	} finally {
		process.chdir(originalCwd);
		cleanup(dirWithState);
		cleanup(dirNoState);
	}
});