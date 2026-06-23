/**
 * Process registry — shared file that tracks all live pi processes.
 *
 * Stored at `${agentDir}/runtime/registry.json`. One entry per pid. Each
 * process updates its own entry's `lastHeartbeat` on a timer, and removes
 * its entry on shutdown. Readers treat entries with stale heartbeats as
 * dead and either prune or surface as "stale".
 *
 * All writes go through `.tmp + rename` so a crash mid-write can't corrupt
 * the file. Reads tolerate a missing or empty file (returns empty registry).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	HEARTBEAT_INTERVAL_MS,
	STALE_THRESHOLD_MS,
	buildIdentity,
	type Registry,
	type SessionIdentity,
	type SessionStatus,
	registryKey,
} from "./protocol.ts";

// =============================================================================
// Layout
// =============================================================================

/** Returns the absolute path to the runtime directory. */
export function runtimeDir(agentDir: string): string {
	return path.join(agentDir, "runtime");
}

/** Returns the absolute path to the registry file. */
export function registryPath(agentDir: string): string {
	return path.join(runtimeDir(agentDir), "registry.json");
}

/** Returns the absolute path to the mailbox directory. */
export function mailboxDir(agentDir: string): string {
	return path.join(runtimeDir(agentDir), "mailbox");
}

// =============================================================================
// I/O
// =============================================================================

/** Ensure runtime + mailbox directories exist. Idempotent. */
export function ensureDirs(agentDir: string): void {
	fs.mkdirSync(runtimeDir(agentDir), { recursive: true });
	fs.mkdirSync(mailboxDir(agentDir), { recursive: true });
}

/** Read the registry. Returns an empty registry if the file is missing/empty. */
export function readRegistry(agentDir: string): Registry {
	const p = registryPath(agentDir);
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { version: 1, sessions: {} };
		}
		throw err;
	}
	if (!raw.trim()) return { version: 1, sessions: {} };

	const parsed = JSON.parse(raw) as Registry;
	// Defensive: ensure shape.
	if (!parsed || typeof parsed !== "object" || !parsed.sessions) {
		return { version: 1, sessions: {} };
	}
	return parsed;
}

/**
 * Atomic write — write to `.tmp` then rename. A crash mid-write leaves the
 * prior file intact. The tmp file may leak; that's harmless.
 */
export function writeRegistry(agentDir: string, registry: Registry): void {
	ensureDirs(agentDir);
	const target = registryPath(agentDir);
	const tmp = target + ".tmp." + process.pid;
	fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), "utf-8");
	fs.renameSync(tmp, target);
}

// =============================================================================
// Mutations
// =============================================================================

export interface RegisterInput {
	sessionId: string;
	sessionFile: string | null;
	cwd: string;
	name: string;
	model: string | null;
	thinkingLevel: string | null;
}

/**
 * Register or update this process's entry in the registry. Also prunes
 * stale entries from prior dead processes (defensive cleanup so the file
 * doesn't grow forever).
 */
export function register(agentDir: string, input: RegisterInput): SessionIdentity {
	ensureDirs(agentDir);
	const registry = readRegistry(agentDir);
	pruneStale(registry);

	const identity: SessionIdentity = {
		...buildIdentity({
			...input,
			status: "starting",
		}),
	};

	registry.sessions[registryKey(identity.hostname, identity.pid)] = identity;
	writeRegistry(agentDir, registry);
	return identity;
}

/**
 * Update an existing entry. Used by the heartbeat timer and by
 * model_select / agent_start / agent_end / thinking_level_select events.
 *
 * Returns the updated identity, or null if our entry is gone (which means
 * another process with the same pid reused it after we died — unlikely but
 * possible). Callers should treat null as "we are no longer registered".
 */
export function update(
	agentDir: string,
	pid: number,
	hostname: string,
	patch: Partial<Pick<SessionIdentity, "name" | "model" | "thinkingLevel" | "status" | "sessionFile">>,
): SessionIdentity | null {
	const registry = readRegistry(agentDir);
	const key = registryKey(hostname, pid);
	const existing = registry.sessions[key];
	if (!existing) return null;

	const updated: SessionIdentity = {
		...existing,
		...patch,
		lastHeartbeat: new Date().toISOString(),
	};
	registry.sessions[key] = updated;
	writeRegistry(agentDir, registry);
	return updated;
}

/** Touch the heartbeat without changing any other field. */
export function heartbeat(agentDir: string, pid: number, hostname: string): SessionIdentity | null {
	return update(agentDir, pid, hostname, {});
}

/** Remove our entry from the registry. Idempotent — no error if absent. */
export function deregister(agentDir: string, pid: number, hostname: string): void {
	const registry = readRegistry(agentDir);
	const key = registryKey(hostname, pid);
	if (!(key in registry.sessions)) return;
	delete registry.sessions[key];
	writeRegistry(agentDir, registry);
}

// =============================================================================
// Queries
// =============================================================================

/** All sessions whose heartbeat is fresh. Sorted by startedAt. */
export function listActive(agentDir: string, now: number = Date.now()): SessionIdentity[] {
	const registry = readRegistry(agentDir);
	return Object.values(registry.sessions)
		.filter((entry) => isLive(entry, now))
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** All sessions in the registry, including stale ones. Sorted by startedAt. */
export function listAll(agentDir: string): SessionIdentity[] {
	const registry = readRegistry(agentDir);
	return Object.values(registry.sessions).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Drop entries with stale heartbeats. Mutates the registry in place. */
export function pruneStale(registry: Registry, now: number = Date.now()): void {
	for (const [key, entry] of Object.entries(registry.sessions)) {
		if (!isLive(entry, now)) delete registry.sessions[key];
	}
}

/** True if the entry's lastHeartbeat is within STALE_THRESHOLD_MS of `now`. */
export function isLive(entry: SessionIdentity, now: number = Date.now()): boolean {
	const last = Date.parse(entry.lastHeartbeat);
	if (Number.isNaN(last)) return false;
	return now - last < STALE_THRESHOLD_MS;
}

/** True if our entry still exists in the registry. */
export function isRegistered(agentDir: string, pid: number, hostname: string): boolean {
	const registry = readRegistry(agentDir);
	return registryKey(hostname, pid) in registry.sessions;
}

// =============================================================================
// Heartbeat timer
// =============================================================================

/**
 * Start a heartbeat timer. Returns a `stop()` function. The timer writes
 * our entry's `lastHeartbeat` every HEARTBEAT_INTERVAL_MS. If the write
 * fails (e.g. our entry was pruned by a peer), the timer stops itself.
 */
export function startHeartbeat(agentDir: string, pid: number, hostname: string): () => void {
	const interval = setInterval(() => {
		try {
			const result = heartbeat(agentDir, pid, hostname);
			if (result === null) {
				// Our entry was pruned — stop the timer.
				clearInterval(interval);
			}
		} catch {
			// Disk error — keep trying; next tick may succeed.
		}
	}, HEARTBEAT_INTERVAL_MS);
	// Don't keep the process alive solely for the heartbeat.
	interval.unref?.();
	return () => clearInterval(interval);
}

// =============================================================================
// Display helpers
// =============================================================================

/** Status enum guard. Defends against bad registry contents. */
export function isStatus(value: unknown): value is SessionStatus {
	return value === "starting" || value === "idle" || value === "busy";
}
