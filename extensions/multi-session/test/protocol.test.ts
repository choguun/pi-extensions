/**
 * Tests for protocol.ts — pure functions, no filesystem.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
	HEARTBEAT_INTERVAL_MS,
	STALE_THRESHOLD_MS,
	buildIdentity,
	parseRegistryKey,
	registryKey,
	resolveSessionRef,
	shortSessionId,
	uuid,
	type Registry,
	type SessionIdentity,
} from "../protocol.ts";

// =============================================================================
// Fixtures
// =============================================================================

function makeEntry(overrides: Partial<SessionIdentity> = {}): SessionIdentity {
	return {
		sessionId: "019ebf2e-545b-753f-b1b4-18344f6641ec",
		sessionFile: "/tmp/sessions/a.jsonl",
		pid: 12345,
		hostname: "mbp-test",
		cwd: "/Users/test/proj",
		name: "refactor",
		model: "anthropic/claude-sonnet-4-5",
		thinkingLevel: "medium",
		status: "idle",
		startedAt: "2026-06-23T10:00:00.000Z",
		lastHeartbeat: "2026-06-23T10:00:00.000Z",
		...overrides,
	};
}

function makeRegistry(entries: SessionIdentity[]): Registry {
	const sessions: Record<string, SessionIdentity> = {};
	for (const e of entries) {
		sessions[registryKey(e.hostname, e.pid)] = e;
	}
	return { version: 1, sessions };
}

// =============================================================================
// buildIdentity
// =============================================================================

test("buildIdentity fills pid, hostname, startedAt, lastHeartbeat", () => {
	const id = buildIdentity({
		sessionId: "abc",
		sessionFile: null,
		cwd: "/x",
		name: "n",
		model: null,
		thinkingLevel: null,
		status: "starting",
	});
	assert.equal(id.sessionId, "abc");
	assert.equal(id.pid, process.pid);
	assert.equal(typeof id.hostname, "string");
	assert.equal(id.hostname.length > 0, true);
	assert.equal(id.startedAt, id.lastHeartbeat, "startedAt equals lastHeartbeat at creation");
	// Sanity check the ISO format.
	assert.equal(Number.isNaN(Date.parse(id.startedAt)), false);
});

// =============================================================================
// registryKey / parseRegistryKey
// =============================================================================

test("registryKey formats as hostname:pid", () => {
	assert.equal(registryKey("mbp", 1234), "mbp:1234");
});

test("parseRegistryKey round-trips with registryKey", () => {
	const k = registryKey("host.example.com", 99999);
	assert.deepEqual(parseRegistryKey(k), { hostname: "host.example.com", pid: 99999 });
});

test("parseRegistryKey throws on missing colon", () => {
	assert.throws(() => parseRegistryKey("nocolon"), /Invalid registry key/);
});

// =============================================================================
// shortSessionId
// =============================================================================

test("shortSessionId returns first 8 chars", () => {
	assert.equal(shortSessionId("019ebf2e-545b-753f-b1b4-18344f6641ec"), "019ebf2e");
	assert.equal(shortSessionId("abc"), "abc");
	assert.equal(shortSessionId(""), "");
});

// =============================================================================
// resolveSessionRef
// =============================================================================

test("resolveSessionRef: exact sessionId match", () => {
	const reg = makeRegistry([makeEntry({ sessionId: "019ebf2e-545b-753f-b1b4-18344f6641ec" })]);
	const r = resolveSessionRef(reg, "019ebf2e-545b-753f-b1b4-18344f6641ec");
	assert.ok(r && "match" in r);
	assert.equal(r!.match.sessionId, "019ebf2e-545b-753f-b1b4-18344f6641ec");
});

test("resolveSessionRef: prefix match (with hyphens)", () => {
	const reg = makeRegistry([makeEntry({ sessionId: "019ebf2e-545b-753f-b1b4-18344f6641ec" })]);
	const r = resolveSessionRef(reg, "019ebf2e");
	assert.ok(r && "match" in r);
});

test("resolveSessionRef: prefix match (without hyphens)", () => {
	const reg = makeRegistry([makeEntry({ sessionId: "019ebf2e-545b-753f-b1b4-18344f6641ec" })]);
	const r = resolveSessionRef(reg, "019ebf2e545b753f");
	assert.ok(r && "match" in r);
});

test("resolveSessionRef: exact name match", () => {
	const reg = makeRegistry([makeEntry({ name: "refactor" })]);
	const r = resolveSessionRef(reg, "refactor");
	assert.ok(r && "match" in r);
	assert.equal(r!.match.name, "refactor");
});

test("resolveSessionRef: case-insensitive name match", () => {
	const reg = makeRegistry([makeEntry({ name: "Refactor" })]);
	const r = resolveSessionRef(reg, "refactor");
	assert.ok(r && "match" in r);
});

test("resolveSessionRef: empty input returns null", () => {
	const reg = makeRegistry([makeEntry()]);
	assert.equal(resolveSessionRef(reg, ""), null);
	assert.equal(resolveSessionRef(reg, "   "), null);
});

test("resolveSessionRef: no match returns null", () => {
	const reg = makeRegistry([makeEntry()]);
	assert.equal(resolveSessionRef(reg, "zzz-no-such-id"), null);
});

test("resolveSessionRef: ambiguous prefix returns ambiguous result", () => {
	const reg = makeRegistry([
		makeEntry({ sessionId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", pid: 1 }),
		makeEntry({ sessionId: "aaaa2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb", pid: 2 }),
	]);
	const r = resolveSessionRef(reg, "aaaa");
	assert.ok(r && "ambiguous" in r && r.ambiguous);
	assert.equal(r!.candidates.length, 2);
});

test("resolveSessionRef: ambiguous name returns ambiguous result", () => {
	const reg = makeRegistry([
		makeEntry({ name: "shared", pid: 1 }),
		makeEntry({ name: "shared", pid: 2, sessionId: "bbbb" }),
	]);
	const r = resolveSessionRef(reg, "shared");
	assert.ok(r && "ambiguous" in r && r.ambiguous);
});

// =============================================================================
// uuid
// =============================================================================

test("uuid generates unique v4-looking strings", () => {
	const a = uuid();
	const b = uuid();
	assert.notEqual(a, b);
	// v4: 8-4-4-4-12 with version nibble = 4 and variant nibble in [89ab].
	assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// =============================================================================
// Constants
// =============================================================================

test("STALE_THRESHOLD_MS is larger than HEARTBEAT_INTERVAL_MS", () => {
	assert.ok(STALE_THRESHOLD_MS > HEARTBEAT_INTERVAL_MS);
});
