/**
 * Bootstrap test — isolated unit test for readAIDLCState() in bootstrap.ts.
 * Run with: node --experimental-strip-types --test test/bootstrap.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readAIDLCState, type AIDLCState } from "../bootstrap.ts";

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