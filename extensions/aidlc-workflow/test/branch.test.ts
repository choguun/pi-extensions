/**
 * Tests for `detectDefaultBranch`.
 *
 * Why this matters: the start action creates a feature branch *from* the
 * default branch. If we hardcode "main" and the repo uses "master" /
 * "trunk" / "develop" / "gh-pages" the branch is created from the wrong
 * ancestor. So this function has 3 fallbacks: symbolic-ref → current
 * branch → literal "main".
 *
 * Run with: node --experimental-strip-types --test test/branch.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectDefaultBranch } from "../index.ts";

function makeRepo(opts: { defaultBranch: string; setOrigin?: boolean }): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-branch-"));
	execSync(`git init -q -b ${opts.defaultBranch}`, { cwd: dir });
	execSync('git config user.email "test@example.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	execSync("git commit -q --allow-empty -m init", { cwd: dir });

	if (opts.setOrigin) {
		// Add a fake remote so `git symbolic-ref refs/remotes/origin/HEAD`
		// can resolve. We have to point to a real directory we can clone
		// into, then set the HEAD symbolic ref manually.
		const upstream = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-upstream-"));
		execSync(`git init -q -b ${opts.defaultBranch} --bare`, { cwd: upstream });
		execSync(`git remote add origin ${upstream}`, { cwd: dir });
		execSync(`git push -q origin ${opts.defaultBranch}`, { cwd: dir });
		execSync(`git remote set-head origin ${opts.defaultBranch}`, { cwd: dir });
	}

	return dir;
}

function cleanup(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

test("falls back to current branch when no symbolic-ref is set", () => {
	const dir = makeRepo({ defaultBranch: "master" });
	try {
		// No origin, so symbolic-ref fails. Current branch is "master".
		const result = detectDefaultBranch(dir);
		assert.equal(result, "master");
	} finally {
		cleanup(dir);
	}
});

test("uses symbolic-ref when origin/HEAD is set (main)", () => {
	const dir = makeRepo({ defaultBranch: "main", setOrigin: true });
	try {
		// Switch the local branch away from "main" so we can tell which
		// path returned the value.
		execSync("git checkout -q -b feature-temp", { cwd: dir });
		const result = detectDefaultBranch(dir);
		assert.equal(result, "main");
	} finally {
		cleanup(dir);
	}
});

test("uses symbolic-ref when origin/HEAD is set (trunk)", () => {
	const dir = makeRepo({ defaultBranch: "trunk", setOrigin: true });
	try {
		execSync("git checkout -q -b feature-temp", { cwd: dir });
		const result = detectDefaultBranch(dir);
		assert.equal(result, "trunk");
	} finally {
		cleanup(dir);
	}
});

test("uses symbolic-ref when origin/HEAD is set (develop)", () => {
	const dir = makeRepo({ defaultBranch: "develop", setOrigin: true });
	try {
		execSync("git checkout -q -b feature-temp", { cwd: dir });
		const result = detectDefaultBranch(dir);
		assert.equal(result, "develop");
	} finally {
		cleanup(dir);
	}
});

test("works with non-standard default (gh-pages)", () => {
	const dir = makeRepo({ defaultBranch: "gh-pages" });
	try {
		const result = detectDefaultBranch(dir);
		assert.equal(result, "gh-pages");
	} finally {
		cleanup(dir);
	}
});