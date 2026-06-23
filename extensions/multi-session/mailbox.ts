/**
 * Per-session mailbox — JSONL append-only log of incoming messages.
 *
 * Stored at `${agentDir}/runtime/mailbox/<sessionId>.jsonl`. Each line is
 * a `MailboxMessage`. Appends are atomic on POSIX (writes < PIPE_BUF).
 *
 * The watcher polls (cheap, no fs.watch portability pain). Polling at
 * 2s is fine for human-paced collaboration.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	MESSAGE_DEFAULT_TTL_MS,
	type MailboxMessage,
	type MessagePayload,
	type MessageType,
	uuid,
} from "./protocol.ts";
import { mailboxDir, ensureDirs } from "./registry.ts";

// =============================================================================
// I/O
// =============================================================================

/** Absolute path to a session's mailbox file. */
export function mailboxPath(agentDir: string, sessionId: string): string {
	return path.join(mailboxDir(agentDir), `${sessionId}.jsonl`);
}

/**
 * Append a message to the recipient's mailbox. Creates the file and its
 * parent directories if missing. Writes one line of JSON + a newline.
 *
 * Returns the persisted message (with `id` and `timestamp` filled in).
 */
export function appendMessage(
	agentDir: string,
	to: string,
	from: MailboxMessage["from"],
	type: MessageType,
	payload: MessagePayload,
	options: { replyTo?: string; ttlMs?: number } = {},
): MailboxMessage {
	ensureDirs(agentDir);
	const message: MailboxMessage = {
		id: uuid(),
		type,
		from,
		to,
		payload,
		replyTo: options.replyTo,
		timestamp: new Date().toISOString(),
		ttlMs: options.ttlMs,
		status: "pending",
	};
	fs.appendFileSync(mailboxPath(agentDir, to), JSON.stringify(message) + "\n", "utf-8");
	return message;
}

/**
 * Read all messages in a mailbox. Filters out:
 *   - malformed lines (skip with no error)
 *   - messages older than `ttlMs` (default MESSAGE_DEFAULT_TTL_MS)
 *   - already-processed messages unless `includeProcessed` is true
 */
export function readMessages(
	agentDir: string,
	sessionId: string,
	options: { includeProcessed?: boolean; now?: number; ttlMs?: number } = {},
): MailboxMessage[] {
	const p = mailboxPath(agentDir, sessionId);
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}

	const now = options.now ?? Date.now();
	const ttl = options.ttlMs ?? MESSAGE_DEFAULT_TTL_MS;
	const messages: MailboxMessage[] = [];

	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: MailboxMessage;
		try {
			parsed = JSON.parse(trimmed) as MailboxMessage;
		} catch {
			continue;
		}

		// TTL: use the message's own ttlMs if set, otherwise the default.
		const msgTtl = parsed.ttlMs ?? ttl;
		const ts = Date.parse(parsed.timestamp);
		if (!Number.isNaN(ts) && now - ts > msgTtl) continue;

		// Status filter.
		if (!options.includeProcessed && parsed.status && parsed.status !== "pending") continue;

		messages.push(parsed);
	}

	return messages;
}

/** Mark a message as processed (or failed). Rewrites the file with the patch. */
export function markMessage(
	agentDir: string,
	sessionId: string,
	messageId: string,
	patch: { status: "processed" | "failed"; error?: string },
): void {
	const p = mailboxPath(agentDir, sessionId);
	let raw: string;
	try {
		raw = fs.readFileSync(p, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
		throw err;
	}

	const lines = raw.split("\n");
	const out: string[] = [];
	let changed = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			out.push(line);
			continue;
		}
		try {
			const parsed = JSON.parse(trimmed) as MailboxMessage;
			if (parsed.id === messageId) {
				parsed.status = patch.status;
				if (patch.error !== undefined) parsed.error = patch.error;
				out.push(JSON.stringify(parsed));
				changed = true;
			} else {
				out.push(line);
			}
		} catch {
			out.push(line);
		}
	}

	if (changed) {
		// Atomic write — `.tmp + rename`.
		const tmp = p + ".tmp." + process.pid;
		fs.writeFileSync(tmp, out.join("\n"), "utf-8");
		fs.renameSync(tmp, p);
	}
}

/** Delete the mailbox file for a session. Used in tests. */
export function deleteMailbox(agentDir: string, sessionId: string): void {
	try {
		fs.unlinkSync(mailboxPath(agentDir, sessionId));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

// =============================================================================
// Polling watcher
// =============================================================================

/**
 * Poll a mailbox for new pending messages. Returns the new messages
 * (those not in `seenIds`) and updates `seenIds` in place.
 *
 * `poll()` is synchronous and cheap; the extension calls it on a timer.
 */
export function pollMailbox(
	agentDir: string,
	sessionId: string,
	seenIds: Set<string>,
	options: { ttlMs?: number; now?: number } = {},
): MailboxMessage[] {
	const all = readMessages(agentDir, sessionId, { ttlMs: options.ttlMs, now: options.now });
	const fresh: MailboxMessage[] = [];
	for (const msg of all) {
		if (msg.status && msg.status !== "pending") continue;
		if (seenIds.has(msg.id)) continue;
		seenIds.add(msg.id);
		fresh.push(msg);
	}
	return fresh;
}
