/**
 * Worktree discipline — borrowed from loop-engineer-template's
 * `ship-change.js`.
 *
 * Why worktrees?
 *   - The orchestrator owns the main checkout. Sub-agents own worktrees.
 *   - Parallel agents can't collide if each has its own working tree.
 *   - A leftover worktree pins its branch (you can't delete a
 *     checked-out branch), so cleanup is mandatory.
 *
 * What this module does:
 *   1. Create a worktree at `<repo>-worktrees/<branch-slug>`.
 *   2. Carry over gitignored env files (`.env`, `.env.local`, etc.).
 *   3. Warm dependencies — APFS-clone node_modules from the base
 *      checkout (macOS only, copy-on-write, near-instant), or fall
 *      back to pnpm/npm install.
 *
 * It does NOT implement the agent loop — just the bootstrap.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

export interface WorktreeSetup {
	worktreePath: string;
	branch: string;
	baseRef: string;
	envFilesCopied: string[];
	depsWarmed: "clone" | "install" | "skipped" | "none";
	isApfs: boolean;
	notes: string;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a worktree for the given branch, off the given base ref.
 *
 * Steps:
 *   1. Verify the base ref exists.
 *   2. Pick a worktree path OUTSIDE the main checkout:
 *      `<repo>-worktrees/<branch-slug>` (sibling dir).
 *   3. `git worktree add <path> -b <branch> <baseRef>`.
 *   4. Carry over gitignored env files (loop-engineer gotcha — fresh
 *      worktrees have no `.env`).
 *   5. Warm dependencies (APFS clone if possible, install otherwise).
 */
export function setupWorktree(opts: {
	repoRoot: string;
	branch: string;
	baseRef: string;
}): WorktreeSetup {
	const { repoRoot, branch, baseRef } = opts;

	// 1. Sanity check base ref exists.
	const refs = run(`git show-ref --verify --quiet refs/heads/${baseRef}`, repoRoot, true);
	const originRefs = run(`git show-ref --verify --quiet refs/remotes/origin/${baseRef}`, repoRoot, true);
	if (refs !== null && originRefs === null) {
		// Local only — fine, use it.
	} else if (refs === null && originRefs !== null) {
		// Use origin/<baseRef>
	} else if (refs === null && originRefs === null) {
		throw new Error(`base ref ${baseRef} does not exist in ${repoRoot}`);
	}

	// 2. Pick worktree path. Loop-engineer convention: sibling dir.
	// Preserve `/` in the branch name so `feat/foo` lives at
	// `<repo>-worktrees/feat/foo` — mirrors the branch hierarchy.
	const repoName = path.basename(repoRoot);
	const branchSlug = branch.replace(/[^a-zA-Z0-9._/-]+/g, "-");
	const worktreePath = path.join(path.dirname(repoRoot), `${repoName}-worktrees`, branchSlug);

	if (fs.existsSync(worktreePath)) {
		throw new Error(`worktree path already exists: ${worktreePath}`);
	}

	fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

	// 3. Create the worktree.
	run(`git worktree add ${shellQuote(worktreePath)} -b ${shellQuote(branch)} ${shellQuote(baseRef)}`, repoRoot);

	// 4. Carry over gitignored env files.
	const envFilesCopied = carryOverEnvFiles(repoRoot, worktreePath);

	// 5. Warm dependencies.
	const isApfs = detectApfs();
	const depsWarmed = warmDeps(repoRoot, worktreePath, isApfs);

	const notes = [
		`Worktree: ${worktreePath}`,
		`Branch: ${branch}`,
		`Base: ${baseRef}`,
		`Env files copied: ${envFilesCopied.length}`,
		`Deps: ${depsWarmed}${isApfs ? " (APFS detected)" : ""}`,
	].join("\n");

	return {
		worktreePath,
		branch,
		baseRef,
		envFilesCopied,
		depsWarmed,
		isApfs,
		notes,
	};
}

/** List existing worktrees. */
export function listWorktrees(repoRoot: string): Array<{ path: string; branch: string | null }> {
	const out = run("git worktree list --porcelain", repoRoot);
	if (!out) return [];
	const entries: Array<{ path: string; branch: string | null }> = [];
	let current: { path?: string; branch?: string | null } = {};
	for (const line of out.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current.path) entries.push({ path: current.path, branch: current.branch ?? null });
			current = { path: line.slice("worktree ".length) };
		} else if (line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length).replace("refs/heads/", "");
		} else if (line.trim() === "detached") {
			current.branch = null;
		}
	}
	if (current.path) entries.push({ path: current.path, branch: current.branch ?? null });
	return entries;
}

/** Remove a worktree by path. Returns `true` on success, `false` if blocked (dirty/locked). */
export function removeWorktree(repoRoot: string, worktreePath: string, force = false): boolean {
	const flag = force ? "--force" : "";
	try {
		run(`git worktree remove ${flag} ${shellQuote(worktreePath)}`, repoRoot);
		return true;
	} catch {
		return false;
	}
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Copy gitignored `.env*` files from base checkout into worktree.
 *
 * Loop-engineer's gotcha: `git worktree add` only populates
 * version-controlled files. A fresh worktree has NO `.env` files and
 * the app can't boot. This silently blocks later verification.
 *
 * Returns the list of copied relative paths.
 */
function carryOverEnvFiles(repoRoot: string, worktreePath: string): string[] {
	// `--directory`: collapse `node_modules/`, `.next/`, etc. into single
	// directory entries so the output stays small (otherwise a pnpm
	// `node_modules/.pnpm/*` tree overflows the execSync pipe buffer
	// and the spawn fails with ENOBUFS before the .env copy happens).
	const listed = run(
		"git ls-files --others --ignored --exclude-standard --directory",
		repoRoot,
	);
	if (!listed) return [];
	const envFiles = listed
		.split("\n")
		.map((l) => l.trim())
		.filter((rel) => /(^|\/)\.env(\.[^/]+)?$/.test(rel));
	const copied: string[] = [];
	for (const rel of envFiles) {
		const src = path.join(repoRoot, rel);
		const dst = path.join(worktreePath, rel);
		if (!fs.existsSync(src)) continue;
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		fs.copyFileSync(src, dst);
		copied.push(rel);
	}
	return copied;
}

/**
 * Warm the worktree's `node_modules` so later stages can run
 * typecheck/lint/tests without an install step.
 *
 *   - APFS (macOS) + matching lockfile → `cp -c -R` for copy-on-write.
 *     pnpm uses relative symlinks so the clone resolves at the new path.
 *   - Otherwise → `pnpm install --prefer-offline` (or npm ci).
 *   - Non-Node repo → `none`.
 */
function warmDeps(repoRoot: string, worktreePath: string, isApfs: boolean): WorktreeSetup["depsWarmed"] {
	if (!fs.existsSync(path.join(repoRoot, "node_modules"))) return "none";

	const lockfile = detectLockfile(repoRoot);
	if (!lockfile) return "skipped"; // No lockfile — let later stages install.

	if (isApfs) {
		// Verify lockfile matches in the worktree.
		const baseLock = path.join(repoRoot, lockfile);
		const wtLock = path.join(worktreePath, lockfile);
		if (fs.existsSync(baseLock) && fs.existsSync(wtLock)) {
			const diff = run(`diff -q ${shellQuote(baseLock)} ${shellQuote(wtLock)}`, repoRoot, true);
			if (diff === null) {
				// Lockfile matches. Try APFS clone.
				const tryClone = tryApfsClone(repoRoot, worktreePath);
				if (tryClone) return "clone";
			}
		}
	}

	// Fallback: package-manager install.
	const pkgManager = lockfile === "pnpm-lock.yaml" ? "pnpm" : lockfile === "yarn.lock" ? "yarn" : "npm";
	const cmd =
		pkgManager === "npm"
			? "npm ci"
			: pkgManager === "yarn"
				? "yarn install --frozen-lockfile"
				: "pnpm install --prefer-offline";
	try {
		run(cmd, worktreePath);
		return "install";
	} catch (err) {
		console.warn(`[worktree] ${cmd} failed: ${(err as Error).message}`);
		return "skipped";
	}
}

function detectLockfile(repoRoot: string): string | null {
	for (const lf of ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"]) {
		if (fs.existsSync(path.join(repoRoot, lf))) return lf;
	}
	return null;
}

function tryApfsClone(repoRoot: string, worktreePath: string): boolean {
	// Enumerate top-level node_modules dirs (root + workspaces).
	const findCmd = `find ${shellQuote(repoRoot)} -type d -name node_modules -prune | grep -v '/node_modules/'`;
	const out = run(findCmd, repoRoot);
	if (!out) return false;

	const rels = out
		.split("\n")
		.map((p) => path.relative(repoRoot, p))
		.filter(Boolean);

	try {
		for (const rel of rels) {
			const src = path.join(repoRoot, rel);
			const dst = path.join(worktreePath, rel);
			fs.mkdirSync(path.dirname(dst), { recursive: true });
			// -c = APFS clonefile (copy-on-write). Errors on non-APFS or
			// cross-volume; we catch and return false to fall back.
			run(`cp -c -R ${shellQuote(src)} ${shellQuote(dst)}`, repoRoot);
		}
		return true;
	} catch {
		// Best-effort cleanup of partial clones.
		for (const rel of rels) {
			const dst = path.join(worktreePath, rel);
			try {
				fs.rmSync(dst, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
		return false;
	}
}

/** Detect whether the filesystem is APFS (macOS). */
function detectApfs(): boolean {
	if (process.platform !== "darwin") return false;
	try {
		const out = run("stat -f%Ht /", "/");
		// APFS magic = 0x4827 (HFS+ = 0x4828). Some sources also report 0x482B.
		return out === "0x4827" || out === "0x482b";
	} catch {
		return false;
	}
}

// =============================================================================
// Shell helpers
// =============================================================================

/**
 * Run a command and capture stdout. Throws on non-zero exit unless
 * `allowFailure` is true (in which case returns null).
 */
function run(cmd: string, cwd: string, allowFailure = false): string | null {
	try {
		return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch (err) {
		if (allowFailure) return null;
		throw err;
	}
}

/** POSIX shell single-quote escaping. Safe for LLM-supplied strings. */
export function shellQuote(s: string): string {
	if (!/[^A-Za-z0-9_\-./:=]/.test(s)) return s;
	return `'${s.replace(/'/g, "'\\''")}'`;
}