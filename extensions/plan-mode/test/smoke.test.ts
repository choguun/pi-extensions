/**
 * Smoke tests for the plan-mode extension.
 *
 * Verifies the extension loads, registers flags/commands/tools, and
 * exercises the tool_call permission guard + plan_enter / plan_exit
 * flow. Uses a MockExtensionAPI — no real pi runtime needed.
 *
 * Run with:
 *   npm test
 *   node --test test/smoke.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// =============================================================================
// Mock ExtensionAPI
// =============================================================================

type ToolCallHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;
type SessionStartHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;
type BeforeAgentStartHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute: (...args: unknown[]) => Promise<unknown>;
}

interface RegisteredCommand {
	name: string;
	description: string;
	handler: (...args: unknown[]) => Promise<unknown> | unknown;
}

interface AppendedEntry {
	type: "custom";
	customType: string;
	data: unknown;
}

class MockExtensionAPI {
	readonly tools = new Map<string, RegisteredTool>();
	readonly commands = new Map<string, RegisteredCommand>();
	readonly flags = new Map<string, { description: string; type: "boolean" | "string"; default?: boolean | string }>();
	readonly flagValues = new Map<string, boolean | string>();
	readonly activeTools: string[] = [
		"read",
		"bash",
		"edit",
		"write",
		"grep",
		"find",
		"ls",
		"question",
		"subagent",
		"plan_enter",
		"plan_exit",
	];
	readonly sentMessages: string[] = [];
	readonly sentUserMessages: Array<{ content: string; options?: unknown }> = [];
	readonly appendedEntries: AppendedEntry[] = [];
	private readonly toolCallHandlers: ToolCallHandler[] = [];
	private readonly sessionStartHandlers: SessionStartHandler[] = [];
	private readonly beforeAgentStartHandlers: BeforeAgentStartHandler[] = [];

	setFlag(name: string, value: boolean | string): void {
		this.flagValues.set(name, value);
	}

	registerFlag(
		name: string,
		options: { description: string; type: "boolean" | "string"; default?: boolean | string },
	): void {
		this.flags.set(name, options);
		// Only set the default if the value isn't already set (e.g., by CLI
		// parsing in real pi, or by `setFlag` in tests). Mirrors the real
		// pi behavior where registerFlag declares a default but a CLI value
		// overrides it.
		if (options.default !== undefined && !this.flagValues.has(name)) {
			this.flagValues.set(name, options.default);
		}
	}

	getFlag(name: string): boolean | string | undefined {
		return this.flagValues.get(name);
	}

	registerTool(tool: RegisteredTool): void {
		this.tools.set(tool.name, tool);
	}

	registerCommand(name: string, command: { description: string; handler: RegisteredCommand["handler"] }): void {
		this.commands.set(name, { name, description: command.description, handler: command.handler });
	}

	getActiveTools(): string[] {
		return [...this.activeTools];
	}

	setActiveTools(toolNames: string[]): void {
		this.activeTools.length = 0;
		this.activeTools.push(...toolNames);
	}

	appendEntry(customType: string, data: unknown): void {
		this.appendedEntries.push({ type: "custom", customType, data });
	}

	sendMessage(message: { content: string }, _options?: unknown): void {
		this.sentMessages.push(message.content);
	}

	sendUserMessage(content: string, options?: { deliverAs?: string }): void {
		this.sentUserMessages.push({ content, options });
	}

	on(event: string, handler: ToolCallHandler | SessionStartHandler | BeforeAgentStartHandler): void {
		if (event === "tool_call") this.toolCallHandlers.push(handler as ToolCallHandler);
		else if (event === "session_start") this.sessionStartHandlers.push(handler as SessionStartHandler);
		else if (event === "before_agent_start") this.beforeAgentStartHandlers.push(handler as BeforeAgentStartHandler);
	}

	// Test helpers
	async emitToolCall(event: unknown, ctx: unknown): Promise<unknown> {
		let lastResult: unknown;
		for (const handler of this.toolCallHandlers) {
			const result = await handler(event, ctx);
			if (result) lastResult = result;
		}
		return lastResult;
	}

	async emitSessionStart(event: unknown, ctx: unknown): Promise<void> {
		for (const handler of this.sessionStartHandlers) {
			await handler(event, ctx);
		}
	}

	async emitBeforeAgentStart(event: unknown, ctx: unknown): Promise<unknown> {
		let lastResult: unknown;
		for (const handler of this.beforeAgentStartHandlers) {
			const result = await handler(event, ctx);
			if (result) lastResult = result;
		}
		return lastResult;
	}
}

interface MockUI {
	confirmResponses: boolean[];
	confirmCalls: Array<{ title: string; details?: string }>;
	notifyCalls: Array<{ message: string; level: string }>;
	statuses: Map<string, unknown>;
	theme: { fg: (color: string, text: string) => string };
	confirm(question: string, details?: string): Promise<boolean>;
	notify(message: string, level?: string): void;
	setStatus(key: string, value: string | undefined): void;
}

function makeUI(): MockUI {
	const confirmResponses: boolean[] = [];
	return {
		confirmResponses,
		confirmCalls: [],
		notifyCalls: [],
		statuses: new Map(),
		theme: { fg: (_color, text) => text }, // passthrough — tests don't check colors
		async confirm(question, details) {
			this.confirmCalls.push({ title: question, details });
			return this.confirmResponses.shift() ?? false;
		},
		notify(message, level = "info") {
			this.notifyCalls.push({ message, level });
		},
		setStatus(key, value) {
			if (value === undefined) this.statuses.delete(key);
			else this.statuses.set(key, value);
		},
	};
}

interface MockSessionManager {
	getEntries(): unknown[];
	getSessionName(): string | undefined;
	getSessionId(): string | undefined;
}

function makeSessionManager(opts: { name?: string; id?: string; entries?: unknown[] } = {}): MockSessionManager {
	return {
		getEntries: () => opts.entries ?? [],
		getSessionName: () => opts.name,
		getSessionId: () => opts.id,
	};
}

interface MockCtx {
	cwd: string;
	hasUI: boolean;
	ui: MockUI;
	sessionManager: MockSessionManager;
	mode: "tui" | "rpc" | "json" | "print";
}

// =============================================================================
// Load the extension
// =============================================================================

async function loadExtension(): Promise<(pi: MockExtensionAPI) => void> {
	const extPath = path.resolve(import.meta.dirname, "..", "index.ts");
	return await import(pathToFileURL(extPath).href).then(
		(m: { default: (pi: MockExtensionAPI) => void }) => m.default,
	);
}

function mkTmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "plan-mode-smoke-"));
}

function cleanup(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

// =============================================================================
// Tests — registration
// =============================================================================

test("extension loads and registers plan-mode flags", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	assert.ok(pi.flags.has("plan-mode"), "should register --plan-mode flag");
	assert.ok(pi.flags.has("plan-file"), "should register --plan-file flag");
	assert.equal(pi.flags.get("plan-mode")?.type, "boolean");
	assert.equal(pi.flags.get("plan-file")?.type, "string");
});

test("extension registers plan-mode slash commands", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	for (const cmd of ["plan-mode", "plan-enter", "plan-exit"]) {
		assert.ok(pi.commands.has(cmd), `should register /${cmd}`);
	}
});

test("extension registers plan_enter and plan_exit tools", async () => {
	const pi = new MockExtensionAPI();
	const activate = await loadExtension();
	activate(pi);

	assert.ok(pi.tools.has("plan_enter"), "should register plan_enter tool");
	assert.ok(pi.tools.has("plan_exit"), "should register plan_exit tool");

	const planExit = pi.tools.get("plan_exit")!;
	assert.match(planExit.description, /planning phase/);
	assert.match(planExit.description, /Do NOT call this tool/);
});

// =============================================================================
// Tests — session_start
// =============================================================================

test("session_start without --plan-mode leaves plan mode disabled", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "Test Plan", id: "abc12345" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const planFilePath = pi.appendedEntries.find((e) => e.customType === "plan-mode-state")?.data as
			| { enabled: boolean; planFilePath: string }
			| undefined;
		assert.ok(planFilePath, "should append a state entry");
		assert.equal(planFilePath.enabled, false);
		assert.match(planFilePath.planFilePath, /\.opencode\/plans\//);
		assert.match(planFilePath.planFilePath, /test-plan\.md$/);
	} finally {
		cleanup(tmp);
	}
});

test("session_start with --plan-mode=true enters plan mode", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "Test", id: "abc12345" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		// Plan-mode-active tools should NOT include plan_enter
		assert.ok(!pi.activeTools.includes("plan_enter"), "plan_enter should be filtered out");
	} finally {
		cleanup(tmp);
	}
});

test("session_start with --plan-file override uses that path", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-file", "docs/custom.md");
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "Test", id: "abc" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const state = pi.appendedEntries[0]?.data as { planFilePath: string };
		assert.equal(state.planFilePath, path.join(tmp, "docs", "custom.md"));
	} finally {
		cleanup(tmp);
	}
});

test("session_start with --plan-file exceeding length limit falls back to default", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		pi.setFlag("plan-file", "/".repeat(5000)); // 5000 chars, exceeds 4096 limit

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui,
			sessionManager: makeSessionManager({ name: "Test", id: "abc" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		// Should fall back to default plan path, NOT the rejected override
		const state = pi.appendedEntries[0]?.data as { planFilePath: string };
		assert.match(state.planFilePath, /\.opencode\/plans\//);
		assert.ok(
			!/^\/+$/.test(state.planFilePath),
			"plan path should not be just slashes (the rejected override)",
		);
		// User should be notified
		assert.ok(
			ui.notifyCalls.some((n) => /too long/i.test(n.message)),
			"user should be notified when --plan-file is too long",
		);
	} finally {
		cleanup(tmp);
	}
});

// =============================================================================
// Tests — plan_enter tool
// =============================================================================

test("plan_enter declined → state unchanged", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		ui.confirmResponses.push(false); // decline

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);
		pi.appendedEntries.length = 0; // reset

		const tool = pi.tools.get("plan_enter")!;
		const result = (await tool.execute("c1", {}, undefined, undefined, ctx)) as {
			content: Array<{ text: string }>;
			details: { entered?: boolean };
		};

		assert.equal(result.details.entered, false);
		assert.match(result.content[0].text, /declined/);
		assert.ok(pi.activeTools.includes("plan_enter"), "plan_enter must still be in active tools");
	} finally {
		cleanup(tmp);
	}
});

test("plan_enter accepted → swaps tools, appends state", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		ui.confirmResponses.push(true);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);
		pi.appendedEntries.length = 0;

		const tool = pi.tools.get("plan_enter")!;
		const result = (await tool.execute("c1", {}, undefined, undefined, ctx)) as {
			content: Array<{ text: string }>;
			details: { entered: boolean; planFilePath: string };
		};

		assert.equal(result.details.entered, true);
		assert.match(result.details.planFilePath, /\.opencode\/plans\//);
		assert.ok(!pi.activeTools.includes("plan_enter"), "plan_enter should be removed from active tools");
		assert.ok(pi.appendedEntries.some((e) => e.customType === "plan-mode-state"), "state should be persisted");
	} finally {
		cleanup(tmp);
	}
});

// =============================================================================
// Tests — tool_call guard
// =============================================================================

test("tool_call: when plan mode disabled → all actions pass through", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		// Edit any file → not blocked (plan mode not active)
		const result = await pi.emitToolCall(
			{ type: "tool_call", toolCallId: "c1", toolName: "edit", input: { file_path: "/etc/passwd" } },
			ctx,
		);
		assert.equal(result, undefined, "should not block when plan mode is off");
	} finally {
		cleanup(tmp);
	}
});

test("tool_call: when plan mode active, edit on /etc/passwd → blocked + user notified", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const result = (await pi.emitToolCall(
			{ type: "tool_call", toolCallId: "c1", toolName: "edit", input: { file_path: "/etc/passwd" } },
			ctx,
		)) as { block: boolean; reason: string };

		assert.equal(result.block, true);
		assert.match(result.reason, /not permitted/);
		// User should see a notification explaining what was blocked
		assert.ok(
			ui.notifyCalls.some((n) => /Plan mode blocked: edit/.test(n.message)),
			"user should be notified when a tool call is blocked",
		);
	} finally {
		cleanup(tmp);
	}
});

test("tool_call: when plan mode active, edit on plan file → allowed", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const state = pi.appendedEntries[0]?.data as { planFilePath: string };
		const result = await pi.emitToolCall(
			{
				type: "tool_call",
				toolCallId: "c1",
				toolName: "edit",
				input: { file_path: state.planFilePath },
			},
			ctx,
		);
		assert.equal(result, undefined, "should not block when editing the plan file");
	} finally {
		cleanup(tmp);
	}
});

test("tool_call: when plan mode active, bash with rm → blocked", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const result = (await pi.emitToolCall(
			{ type: "tool_call", toolCallId: "c1", toolName: "bash", input: { command: "rm -rf /tmp/foo" } },
			ctx,
		)) as { block: boolean };

		assert.equal(result.block, true);
	} finally {
		cleanup(tmp);
	}
});

test("tool_call: when plan mode active, bash with cat → allowed", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const result = await pi.emitToolCall(
			{ type: "tool_call", toolCallId: "c1", toolName: "bash", input: { command: "cat package.json" } },
			ctx,
		);
		assert.equal(result, undefined, "should not block cat");
	} finally {
		cleanup(tmp);
	}
});

// =============================================================================
// Tests — plan_exit tool
// =============================================================================

test("plan_exit declined → stays in plan mode", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);
		pi.appendedEntries.length = 0;

		const tool = pi.tools.get("plan_exit")!;
		ui.confirmResponses.push(false);
		const result = (await tool.execute("c1", {}, undefined, undefined, ctx)) as {
			content: Array<{ text: string }>;
			details: { exited: boolean };
		};

		assert.equal(result.details.exited, false);
		assert.match(result.content[0].text, /refinement/);
		assert.equal(pi.sentUserMessages.length, 0, "no user message sent on decline");
	} finally {
		cleanup(tmp);
	}
});

test("plan_exit accepted → exits plan mode + sends synthetic user message", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		// Capture the resolved plan-file path before we proceed.
		const state = pi.appendedEntries[0]?.data as { planFilePath: string };
		// Create the plan file on disk so plan_exit's existence check passes.
		fs.writeFileSync(state.planFilePath, "# My plan\n\nGoal: do X\n");

		const tool = pi.tools.get("plan_exit")!;
		ui.confirmResponses.push(true);
		const result = (await tool.execute("c1", {}, undefined, undefined, ctx)) as {
			content: Array<{ text: string }>;
			details: { exited: boolean; switchedToBuild: boolean; planFilePath: string };
		};

		assert.equal(result.details.exited, true);
		assert.equal(result.details.switchedToBuild, true);
		assert.equal(pi.sentUserMessages.length, 1);
		const sent = pi.sentUserMessages[0];
		// Verify the exact wording matches OpenCode's PlanExitTool output.
		assert.match(sent.content, /has been approved, you can now edit files/);
		assert.match(sent.content, /Execute the plan/);
		// The synthetic message must include the plan-file path.
		assert.ok(sent.content.includes(state.planFilePath), "synthetic message must reference plan file path");
		assert.ok(pi.activeTools.includes("plan_enter"), "plan_enter restored after exit");
	} finally {
		cleanup(tmp);
	}
});

test("plan_exit declined because plan file does not exist → stays in plan mode", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ui = makeUI();
		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: true,
			ui,
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "tui",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		// Do NOT create the plan file — exit should be blocked.
		// (We just verify pi.appendedEntries[0] exists, but don't write to the path.)
		assert.ok(pi.appendedEntries[0], "session_start should have persisted state");

		const tool = pi.tools.get("plan_exit")!;
		ui.confirmResponses.push(true);
		const result = (await tool.execute("c1", {}, undefined, undefined, ctx)) as {
			content: Array<{ text: string }>;
			details: { exited: boolean; planFileMissing?: boolean };
		};

		assert.equal(result.details.exited, false);
		assert.equal(result.details.planFileMissing, true);
		assert.match(result.content[0].text, /Plan file not found/);
		assert.equal(pi.sentUserMessages.length, 0, "no synthetic message when file is missing");
		assert.ok(!pi.activeTools.includes("plan_enter"), "plan_enter should NOT be restored when file is missing");
	} finally {
		cleanup(tmp);
	}
});

// =============================================================================
// Tests — before_agent_start
// =============================================================================

test("before_agent_start: when plan mode off, no prompt injected", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const result = await pi.emitBeforeAgentStart(
			{ type: "before_agent_start", prompt: "hi", systemPrompt: "" },
			ctx,
		);
		assert.equal(result, undefined, "no prompt when plan mode off");
	} finally {
		cleanup(tmp);
	}
});

test("before_agent_start: when plan mode on, prompt injected with plan-file path", async () => {
	const tmp = mkTmp();
	try {
		const pi = new MockExtensionAPI();
		pi.setFlag("plan-mode", true);
		const activate = await loadExtension();
		activate(pi);

		const ctx: MockCtx = {
			cwd: tmp,
			hasUI: false,
			ui: makeUI(),
			sessionManager: makeSessionManager({ name: "T", id: "x" }),
			mode: "print",
		};
		await pi.emitSessionStart({ type: "session_start", reason: "startup" }, ctx);

		const state = pi.appendedEntries[0]?.data as { planFilePath: string };
		const result = (await pi.emitBeforeAgentStart(
			{ type: "before_agent_start", prompt: "hi", systemPrompt: "" },
			ctx,
		)) as { message: { content: string; customType: string; display: boolean } };

		assert.equal(result.message.customType, "plan-mode-context");
		assert.equal(result.message.display, false);
		assert.match(result.message.content, /Plan mode is active/);
		assert.ok(result.message.content.includes(state.planFilePath), "prompt must include plan file path");
	} finally {
		cleanup(tmp);
	}
});