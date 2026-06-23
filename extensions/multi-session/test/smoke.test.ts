/**
 * Smoke test for the multi-session extension.
 *
 * Verifies:
 *   1. Extension loads and registers a tool + commands.
 *   2. session_start writes a registry entry.
 *   3. session_shutdown removes the entry.
 *   4. Outgoing messages are delivered to a recipient's mailbox and
 *      picked up by the recipient's inbox watcher.
 *
 * Uses a temp agentDir (PI_CODING_AGENT_DIR) and a mocked ExtensionAPI.
 * Sets PI_MULTI_SESSION_POLL_MS=100 so the watcher is fast.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// Set env vars BEFORE importing the extension. These take effect when
// `getAgentDir()` and `readPollIntervalMs()` run.
const AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "multi-session-smoke-"));
process.env.PI_CODING_AGENT_DIR = AGENT_DIR;
process.env.PI_MULTI_SESSION_POLL_MS = "100";

import { appendMessage, readMessages } from "../mailbox.ts";
import { isRegistered, readRegistry } from "../registry.ts";
import { registryKey } from "../protocol.ts";

// =============================================================================
// Mock ExtensionAPI
// =============================================================================

interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	promptSnippet?: string;
	promptGuidelines?: string[];
	execute: (id: string, params: any) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; details?: any }>;
}

interface RegisteredCommand {
	name: string;
	description: string;
	handler: (args: string, ctx: any) => Promise<void> | void;
}

class MockExtensionAPI {
	readonly tools = new Map<string, RegisteredTool>();
	readonly commands = new Map<string, RegisteredCommand>();
	readonly eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<void> | void>>();
	readonly sentUserMessages: Array<{ text: string; options?: any }> = [];
	readonly sentCustomMessages: Array<{ type: string; content: string }> = [];
	readonly uiNotifications: Array<{ level: string; message: string }> = [];

	// Session manager mock — initialized in the constructor.
	sessionId = "";
	sessionFile: string | null = null;
	sessionName = "";
	cwd = "/Users/test/proj";
	model: { provider: string; id: string } | null = { provider: "anthropic", id: "claude-sonnet-4-5" };
	thinkingLevel: string = "medium";

	sessionManager = {
		getSessionId: () => this.sessionId,
		getSessionFile: () => this.sessionFile,
		getSessionName: () => this.sessionName,
	};

	ui = {
		notify: (message: string, level: string) => {
			this.uiNotifications.push({ level, message });
		},
		select: async (title: string, options: string[]) => {
			// First option for determinism.
			return options[0];
		},
		setEditorText: (_text: string) => {
			// No-op for the test.
		},
	};

	ctx = {
		ui: this.ui,
		hasUI: true,
		cwd: "/Users/test/proj",
		model: this.model,
		sessionManager: this.sessionManager,
	};

	on(event: string, handler: (event: any, ctx: any) => Promise<void> | void): void {
		const list = this.eventHandlers.get(event) ?? [];
		list.push(handler);
		this.eventHandlers.set(event, list);
	}

	async emit(event: string, payload: any = {}): Promise<void> {
		const list = this.eventHandlers.get(event) ?? [];
		for (const h of list) await h(payload, this.ctx);
	}

	registerTool(tool: RegisteredTool): void {
		this.tools.set(tool.name, tool);
	}

	registerCommand(name: string, command: { description: string; handler: RegisteredCommand["handler"] }): void {
		this.commands.set(name, {
			name,
			description: command.description,
			handler: command.handler,
		});
	}

	sendUserMessage(text: string, options?: any): void {
		this.sentUserMessages.push({ text, options });
	}

	sendMessage(message: { customType: string; content: string; display: boolean }): void {
		this.sentCustomMessages.push({ type: message.customType, content: message.content });
	}

	getThinkingLevel(): string {
		return this.thinkingLevel;
	}
}

// =============================================================================
// Helpers
// =============================================================================

function cleanup(): void {
	try {
		fs.rmSync(AGENT_DIR, { recursive: true, force: true });
	} catch {
		// Best effort.
	}
}

function loadExtension(): Promise<(pi: MockExtensionAPI) => void> {
	return import(pathToFileURL(path.resolve("index.ts")).href).then((m) => m.default as any);
}

// =============================================================================
// Lifecycle
// =============================================================================

test("extension loads and registers tools + commands", async () => {
	const api = new MockExtensionAPI();
	const ext = await loadExtension();
	ext(api);

	assert.ok(api.tools.has("pi_sessions"), "registers pi_sessions");
	assert.ok(api.tools.has("pi_send"), "registers pi_send");
	assert.ok(api.tools.has("pi_who"), "registers pi_who");
	assert.ok(api.commands.has("who"), "registers /who");
	assert.ok(api.commands.has("sessions"), "registers /sessions");
	assert.ok(api.commands.has("send"), "registers /send");
	assert.ok(api.eventHandlers.has("session_start"), "subscribes to session_start");
	assert.ok(api.eventHandlers.has("session_shutdown"), "subscribes to session_shutdown");
});

test("session_start registers entry; session_shutdown removes it", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-session-1";
	api.sessionFile = "/tmp/smoke-session-1.jsonl";
	api.sessionName = "smoke";
	api.cwd = "/Users/test/proj";

	const ext = await loadExtension();
	ext(api);

	await api.emit("session_start", { reason: "startup" });

	// Registry should have our entry.
	assert.equal(isRegistered(AGENT_DIR, process.pid, os.hostname()), true);
	const r = readRegistry(AGENT_DIR);
	const me = r.sessions[registryKey(os.hostname(), process.pid)];
	assert.ok(me);
	assert.equal(me.sessionId, "smoke-session-1");
	assert.equal(me.name, "smoke");
	assert.equal(me.cwd, "/Users/test/proj");
	assert.equal(me.status, "starting");
	assert.equal(me.model, "anthropic/claude-sonnet-4-5");
	assert.equal(me.thinkingLevel, "medium");

	// Shutdown.
	await api.emit("session_shutdown", { reason: "quit" });
	assert.equal(isRegistered(AGENT_DIR, process.pid, os.hostname()), false);
});

test("agent_start flips status to busy; agent_end flips back to idle", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-busy";
	const ext = await loadExtension();
	ext(api);

	await api.emit("session_start", {});
	await api.emit("agent_start", {});
	let r = readRegistry(AGENT_DIR);
	let me = r.sessions[registryKey(os.hostname(), process.pid)];
	assert.equal(me.status, "busy");

	await api.emit("agent_end", {});
	r = readRegistry(AGENT_DIR);
	me = r.sessions[registryKey(os.hostname(), process.pid)];
	assert.equal(me.status, "idle");
});

// =============================================================================
// Outgoing messages: pi_send tool
// =============================================================================

test("pi_send writes a message to the recipient's mailbox", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-sender";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	// Pre-register a recipient with a DIFFERENT pid so the self-send check
	// doesn't trip. We can't use `register` directly (it uses process.pid),
	// so we write a registry entry with a fake pid.
	const { buildIdentity } = await import("../protocol.ts");
	const { writeRegistry } = await import("../registry.ts");
	const reg = readRegistry(AGENT_DIR);
	reg.sessions[`${os.hostname()}:99001`] = {
		...buildIdentity({
			sessionId: "smoke-recipient",
			sessionFile: null,
			cwd: "/Users/test/other",
			name: "other-session",
			model: "anthropic/claude-sonnet-4-5",
			thinkingLevel: "low",
			status: "idle",
		}),
		pid: 99001,
	};
	writeRegistry(AGENT_DIR, reg);

	const tool = api.tools.get("pi_send")!;
	const result = await tool.execute("call-1", { to: "smoke-recipient", type: "task", message: "do the thing" });

	assert.notEqual(result.isError, true, JSON.stringify(result));
	assert.match(result.content[0].text, /Sent task/);

	// Mailbox should have one message.
	const mailbox = readMessages(AGENT_DIR, "smoke-recipient", { includeProcessed: true });
	assert.equal(mailbox.length, 1);
	assert.equal(mailbox[0].type, "task");
	assert.equal(mailbox[0].payload.text, "do the thing");
	assert.equal(mailbox[0].from.sessionId, "smoke-sender");
});

test("pi_send returns error for unknown recipient", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-sender2";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	const tool = api.tools.get("pi_send")!;
	const result = await tool.execute("call-1", { to: "no-such-session", type: "task", message: "x" });
	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /no live session matches/);
});

test("pi_send rejects self-send", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-self";
	api.sessionName = "self";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	const tool = api.tools.get("pi_send")!;
	const result = await tool.execute("call-1", { to: "self", type: "task", message: "x" });
	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /cannot send a message to your own session/);
});

// =============================================================================
// Inbox: incoming messages get injected
// =============================================================================

test("incoming message is injected via sendUserMessage", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-incoming";
	api.sessionName = "incoming";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	// Send a message from a "fake" sender.
	appendMessage(AGENT_DIR, "smoke-incoming", {
		sessionId: "smoke-fake-sender",
		name: "fake-sender",
		pid: 1234,
	}, "task", { text: "please run the tests" });

	// Wait for the watcher (poll = 100ms in this test).
	await new Promise((r) => setTimeout(r, 300));

	// The message should have been injected as a user message.
	assert.ok(api.sentUserMessages.length >= 1, "expected at least one sendUserMessage call");
	const injected = api.sentUserMessages.find((m) => m.text.includes("please run the tests"));
	assert.ok(injected, "expected the message text in a sendUserMessage call");
	assert.match(injected!.text, /fake-sender/);
	// sessionId is rendered as its first 8 chars via shortSessionId.
	assert.match(injected!.text, /smoke-fa/);

	// The message should be marked processed.
	const mailbox = readMessages(AGENT_DIR, "smoke-incoming", { includeProcessed: true });
	const processed = mailbox.filter((m) => m.status === "processed");
	assert.equal(processed.length, 1);
});

test("incoming notify message appears as a custom message, not a user message", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-notify";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	appendMessage(AGENT_DIR, "smoke-notify", {
		sessionId: "smoke-notifier",
		name: "notifier",
		pid: 5555,
	}, "notify", { text: "FYI only" });

	await new Promise((r) => setTimeout(r, 300));

	const custom = api.sentCustomMessages.find((m) => m.content.includes("FYI only"));
	assert.ok(custom, "expected the notify in a custom message");
	// And NOT in sentUserMessages.
	const injected = api.sentUserMessages.find((m) => m.text.includes("FYI only"));
	assert.equal(injected, undefined);
});

// =============================================================================
// pi_who
// =============================================================================

test("pi_who returns this session's identity", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-who";
	api.sessionName = "who-test";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	const tool = api.tools.get("pi_who")!;
	const result = await tool.execute("call-1", {});
	assert.match(result.content[0].text, /smoke-who/);
	assert.match(result.content[0].text, /who-test/);
});

// =============================================================================
// pi_sessions
// =============================================================================

test("pi_sessions lists other live sessions", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-list";
	api.sessionName = "lister";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	// Plant a fake entry directly in the registry for another session.
	const { writeRegistry } = await import("../registry.ts");
	const fakePid = 99002;
	const { buildIdentity } = await import("../protocol.ts");
	const reg = readRegistry(AGENT_DIR);
	reg.sessions[registryKey(os.hostname(), fakePid)] = {
		...buildIdentity({
			sessionId: "smoke-fake-other",
			sessionFile: null,
			cwd: "/Users/test/elsewhere",
			name: "other",
			model: "anthropic/claude-sonnet-4-5",
			thinkingLevel: "off",
			status: "idle",
		}),
		pid: fakePid,
	};
	writeRegistry(AGENT_DIR, reg);

	const tool = api.tools.get("pi_sessions")!;
	const result = await tool.execute("call-1", { action: "list_active" });
	assert.match(result.content[0].text, /other/);
	// Self should NOT be listed.
	assert.doesNotMatch(result.content[0].text, /lister/);
});

// =============================================================================
// Slash commands
// =============================================================================

test("/who command shows identity", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-cmd-who";
	api.sessionName = "named-cmd";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	await api.commands.get("who")!.handler("", api.ctx);
	assert.ok(api.uiNotifications.some((n) => n.message.includes("named-cmd")));
});

test("/send command delivers a message", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-cmd-send";
	api.sessionName = "sender";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	// Plant a recipient.
	const { register: registryRegister } = await import("../registry.ts");
	registryRegister(AGENT_DIR, {
		sessionId: "smoke-cmd-recipient",
		sessionFile: null,
		cwd: "/x",
		name: "rcpt",
		model: null,
		thinkingLevel: null,
	});

	await api.commands.get("send")!.handler("smoke-cmd-recipient hello there", api.ctx);
	const mailbox = readMessages(AGENT_DIR, "smoke-cmd-recipient", { includeProcessed: true });
	assert.equal(mailbox.length, 1);
	assert.equal(mailbox[0].payload.text, "hello there");
});

test("/send command rejects ambiguous ref", async () => {
	const api = new MockExtensionAPI();
	api.sessionId = "smoke-cmd-amb";
	api.sessionName = "amb-sender";
	const ext = await loadExtension();
	ext(api);
	await api.emit("session_start", {});

	// Two recipients share a name "amb".
	const { register: registryRegister } = await import("../registry.ts");
	registryRegister(AGENT_DIR, {
		sessionId: "smoke-amb-1",
		sessionFile: null,
		cwd: "/x",
		name: "amb",
		model: null,
		thinkingLevel: null,
	});
	// Force a different pid by registering again (register overwrites same pid).
	// Use the protocol directly to plant a second entry.
	const { writeRegistry, readRegistry: rr } = await import("../registry.ts");
	const { registryKey: rk } = await import("../protocol.ts");
	const fakePid = process.pid + 1;
	const r = rr(AGENT_DIR);
	const existing = r.sessions[rk(os.hostname(), process.pid)];
	if (existing) {
		r.sessions[rk(os.hostname(), fakePid)] = { ...existing, sessionId: "smoke-amb-2", name: "amb", pid: fakePid };
		writeRegistry(AGENT_DIR, r);
	}

	api.uiNotifications.length = 0;
	await api.commands.get("send")!.handler("amb hello", api.ctx);
	const err = api.uiNotifications.find((n) => n.level === "error");
	assert.ok(err, "expected an error notification");
	assert.match(err!.message, /ambiguous/);
});

// =============================================================================
// Cleanup
// =============================================================================

test.after(() => {
	cleanup();
});
