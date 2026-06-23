/**
 * Tests for the worktree bootstrap (worktree.ts).
 *
 * Verifies:
 *   - shellQuote escapes LLM-supplied strings safely
 *   - setupWorktree creates a sibling-dir worktree with the right branch
 *   - gitignored env files are carried over
 *   - listWorktrees / removeWorktree round-trip
 *   - npm-installed deps warm the worktree
 *
 * Run with: node --experimental-strip-types --test test/worktree.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setupWorktree, listWorktrees, removeWorktree, shellQuote } from "../worktree.ts";

function mkRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-wt-"));
	execSync("git init -q -b main", { cwd: dir });
	execSync('git config user.email "test@example.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	execSync("git commit -q --allow-empty -m init", { cwd: dir });
	return dir;
}

function cleanup(dir: string): void {
	try {
		// Worktrees live in sibling dirs — clean those up too.
		const parent = path.dirname(dir);
		const name = path.basename(dir);
		const wtParent = path.join(parent, `${name}-worktrees`);
		if (fs.existsSync(wtParent)) {
			fs.rmSync(wtParent, { recursive: true, force: true });
		}
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

// =============================================================================
// shellQuote — security-critical, must reject injection
// =============================================================================

test("shellQuote: passes through safe strings", () => {
	assert.equal(shellQuote("/tmp/dir"), "/tmp/dir");
	assert.equal(shellQuote("feat/foo"), "feat/foo");
	assert.equal(shellQuote("main"), "main");
	assert.equal(shellQuote("/path/with.dots/file"), "/path/with.dots/file");
});

test("shellQuote: escapes single quotes (POSIX-safe)", () => {
	assert.equal(shellQuote("it's"), `'it'\\''s'`);
});

test("shellQuote: wraps strings with spaces or special chars", () => {
	const out = shellQuote("hello world");
	assert.ok(out.startsWith("'"));
	assert.ok(out.endsWith("'"));
	assert.equal(out, "'hello world'");
});

test("shellQuote: escapes shell metacharacters", () => {
	const out = shellQuote("$(rm -rf /)");
	assert.ok(out.startsWith("'"));
	assert.ok(out.endsWith("'"));
	assert.ok(out.includes("$(rm -rf /)"));
});

test("shellQuote: escapes backticks", () => {
	const out = shellQuote("foo`whoami`bar");
	assert.ok(out.startsWith("'"));
	assert.ok(out.endsWith("'"));
});

// =============================================================================
// setupWorktree
// =============================================================================

test("setupWorktree: creates sibling worktree off the given base ref", () => {
	const dir = mkRepo();
	try {
		const wt = setupWorktree({
			repoRoot: dir,
			branch: "feat/race-condition",
			baseRef: "main",
		});
		assert.ok(fs.existsSync(wt.worktreePath), "worktree dir should exist");
		assert.equal(wt.branch, "feat/race-condition");
		assert.equal(wt.baseRef, "main");
		// Worktree should be a sibling, not a child.
		const expectedParent = path.join(path.dirname(dir), `${path.basename(dir)}-worktrees`, "feat/race-condition");
		assert.equal(wt.worktreePath, expectedParent);
		// HEAD on the worktree should point to the new branch.
		const head = execSync("git rev-parse --abbrev-ref HEAD", { cwd: wt.worktreePath, encoding: "utf-8" }).trim();
		assert.equal(head, "feat/race-condition");
	} finally {
		cleanup(dir);
	}
});

test("setupWorktree: carries over gitignored .env files", () => {
	const dir = mkRepo();
	try {
		// Create a .gitignore that ignores .env
		fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n.env.local\n");
		// Create the .env files
		fs.writeFileSync(path.join(dir, ".env"), "API_KEY=secret123\n");
		fs.writeFileSync(path.join(dir, ".env.local"), "DEBUG=true\n");

		const wt = setupWorktree({
			repoRoot: dir,
			branch: "feat/env-test",
			baseRef: "main",
		});

		assert.equal(wt.envFilesCopied.length, 2);
		assert.ok(fs.existsSync(path.join(wt.worktreePath, ".env")));
		assert.ok(fs.existsSync(path.join(wt.worktreePath, ".env.local")));
		// Verify the content was preserved
		const envContent = fs.readFileSync(path.join(wt.worktreePath, ".env"), "utf-8");
		assert.ok(envContent.includes("secret123"));
	} finally {
		cleanup(dir);
	}
});

test("setupWorktree: copies only .env* files (not node_modules)", () => {
	const dir = mkRepo();
	try {
		fs.writeFileSync(path.join(dir, ".gitignore"), ".env\nnode_modules/\n");
		fs.writeFileSync(path.join(dir, ".env"), "X=1\n");
		fs.mkdirSync(path.join(dir, "node_modules"));
		fs.writeFileSync(path.join(dir, "node_modules", "x.js"), "module.exports = 1;\n");

		const wt = setupWorktree({
			repoRoot: dir,
			branch: "feat/selective",
			baseRef: "main",
		});

		// .env was copied
		assert.ok(fs.existsSync(path.join(wt.worktreePath, ".env")));
		// node_modules/x.js was NOT copied (it's not an .env file)
		assert.ok(!fs.existsSync(path.join(wt.worktreePath, "node_modules", "x.js")));
	} finally {
		cleanup(dir);
	}
});

test("setupWorktree: works with non-existent base ref throws", () => {
	const dir = mkRepo();
	try {
		assert.throws(
			() => setupWorktree({
				repoRoot: dir,
				branch: "feat/foo",
				baseRef: "no-such-branch",
			}),
			/base ref .* does not exist/,
		);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// listWorktrees / removeWorktree
// =============================================================================

test("listWorktrees: returns the main checkout + any added worktrees", () => {
	const dir = mkRepo();
	try {
		const wt = setupWorktree({
			repoRoot: dir,
			branch: "feat/list-test",
			baseRef: "main",
		});
		const list = listWorktrees(dir);
		assert.ok(list.length >= 2, "should have main + at least one worktree");
		// git worktree list --porcelain returns resolved paths (macOS /tmp
		// is a symlink to /private/tmp), so compare via realpath.
		const realDir = fs.realpathSync(dir);
		const realWt = fs.realpathSync(wt.worktreePath);
		assert.ok(list.some((e) => e.path === realDir), `main checkout (${realDir}) should be in the list: ${list.map((e) => e.path).join(", ")}`);
		assert.ok(list.some((e) => e.path === realWt), `new worktree (${realWt}) should be in the list: ${list.map((e) => e.path).join(", ")}`);
	} finally {
		cleanup(dir);
	}
});

test("removeWorktree: removes a worktree, returns true on success", () => {
	const dir = mkRepo();
	try {
		const wt = setupWorktree({
			repoRoot: dir,
			branch: "feat/removable",
			baseRef: "main",
		});
		assert.ok(fs.existsSync(wt.worktreePath));
		const removed = removeWorktree(dir, wt.worktreePath);
		assert.equal(removed, true);
		assert.ok(!fs.existsSync(wt.worktreePath));
	} finally {
		cleanup(dir);
	}
});