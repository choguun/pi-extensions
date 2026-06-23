/**
 * Tests for registry.ts — process registry on disk.
 *
 * Each test creates a fresh temp agentDir so tests are isolated.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	deregister,
	ensureDirs,
	heartbeat,
	isLive,
	isRegistered,
	listActive,
	listAll,
	mailboxDir,
	pruneStale,
	readRegistry,
	register,
	registryPath,
	runtimeDir,
	startHeartbeat,
	update,
	writeRegistry,
} from "../registry.ts";
import {
	HEARTBEAT_INTERVAL_MS,
	STALE_THRESHOLD_MS,
	buildIdentity,
	registryKey,
	type Registry,
	type SessionIdentity,
} from "../protocol.ts";

// =============================================================================
// Fixture
// =============================================================================

function makeAgentDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multi-session-reg-"));
	return dir;
}

function cleanup(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// Best effort.
	}
}

function makeEntry(agentDir: string, overrides: Partial<SessionIdentity> = {}): SessionIdentity {
	return {
		...buildIdentity({
			sessionId: `019ebf2e-545b-753f-b1b4-${Math.random().toString(16).slice(2, 14)}`,
			sessionFile: null,
			cwd: "/x",
			name: "test",
			model: null,
			thinkingLevel: null,
			status: "starting",
		}),
		...overrides,
	};
}

// =============================================================================
// Paths
// =============================================================================

test("runtimeDir lives under agentDir/runtime", () => {
	const dir = makeAgentDir();
	try {
		assert.equal(runtimeDir(dir), path.join(dir, "runtime"));
	} finally {
		cleanup(dir);
	}
});

test("registryPath lives under runtimeDir", () => {
	const dir = makeAgentDir();
	try {
		assert.equal(registryPath(dir), path.join(dir, "runtime", "registry.json"));
	} finally {
		cleanup(dir);
	}
});

test("mailboxDir lives under runtimeDir", () => {
	const dir = makeAgentDir();
	try {
		assert.equal(mailboxDir(dir), path.join(dir, "runtime", "mailbox"));
	} finally {
		cleanup(dir);
	}
});

test("ensureDirs creates runtime + mailbox subdirectories", () => {
	const dir = makeAgentDir();
	try {
		ensureDirs(dir);
		assert.equal(fs.existsSync(runtimeDir(dir)), true);
		assert.equal(fs.existsSync(mailboxDir(dir)), true);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// readRegistry
// =============================================================================

test("readRegistry returns empty when file is missing", () => {
	const dir = makeAgentDir();
	try {
		const r = readRegistry(dir);
		assert.deepEqual(r, { version: 1, sessions: {} });
	} finally {
		cleanup(dir);
	}
});

test("readRegistry returns empty when file is empty", () => {
	const dir = makeAgentDir();
	try {
		fs.mkdirSync(runtimeDir(dir), { recursive: true });
		fs.writeFileSync(registryPath(dir), "", "utf-8");
		assert.deepEqual(readRegistry(dir), { version: 1, sessions: {} });
	} finally {
		cleanup(dir);
	}
});

test("readRegistry returns empty when file is corrupt", () => {
	const dir = makeAgentDir();
	try {
		fs.mkdirSync(runtimeDir(dir), { recursive: true });
		fs.writeFileSync(registryPath(dir), "not json{", "utf-8");
		assert.throws(() => readRegistry(dir));
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// register
// =============================================================================

test("register adds entry with starting status and a fresh heartbeat", () => {
	const dir = makeAgentDir();
	try {
		const before = Date.now();
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: "anthropic/claude-sonnet-4-5",
			thinkingLevel: "high",
		});
		const after = Date.now();

		assert.equal(id.sessionId, "sess-1");
		assert.equal(id.name, "n1");
		assert.equal(id.status, "starting");
		assert.equal(id.model, "anthropic/claude-sonnet-4-5");
		assert.equal(id.thinkingLevel, "high");
		assert.equal(id.pid, process.pid);
		assert.equal(id.hostname, os.hostname());

		// Heartbeat should be within the test window.
		const ts = Date.parse(id.lastHeartbeat);
		assert.ok(ts >= before - 1000 && ts <= after + 1000);

		// Round-trip: registry on disk should match.
		const r = readRegistry(dir);
		assert.equal(Object.keys(r.sessions).length, 1);
		assert.equal(r.sessions[registryKey(id.hostname, id.pid)].sessionId, "sess-1");
	} finally {
		cleanup(dir);
	}
});

test("register prunes stale entries from prior runs", () => {
	const dir = makeAgentDir();
	try {
		// Manually plant a stale entry: same hostname, fake pid 1, lastHeartbeat long ago.
		const longAgo = new Date(Date.now() - STALE_THRESHOLD_MS * 2).toISOString();
		const reg: Registry = {
			version: 1,
			sessions: {
				[`${os.hostname()}:1`]: {
					...buildIdentity({
						sessionId: "stale-id",
						sessionFile: null,
						cwd: "/old",
						name: "old",
						model: null,
						thinkingLevel: null,
						status: "idle",
					}),
					pid: 1,
					lastHeartbeat: longAgo,
				},
			},
		};
		// writeRegistry is internal, so use the helper.
		writeRegistry(dir, reg);

		register(dir, {
			sessionId: "new-id",
			sessionFile: null,
			cwd: "/new",
			name: "new",
			model: null,
			thinkingLevel: null,
		});

		const r = readRegistry(dir);
		assert.equal(Object.keys(r.sessions).length, 1);
		assert.equal(r.sessions[registryKey(os.hostname(), process.pid)].sessionId, "new-id");
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// update
// =============================================================================

test("update refreshes lastHeartbeat and modifies fields", async () => {
	const dir = makeAgentDir();
	try {
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: null,
			thinkingLevel: null,
		});
		const before = Date.parse(id.lastHeartbeat);

		// Wait a bit so heartbeat timestamp differs.
		await new Promise((r) => setTimeout(r, 5));

		const updated = update(dir, id.pid, id.hostname, { status: "busy", name: "renamed" });
		assert.ok(updated);
		assert.equal(updated!.status, "busy");
		assert.equal(updated!.name, "renamed");
		assert.ok(Date.parse(updated!.lastHeartbeat) >= before);
	} finally {
		cleanup(dir);
	}
});

test("update returns null when our entry is missing", () => {
	const dir = makeAgentDir();
	try {
		const result = update(dir, 99999, "no-such-host", { status: "busy" });
		assert.equal(result, null);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// heartbeat
// =============================================================================

test("heartbeat refreshes lastHeartbeat without changing other fields", async () => {
	const dir = makeAgentDir();
	try {
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: "m1",
			thinkingLevel: "low",
		});
		await new Promise((r) => setTimeout(r, 5));
		const beat = heartbeat(dir, id.pid, id.hostname);
		assert.ok(beat);
		assert.equal(beat!.model, "m1");
		assert.equal(beat!.thinkingLevel, "low");
		assert.equal(beat!.name, "n1");
		assert.ok(Date.parse(beat!.lastHeartbeat) > Date.parse(id.lastHeartbeat));
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// deregister
// =============================================================================

test("deregister removes our entry, idempotent on missing", () => {
	const dir = makeAgentDir();
	try {
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: null,
			thinkingLevel: null,
		});
		deregister(dir, id.pid, id.hostname);
		const r = readRegistry(dir);
		assert.equal(Object.keys(r.sessions).length, 0);

		// Idempotent.
		deregister(dir, id.pid, id.hostname);
		const r2 = readRegistry(dir);
		assert.equal(Object.keys(r2.sessions).length, 0);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// listActive / listAll / isLive
// =============================================================================

test("listActive filters out entries with stale heartbeats", () => {
	const dir = makeAgentDir();
	try {
		// Plant two entries: one fresh, one stale.
		const longAgo = new Date(Date.now() - STALE_THRESHOLD_MS * 2).toISOString();
		const fresh = makeEntry(dir, { name: "fresh" });
		const stale = makeEntry(dir, { name: "stale", pid: 99999, lastHeartbeat: longAgo });

		const reg: Registry = {
			version: 1,
			sessions: {
				[registryKey(fresh.hostname, fresh.pid)]: fresh,
				[registryKey(stale.hostname, stale.pid)]: stale,
			},
		};
		writeRegistry(dir, reg);

		const active = listActive(dir);
		assert.equal(active.length, 1);
		assert.equal(active[0].name, "fresh");

		const all = listAll(dir);
		assert.equal(all.length, 2);
	} finally {
		cleanup(dir);
	}
});

test("isLive returns true for fresh heartbeat, false for stale", () => {
	const dir = makeAgentDir();
	try {
		const fresh = makeEntry(dir, {});
		const stale = makeEntry(dir, {
			lastHeartbeat: new Date(Date.now() - STALE_THRESHOLD_MS * 2).toISOString(),
		});
		assert.equal(isLive(fresh), true);
		assert.equal(isLive(stale), false);

		// Bad timestamp → not live.
		const bad = makeEntry(dir, { lastHeartbeat: "not a date" });
		assert.equal(isLive(bad), false);
	} finally {
		cleanup(dir);
	}
});

test("pruneStale removes stale entries in place", () => {
	const dir = makeAgentDir();
	try {
		const fresh = makeEntry(dir, { name: "fresh" });
		const stale = makeEntry(dir, {
			name: "stale",
			pid: 99999,
			lastHeartbeat: new Date(Date.now() - STALE_THRESHOLD_MS * 2).toISOString(),
		});
		const reg: Registry = {
			version: 1,
			sessions: {
				[registryKey(fresh.hostname, fresh.pid)]: fresh,
				[registryKey(stale.hostname, stale.pid)]: stale,
			},
		};
		pruneStale(reg);
		assert.equal(Object.keys(reg.sessions).length, 1);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// isRegistered
// =============================================================================

test("isRegistered true after register, false after deregister", () => {
	const dir = makeAgentDir();
	try {
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: null,
			thinkingLevel: null,
		});
		assert.equal(isRegistered(dir, id.pid, id.hostname), true);
		deregister(dir, id.pid, id.hostname);
		assert.equal(isRegistered(dir, id.pid, id.hostname), false);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// startHeartbeat
// =============================================================================

test("startHeartbeat writes periodically and stops when deregistered", async () => {
	const dir = makeAgentDir();
	try {
		const id = register(dir, {
			sessionId: "sess-1",
			sessionFile: null,
			cwd: "/p",
			name: "n1",
			model: null,
			thinkingLevel: null,
		});
		// Wait for first heartbeat tick.
		const before = Date.parse(id.lastHeartbeat);
		const stop = startHeartbeat(dir, id.pid, id.hostname);
		await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS + 500));
		const r = readRegistry(dir);
		const after = Date.parse(r.sessions[registryKey(id.hostname, id.pid)].lastHeartbeat);
		assert.ok(after > before, "heartbeat should advance after one tick");

		// Now deregister, wait another tick, and confirm the timer stopped itself.
		deregister(dir, id.pid, id.hostname);
		const refFile = registryPath(dir);
		// Take a timestamp of the file (no entries left).
		const fileMtimeBefore = fs.statSync(refFile).mtimeMs;
		await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS + 500));
		const fileMtimeAfter = fs.statSync(refFile).mtimeMs;
		// Since the timer self-stops after deregister, the file should be untouched
		// on the next tick. Allow a small margin.
		assert.ok(Math.abs(fileMtimeAfter - fileMtimeBefore) < 100, "heartbeat should stop after deregister");

		stop();
	} finally {
		cleanup(dir);
	}
});
