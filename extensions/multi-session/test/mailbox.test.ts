/**
 * Tests for mailbox.ts — per-session message log on disk.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appendMessage, deleteMailbox, mailboxPath, markMessage, pollMailbox, readMessages } from "../mailbox.ts";
import { MESSAGE_DEFAULT_TTL_MS, type MailboxMessage, type MessageFrom } from "../protocol.ts";

// =============================================================================
// Fixture
// =============================================================================

function makeAgentDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "multi-session-mailbox-"));
}

function cleanup(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// Best effort.
	}
}

const FROM_A: MessageFrom = { sessionId: "aaaa", name: "alice", pid: 1000 };

// =============================================================================
// mailboxPath
// =============================================================================

test("mailboxPath lives under mailbox dir, named after sessionId", () => {
	const dir = makeAgentDir();
	try {
		assert.equal(mailboxPath(dir, "abc"), path.join(dir, "runtime", "mailbox", "abc.jsonl"));
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// appendMessage
// =============================================================================

test("appendMessage creates file and writes one JSONL line", () => {
	const dir = makeAgentDir();
	try {
		const msg = appendMessage(dir, "sess-A", FROM_A, "task", { text: "hello" });
		assert.equal(msg.from.sessionId, "aaaa");
		assert.equal(msg.type, "task");
		assert.equal(msg.to, "sess-A");
		assert.equal(msg.payload.text, "hello");
		assert.equal(msg.status, "pending");
		assert.match(msg.id, /^[0-9a-f-]{36}$/);

		const raw = fs.readFileSync(mailboxPath(dir, "sess-A"), "utf-8");
		const lines = raw.split("\n").filter((l) => l.trim());
		assert.equal(lines.length, 1);
		const parsed = JSON.parse(lines[0]) as MailboxMessage;
		assert.equal(parsed.id, msg.id);
	} finally {
		cleanup(dir);
	}
});

test("appendMessage supports replyTo and ttlMs", () => {
	const dir = makeAgentDir();
	try {
		const msg = appendMessage(dir, "sess-A", FROM_A, "reply", { text: "ack" }, { replyTo: "msg-1", ttlMs: 5000 });
		assert.equal(msg.replyTo, "msg-1");
		assert.equal(msg.ttlMs, 5000);
	} finally {
		cleanup(dir);
	}
});

test("appendMessage appends, doesn't overwrite", () => {
	const dir = makeAgentDir();
	try {
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "1" });
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "2" });
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "3" });
		const all = readMessages(dir, "sess-A");
		assert.deepEqual(all.map((m) => m.payload.text), ["1", "2", "3"]);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// readMessages
// =============================================================================

test("readMessages returns empty list for missing mailbox", () => {
	const dir = makeAgentDir();
	try {
		assert.deepEqual(readMessages(dir, "no-such-session"), []);
	} finally {
		cleanup(dir);
	}
});

test("readMessages skips malformed lines", () => {
	const dir = makeAgentDir();
	try {
		fs.mkdirSync(path.join(dir, "runtime", "mailbox"), { recursive: true });
		const p = mailboxPath(dir, "sess-A");
		fs.writeFileSync(
			p,
			[
				JSON.stringify({ id: "ok", type: "task", from: FROM_A, to: "sess-A", payload: { text: "ok" }, timestamp: new Date().toISOString(), status: "pending" }),
				"not json{",
				"",
				JSON.stringify({ id: "ok2", type: "task", from: FROM_A, to: "sess-A", payload: { text: "ok2" }, timestamp: new Date().toISOString(), status: "pending" }),
			].join("\n") + "\n",
			"utf-8",
		);
		const all = readMessages(dir, "sess-A");
		assert.equal(all.length, 2);
		assert.deepEqual(all.map((m) => m.id), ["ok", "ok2"]);
	} finally {
		cleanup(dir);
	}
});

test("readMessages filters out expired messages by default TTL", () => {
	const dir = makeAgentDir();
	try {
		const old = new Date(Date.now() - MESSAGE_DEFAULT_TTL_MS - 1000).toISOString();
		const recent = new Date().toISOString();
		fs.mkdirSync(path.join(dir, "runtime", "mailbox"), { recursive: true });
		const p = mailboxPath(dir, "sess-A");
		fs.writeFileSync(
			p,
			[
				JSON.stringify({ id: "old", type: "task", from: FROM_A, to: "sess-A", payload: { text: "old" }, timestamp: old, status: "pending" }),
				JSON.stringify({ id: "new", type: "task", from: FROM_A, to: "sess-A", payload: { text: "new" }, timestamp: recent, status: "pending" }),
			].join("\n") + "\n",
			"utf-8",
		);
		const all = readMessages(dir, "sess-A");
		assert.equal(all.length, 1);
		assert.equal(all[0].id, "new");
	} finally {
		cleanup(dir);
	}
});

test("readMessages filters by per-message ttlMs", () => {
	const dir = makeAgentDir();
	try {
		const ts = new Date(Date.now() - 10_000).toISOString();
		fs.mkdirSync(path.join(dir, "runtime", "mailbox"), { recursive: true });
		const p = mailboxPath(dir, "sess-A");
		fs.writeFileSync(
			p,
			JSON.stringify({ id: "short-ttl", type: "task", from: FROM_A, to: "sess-A", payload: { text: "x" }, timestamp: ts, ttlMs: 1000, status: "pending" }) + "\n",
			"utf-8",
		);
		const all = readMessages(dir, "sess-A");
		assert.equal(all.length, 0);
	} finally {
		cleanup(dir);
	}
});

test("readMessages skips processed unless includeProcessed is true", () => {
	const dir = makeAgentDir();
	try {
		fs.mkdirSync(path.join(dir, "runtime", "mailbox"), { recursive: true });
		const p = mailboxPath(dir, "sess-A");
		const ts = new Date().toISOString();
		fs.writeFileSync(
			p,
			[
				JSON.stringify({ id: "pending", type: "task", from: FROM_A, to: "sess-A", payload: { text: "p" }, timestamp: ts, status: "pending" }),
				JSON.stringify({ id: "done", type: "task", from: FROM_A, to: "sess-A", payload: { text: "d" }, timestamp: ts, status: "processed" }),
			].join("\n") + "\n",
			"utf-8",
		);
		const all = readMessages(dir, "sess-A");
		assert.equal(all.length, 1);
		assert.equal(all[0].id, "pending");

		const all2 = readMessages(dir, "sess-A", { includeProcessed: true });
		assert.equal(all2.length, 2);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// markMessage
// =============================================================================

test("markMessage updates status, leaves other lines alone", () => {
	const dir = makeAgentDir();
	try {
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "1" });
		const m2 = appendMessage(dir, "sess-A", FROM_A, "task", { text: "2" });
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "3" });

		markMessage(dir, "sess-A", m2.id, { status: "processed" });

		const all = readMessages(dir, "sess-A", { includeProcessed: true });
		assert.equal(all.length, 3);
		const target = all.find((m) => m.id === m2.id);
		assert.equal(target?.status, "processed");
		// Others stay pending.
		assert.equal(all.find((m) => m.payload.text === "1")?.status, "pending");
		assert.equal(all.find((m) => m.payload.text === "3")?.status, "pending");
	} finally {
		cleanup(dir);
	}
});

test("markMessage with error records the error string", () => {
	const dir = makeAgentDir();
	try {
		const m = appendMessage(dir, "sess-A", FROM_A, "task", { text: "x" });
		markMessage(dir, "sess-A", m.id, { status: "failed", error: "boom" });
		const all = readMessages(dir, "sess-A", { includeProcessed: true });
		const target = all.find((mm) => mm.id === m.id);
		assert.equal(target?.status, "failed");
		assert.equal(target?.error, "boom");
	} finally {
		cleanup(dir);
	}
});

test("markMessage is a no-op for unknown id", () => {
	const dir = makeAgentDir();
	try {
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "1" });
		const before = fs.readFileSync(mailboxPath(dir, "sess-A"), "utf-8");
		markMessage(dir, "sess-A", "no-such-id", { status: "processed" });
		const after = fs.readFileSync(mailboxPath(dir, "sess-A"), "utf-8");
		assert.equal(after, before);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// pollMailbox
// =============================================================================

test("pollMailbox returns new messages and tracks seen ids", () => {
	const dir = makeAgentDir();
	try {
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "1" });
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "2" });
		const seen = new Set<string>();
		const fresh1 = pollMailbox(dir, "sess-A", seen);
		assert.equal(fresh1.length, 2);
		assert.equal(seen.size, 2);

		// Second poll returns nothing — already seen.
		const fresh2 = pollMailbox(dir, "sess-A", seen);
		assert.equal(fresh2.length, 0);

		// New message → picked up.
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "3" });
		const fresh3 = pollMailbox(dir, "sess-A", seen);
		assert.equal(fresh3.length, 1);
		assert.equal(fresh3[0].payload.text, "3");
	} finally {
		cleanup(dir);
	}
});

test("pollMailbox skips processed messages", () => {
	const dir = makeAgentDir();
	try {
		const m = appendMessage(dir, "sess-A", FROM_A, "task", { text: "1" });
		markMessage(dir, "sess-A", m.id, { status: "processed" });
		const seen = new Set<string>();
		const fresh = pollMailbox(dir, "sess-A", seen);
		assert.equal(fresh.length, 0);
	} finally {
		cleanup(dir);
	}
});

// =============================================================================
// deleteMailbox
// =============================================================================

test("deleteMailbox removes the file, no error when missing", () => {
	const dir = makeAgentDir();
	try {
		appendMessage(dir, "sess-A", FROM_A, "task", { text: "x" });
		assert.equal(fs.existsSync(mailboxPath(dir, "sess-A")), true);
		deleteMailbox(dir, "sess-A");
		assert.equal(fs.existsSync(mailboxPath(dir, "sess-A")), false);
		// Idempotent.
		deleteMailbox(dir, "sess-A");
	} finally {
		cleanup(dir);
	}
});
