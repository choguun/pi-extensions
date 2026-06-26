/**
 * Shared MockExtensionAPI for both AIDLC and multi-session smoke tests.
 *
 * Originally there were two divergent copies — one in
 * `extensions/aidlc-workflow/test/smoke.test.ts` and one in
 * `extensions/multi-session/test/smoke.test.ts`. The multi-session copy was
 * already richer (had `emit()`, `ctx`, `ui`, `sessionManager`, etc.) and is
 * the pattern F1.6's review established as the repo convention.
 *
 * This merged mock is imported by both smoke tests, and by the F1.7
 * bootstrap test (`extensions/aidlc-workflow/test/bootstrap.test.ts`
 * uses its own thin inline `MockExtensionAPI` because it needs only the
 * `on()`/`handlers` shape — see that file for why).
 *
 * Capabilities:
 *   - `on(event, handler)` — stores handlers in `eventHandlers`.
 *   - `emit(event, payload)` — fires all stored handlers with `(payload, this.ctx)`.
 *   - `registerTool`, `registerCommand` — store for later assertions.
 *   - `sendUserMessage(text, options?)` — push into `sentUserMessages`.
 *   - `sendMessage({customType, content, display})` — push into `sentCustomMessages`.
 *   - `ui.notify(message, level)` — push into `uiNotifications`.
 *   - `ctx.cwd` — so the bootstrap's context handler can read cwd from ctx
 *     (not from `event.cwd` or `process.cwd()` — see bootstrap.ts:147).
 *
 * Why this lives in `extensions/aidlc-workflow/test/` rather than at the
 * repo root: the brief explicitly puts it here (Pre-step A), and the
 * multi-session smoke test imports it via a relative path
 * (`../../aidlc-workflow/test/mock-extension-api.ts`). The cross-extension
 * import is an acceptable trade-off because (a) the mock is a test
 * artifact, not runtime code, and (b) the AIDLC extension is the canonical
 * owner of the `.aidlc/` lifecycle that bootstrap tests need this mock for.
 */

export interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	promptSnippet?: string;
	promptGuidelines?: string[];
	execute: (...args: unknown[]) => Promise<unknown>;
	renderCall?: (...args: unknown[]) => unknown;
	renderResult?: (...args: unknown[]) => unknown;
}

export interface RegisteredCommand {
	name: string;
	description: string;
	handler: (...args: unknown[]) => Promise<unknown> | unknown;
}

export interface SentUserMessage {
	text: string;
	options?: unknown;
}

export interface SentCustomMessage {
	type: string;
	content: string;
}

export interface UINotification {
	level: string;
	message: string;
}

export type ExtensionEventHandler = (event: unknown, ctx: unknown) => Promise<void> | void;

export default class MockExtensionAPI {
	readonly tools = new Map<string, RegisteredTool>();
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: SentUserMessage[] = [];
	readonly sentCustomMessages: SentCustomMessage[] = [];
	readonly uiNotifications: UINotification[] = [];
	readonly eventHandlers = new Map<string, ExtensionEventHandler[]>();

	// Session identity (set by tests, read by extension event handlers).
	sessionId = "";
	sessionFile: string | null = null;
	sessionName = "";
	cwd = "/Users/test/proj";
	model: { provider: string; id: string } | null = {
		provider: "anthropic",
		id: "claude-sonnet-4-5",
	};
	thinkingLevel: string = "medium";

	sessionManager = {
		getSessionId: (): string => this.sessionId,
		getSessionFile: (): string | null => this.sessionFile,
		getSessionName: (): string => this.sessionName,
	};

	ui = {
		notify: (message: string, level: string): void => {
			this.uiNotifications.push({ level, message });
		},
		select: async (_title: string, options: string[]): Promise<string> => {
			// First option for determinism.
			return options[0];
		},
		setEditorText: (_text: string): void => {
			// No-op for the test.
		},
	};

	/**
	 * The `ctx` object passed to event handlers by `emit()`. The bootstrap
	 * extension reads `ctx.cwd` here (bootstrap.ts:147) — so we MUST keep
	 * `cwd` on this object even though the same field also exists at the
	 * top level of the mock (pi's real API surfaces it both ways in
	 * different events).
	 */
	ctx: { ui: typeof this.ui; hasUI: boolean; cwd: string; model: unknown; sessionManager: typeof this.sessionManager } = {
		ui: this.ui,
		hasUI: true,
		cwd: this.cwd,
		model: this.model,
		sessionManager: this.sessionManager,
	};

	/**
	 * Register an event handler. Matches pi's `ExtensionAPI.on()` shape.
	 * Stores handlers in a Map keyed by event name so `emit()` can fire them.
	 */
	on(event: string, handler: ExtensionEventHandler): void {
		const list = this.eventHandlers.get(event) ?? [];
		list.push(handler);
		this.eventHandlers.set(event, list);
	}

	/**
	 * Fire an event by running all registered handlers with `(payload, this.ctx)`.
	 * Awaits each handler sequentially — matches pi's event-dispatch semantics
	 * closely enough for testing.
	 */
	async emit(event: string, payload: unknown = {}): Promise<void> {
		const list = this.eventHandlers.get(event) ?? [];
		for (const h of list) await h(payload, this.ctx);
	}

	registerTool(tool: RegisteredTool): void {
		this.tools.set(tool.name, tool);
	}

	registerCommand(
		name: string,
		command: { description: string; handler: RegisteredCommand["handler"] },
	): void {
		this.commands.set(name, {
			name,
			description: command.description,
			handler: command.handler,
		});
	}

	/**
	 * Inject a user message. AIDLC slash commands use this to trigger skills
	 * (see `extensions/aidlc-workflow/index.ts:824+`). The multi-session
	 * inbox watcher uses it to inject messages from other sessions.
	 */
	sendUserMessage(text: string, options?: unknown): void {
		this.sentUserMessages.push({ text, options });
	}

	/**
	 * Inject a custom (non-user) message — multi-session uses this for
	 * `notify` and other non-prompt injections.
	 */
	sendMessage(message: { customType: string; content: string; display: boolean }): void {
		this.sentCustomMessages.push({ type: message.customType, content: message.content });
	}

	getThinkingLevel(): string {
		return this.thinkingLevel;
	}
}