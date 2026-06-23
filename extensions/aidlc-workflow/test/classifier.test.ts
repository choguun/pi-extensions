/**
 * Tests for the PR comment classifier.
 *
 * The classifier routes review comments to the right AIDLC phase. Bugs
 * here cause wrong routing, which is the core of the feedback loop.
 * Run with: node --experimental-strip-types --test test/classifier.test.ts
 *
 * Imports the *same* function the runtime uses (./classifier.ts) so the
 * test and production can't drift.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { classifyComment } from "../classifier.ts";

// =============================================================================
// P0: real bugs
// =============================================================================

test("P0: race condition → implement", () => {
	const c = classifyComment("There's a race condition in the cache invalidation.", "alice");
	assert.equal(c.priority, "P0");
	assert.equal(c.phase, "implement");
});

test("P0: null pointer deref → implement", () => {
	const c = classifyComment("This crashes with a null pointer when config is empty.", "bob");
	assert.equal(c.priority, "P0");
	assert.equal(c.phase, "implement");
});

test("P0: memory leak → implement", () => {
	const c = classifyComment("Memory leak in the WebSocket reconnect path.", "carol");
	assert.equal(c.priority, "P0");
	assert.equal(c.phase, "implement");
});

test("P0: SQL injection → implement (security)", () => {
	const c = classifyComment("SQL injection possible via the user_id parameter.", "dave");
	assert.equal(c.priority, "P0");
	assert.equal(c.phase, "implement");
});

test("P0: CVE mention → implement (security)", () => {
	const c = classifyComment("This is CVE-2024-12345 — fix immediately.", "eve");
	assert.equal(c.priority, "P0");
	assert.equal(c.phase, "implement");
});

// =============================================================================
// P1: test/spec issues
// =============================================================================

test("P1: failing test → test", () => {
	const c = classifyComment("This test is failing on CI.", "alice");
	assert.equal(c.priority, "P1");
	assert.equal(c.phase, "test");
});

test("P1: build broken → test", () => {
	const c = classifyComment("The build is broken on master.", "bob");
	assert.equal(c.priority, "P1");
	assert.equal(c.phase, "test");
});

test("P1: missing test coverage → test", () => {
	const c = classifyComment("Where are the tests for this code path?", "carol");
	assert.equal(c.priority, "P1");
	assert.equal(c.phase, "test");
});

test("P1: scope creep → specify", () => {
	const c = classifyComment("This is out of scope for this PR — please remove.", "dave");
	assert.equal(c.priority, "P1");
	assert.equal(c.phase, "specify");
});

test("P1: missing acceptance criterion → specify", () => {
	const c = classifyComment("The spec doesn't include an acceptance criterion for this.", "eve");
	assert.equal(c.priority, "P1");
	assert.equal(c.phase, "specify");
});

// =============================================================================
// P2: style/design nits
// =============================================================================

test("P2: typo → implement (style nit)", () => {
	const c = classifyComment("Typo in the comment: 'recieve' should be 'receive'.", "alice");
	assert.equal(c.priority, "P2");
	assert.equal(c.phase, "implement");
});

test("P2: refactor suggestion → implement", () => {
	const c = classifyComment("Could you refactor this into a helper? The duplication is annoying.", "bob");
	assert.equal(c.priority, "P2");
	assert.equal(c.phase, "implement");
});

// =============================================================================
// Review-bot digests (cubic-dev-ai, etc.)
// =============================================================================

test("review-bot digest with security issues → implement P0", () => {
	const c = classifyComment(
		"**2 issues found** across 1 file\n\n- P0: SQL injection vulnerability\n- P1: Missing input validation",
		"cubic-dev-ai[bot]",
	);
	assert.equal(c.phase, "implement");
	assert.equal(c.priority, "P0");
});

test("review-bot digest with bug issues → implement P0", () => {
	const c = classifyComment(
		"**1 issue found** across 1 file\n\n- P0: Null pointer dereference on line 42",
		"cubic-dev-ai[bot]",
	);
	assert.equal(c.phase, "implement");
	assert.equal(c.priority, "P0");
});

test("review-bot digest with test issues → test P1", () => {
	const c = classifyComment(
		"**1 issue found** across 1 file\n\n- P1: Missing test coverage on the new branch",
		"cubic-dev-ai[bot]",
	);
	assert.equal(c.phase, "test");
	assert.equal(c.priority, "P1");
});

test("review-bot digest with no specific issue type → review P2", () => {
	const c = classifyComment(
		"**1 issue found** across 1 file\n\n- P2: Consider simplifying the API",
		"cubic-dev-ai[bot]",
	);
	assert.equal(c.phase, "review");
	assert.equal(c.priority, "P2");
});

test("review-bot 'no issues found' → review P2 (read the digest)", () => {
	const c = classifyComment("**No issues found** across 1 file", "cubic-dev-ai[bot]");
	assert.equal(c.phase, "review");
});

// =============================================================================
// Edge cases
// =============================================================================

test("empty comment → review (needs human)", () => {
	const c = classifyComment("", "alice");
	assert.equal(c.phase, "review");
	assert.equal(c.priority, "P2");
});

test("comment that mentions 'fix' but isn't about a bug → implementation phase", () => {
	const c = classifyComment("Please fix the documentation typo.", "alice");
	// "fix" alone isn't a bug — the classifier should fall through to
	// implementation phase for a doc fix. P2.
	assert.equal(c.phase, "implement");
	assert.equal(c.priority, "P2");
});

test("comment with mixed keywords: bug + style → bug wins (P0)", () => {
	const c = classifyComment(
		"There's a race condition here, also a typo in the comment.",
		"alice",
	);
	// Both keywords match, but the bug check runs first.
	assert.equal(c.phase, "implement");
	assert.equal(c.priority, "P0");
});