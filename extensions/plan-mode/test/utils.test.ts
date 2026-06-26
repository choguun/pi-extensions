/**
 * Tests for pure utilities (path resolution, filename formatting,
 * AIDLC state detection, slug derivation).
 *
 * No pi runtime needed. Run with:
 *   node --test test/utils.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	deriveSlug,
	formatPlanFilename,
	readPhaseFromState,
	resolvePlanPath,
	slugify,
} from "../utils.ts";

// =============================================================================
// Helpers
// =============================================================================

function mkTmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "plan-mode-test-"));
}

function cleanup(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

const FIXED_DATE = new Date("2026-06-26T12:00:00.000Z");

// =============================================================================
// slugify
// =============================================================================

test("slugify: lowercase + replace non-alphanumeric", () => {
	assert.equal(slugify("Add OAuth to Auth Service"), "add-oauth-to-auth-service");
	assert.equal(slugify("Fix bug #123!"), "fix-bug-123");
});

test("slugify: collapse repeated dashes", () => {
	assert.equal(slugify("foo --- bar"), "foo-bar");
	assert.equal(slugify("a  b  c"), "a-b-c");
});

test("slugify: trim leading/trailing dashes", () => {
	assert.equal(slugify("---hello---"), "hello");
});

test("slugify: empty / non-alphanumeric only → 'untitled'", () => {
	assert.equal(slugify(""), "untitled");
	assert.equal(slugify("!!!"), "untitled");
});

test("slugify: caps input length at 64", () => {
	const long = "a".repeat(100);
	const slug = slugify(long);
	assert.ok(slug.length <= 64, `expected <= 64 chars, got ${slug.length}`);
});

// =============================================================================
// formatPlanFilename
// =============================================================================

test("formatPlanFilename: ISO timestamp with safe separators + slug + .md", () => {
	const filename = formatPlanFilename("add-oauth", FIXED_DATE);
	assert.equal(filename, "2026-06-26T12-00-00-000Z-add-oauth.md");
});

test("formatPlanFilename: no colons or dots (FS-safe)", () => {
	const filename = formatPlanFilename("foo", FIXED_DATE);
	assert.ok(!filename.includes(":"), "filename must not contain colons");
	assert.ok(!filename.match(/\.\d+Z/), "filename must not have unescaped fractional seconds");
});

// =============================================================================
// deriveSlug
// =============================================================================

test("deriveSlug: from session name", () => {
	assert.equal(deriveSlug("Add OAuth", "abc12345"), "add-oauth");
});

test("deriveSlug: from session id (hex)", () => {
	assert.equal(deriveSlug(undefined, "abcdef1234567890"), "abcdef12");
});

test("deriveSlug: from session id (uuid)", () => {
	// Hyphens stripped by slugify, then take first 8
	assert.equal(deriveSlug(undefined, "550e8400-e29b-41d4-a716-446655440000"), "550e8400");
});

test("deriveSlug: untitled fallback", () => {
	assert.equal(deriveSlug(undefined, undefined), "untitled");
});

// =============================================================================
// readPhaseFromState
// =============================================================================

test("readPhaseFromState: extracts phase field", () => {
	const tmp = mkTmp();
	try {
		const statePath = path.join(tmp, "state.md");
		fs.writeFileSync(
			statePath,
			`# AIDLC State\n\n- **Phase**: specifying\n- **Branch**: feat/x\n`,
		);
		assert.equal(readPhaseFromState(statePath), "specifying");
	} finally {
		cleanup(tmp);
	}
});

test("readPhaseFromState: returns undefined for missing file", () => {
	const tmp = mkTmp();
	try {
		assert.equal(readPhaseFromState(path.join(tmp, "nope.md")), undefined);
	} finally {
		cleanup(tmp);
	}
});

test("readPhaseFromState: returns undefined for malformed file", () => {
	const tmp = mkTmp();
	try {
		const statePath = path.join(tmp, "state.md");
		fs.writeFileSync(statePath, "# Random markdown\n\nNo phase field here.");
		assert.equal(readPhaseFromState(statePath), undefined);
	} finally {
		cleanup(tmp);
	}
});

// =============================================================================
// resolvePlanPath
// =============================================================================

test("resolvePlanPath: override wins", () => {
	const tmp = mkTmp();
	try {
		const result = resolvePlanPath({
			override: "docs/my-plan.md",
			cwd: tmp,
			slug: "test",
			now: () => FIXED_DATE,
		});
		assert.equal(result, path.join(tmp, "docs", "my-plan.md"));
		assert.ok(fs.existsSync(path.dirname(result)), "parent dir must be created");
	} finally {
		cleanup(tmp);
	}
});

test("resolvePlanPath: AIDLC detection — phase=specifying → .aidlc/plan.md", () => {
	const tmp = mkTmp();
	try {
		fs.mkdirSync(path.join(tmp, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(tmp, ".aidlc", "state.md"),
			"- **Phase**: specifying\n",
		);
		const result = resolvePlanPath({
			override: undefined,
			cwd: tmp,
			slug: "test",
			now: () => FIXED_DATE,
		});
		assert.equal(result, path.join(tmp, ".aidlc", "plan.md"));
	} finally {
		cleanup(tmp);
	}
});

test("resolvePlanPath: AIDLC detection — phase=planning → .aidlc/plan.md", () => {
	const tmp = mkTmp();
	try {
		fs.mkdirSync(path.join(tmp, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(tmp, ".aidlc", "state.md"),
			"- **Phase**: planning\n",
		);
		const result = resolvePlanPath({
			override: undefined,
			cwd: tmp,
			slug: "test",
			now: () => FIXED_DATE,
		});
		assert.equal(result, path.join(tmp, ".aidlc", "plan.md"));
	} finally {
		cleanup(tmp);
	}
});

test("resolvePlanPath: AIDLC detection — phase=implementing → default location", () => {
	const tmp = mkTmp();
	try {
		fs.mkdirSync(path.join(tmp, ".aidlc"), { recursive: true });
		fs.writeFileSync(
			path.join(tmp, ".aidlc", "state.md"),
			"- **Phase**: implementing\n",
		);
		const result = resolvePlanPath({
			override: undefined,
			cwd: tmp,
			slug: "my-feat",
			now: () => FIXED_DATE,
		});
		assert.equal(result, path.join(tmp, ".opencode", "plans", "2026-06-26T12-00-00-000Z-my-feat.md"));
	} finally {
		cleanup(tmp);
	}
});

test("resolvePlanPath: default → .opencode/plans/<timestamp>-<slug>.md", () => {
	const tmp = mkTmp();
	try {
		const result = resolvePlanPath({
			override: undefined,
			cwd: tmp,
			slug: "add-oauth",
			now: () => FIXED_DATE,
		});
		assert.equal(result, path.join(tmp, ".opencode", "plans", "2026-06-26T12-00-00-000Z-add-oauth.md"));
		assert.ok(fs.existsSync(path.join(tmp, ".opencode", "plans")), "plans dir must be created");
	} finally {
		cleanup(tmp);
	}
});

test("resolvePlanPath: absolute override is preserved", () => {
	const tmp = mkTmp();
	try {
		const abs = path.join(tmp, "custom", "my-plan.md");
		const result = resolvePlanPath({
			override: abs,
			cwd: "/somewhere/else",
			slug: "test",
			now: () => FIXED_DATE,
		});
		assert.equal(result, abs);
	} finally {
		cleanup(tmp);
	}
});