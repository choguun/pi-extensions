/**
 * Multi-Session Extension
 *
 * Lets multiple pi processes on the same machine discover each other and
 * exchange messages. Each session is registered in
 * `${agentDir}/runtime/registry.json` with a heartbeat. Mailboxes live in
 * `${agentDir}/runtime/mailbox/<sessionId>.jsonl` and are polled every
 * 2 seconds for new messages.
 *
 * Tools (callable by the LLM):
 *   - pi_sessions — list other live sessions
 *   - pi_send     — send a message to another session
 *   - pi_who      — show this session's identity
 *
 * Slash commands (for the user):
 *   - /sessions                — list active sessions (interactive picker)
 *   - /send <ref> <message...> — quick send
 *   - /who                     — show this session's identity
 *
 * Events listened for:
 *   - session_start            — register, start heartbeat + watcher
 *   - agent_start / agent_end  — flip status busy/idle in registry
 *   - model_select             — update model in registry
 *   - thinking_level_select    — update thinking level in registry
 *   - session_shutdown         — deregister, stop timers
 */

import * as os from "node:os";
import { Type } from "typebox";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	resolveSessionRef,
	shortSessionId,
	type MailboxMessage,
	type MessageType,
	type SessionIdentity,
} from "./protocol.ts";
import {
	heartbeat,
	isRegistered,
	listActive,
	listAll,
	register,
	deregister,
	startHeartbeat,
	update,
} from "./registry.ts";
import { appendMessage, markMessage, pollMailbox } from "./mailbox.ts";

// =============================================================================
// Polling
// =============================================================================

const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Read the poll interval. Default 2s. Can be overridden with the
 * `PI_MULTI_SESSION_POLL_MS` env var (useful for tests and for users
 * who want faster delivery).
 */
function readPollIntervalMs(): number {
	const raw = process.env.PI_MULTI_SESSION_POLL_MS;
	if (!raw) return DEFAULT_POLL_INTERVAL_MS;
	const n = Number.parseInt(raw, 10);
	if (Number.isFinite(n) && n > 0) return n;
	return DEFAULT_POLL_INTERVAL_MS;
}

// =============================================================================
// Extension
// =============================================================================

export default function (pi: ExtensionAPI) {
	// Per-process state. One pi invocation = one process.
	const agentDir = getAgentDir();
	const hostname = os.hostname();
	const pid = process.pid;

	// Filled in on session_start.
	let mySessionId: string | null = null;
	let myIdentity: SessionIdentity | null = null;

	// Heartbeat + watcher handles. Set on session_start, cleared on shutdown.
	let stopHeartbeat: (() => void) | null = null;
	let stopWatcher: (() => void) | null = null;
	const seenIds: Set<string> = new Set();

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/** Return the current session's identity, or null if not yet registered. */
	function myEntry(): SessionIdentity | null {
		return myIdentity;
	}

	/** Render an incoming message as a user-facing string. */
	function formatIncoming(msg: MailboxMessage): string {
		const lines: string[] = [];
		const fromShort = shortSessionId(msg.from.sessionId);
		const replyHint = msg.type === "request" || msg.replyTo
			? `\n\n[Reply via pi_send: to=${fromShort} type=reply replyTo=${msg.id}]`
			: "";
		lines.push(`[Message from ${msg.from.name || "(unnamed)"} (${fromShort}) — ${msg.type} — ${msg.timestamp}]`);
		lines.push("");
		lines.push(msg.payload.text);
		if (replyHint) lines.push(replyHint);
		return lines.join("\n");
	}

	/** Inject an incoming message into the live session. */
	function deliverMessage(msg: MailboxMessage): void {
		try {
			// Mark first so we don't re-inject on the next poll.
			markMessage(agentDir, msg.to, msg.id, { status: "processed" });

			const text = formatIncoming(msg);

			switch (msg.type) {
				case "notify":
					pi.sendMessage({
						customType: "multi-session",
						content: `[${msg.from.name || "(unnamed)"}] ${msg.payload.text}`,
						display: true,
					});
					break;

				case "ack":
					// Acks are confirmations. Log to TUI as a notification.
					pi.sendMessage({
						customType: "multi-session",
						content: `[ack from ${msg.from.name || "(unnamed)"}${msg.replyTo ? ` for ${msg.replyTo}` : ""}] ${msg.payload.text || ""}`,
						display: true,
					});
					break;

				case "steer":
					// Interrupt mid-stream if active, otherwise just send.
					pi.sendUserMessage(text, { deliverAs: "steer" });
					break;

				case "task":
				case "request":
				case "reply":
				default:
					// Inject as a user message; the LLM processes when idle.
					pi.sendUserMessage(text);
					break;
			}
		} catch (err) {
			// If injection fails, un-mark so we retry next poll.
			markMessage(agentDir, msg.to, msg.id, {
				status: "failed",
				error: (err as Error).message,
			});
		}
	}

	/** Build the "from" field for outbound messages. */
	function fromRef(): MailboxMessage["from"] {
		return {
			sessionId: mySessionId ?? "unknown",
			name: myIdentity?.name ?? "(unnamed)",
			pid,
		};
	}

	/** Look up the live entry for the local session, refreshing from disk. */
	function liveMyEntry(): SessionIdentity | null {
		if (!isRegistered(agentDir, pid, hostname)) return null;
		const all = listAll(agentDir);
		return all.find((e) => e.pid === pid && e.hostname === hostname) ?? null;
	}

	// -------------------------------------------------------------------------
	// Event wiring
	// -------------------------------------------------------------------------

	pi.on("session_start", async (event, ctx) => {
		// Pull the real session id from the session manager.
		const sm = ctx.sessionManager;
		const sessionId = sm.getSessionId?.() ?? `ephemeral-${pid}-${Date.now()}`;
		mySessionId = sessionId;

		const sessionFile = sm.getSessionFile?.() ?? null;
		const cwd = ctx.cwd;
		const name = sm.getSessionName?.() ?? "";

		// Read model + thinking from context.
		const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null;
		const thinkingLevel = pi.getThinkingLevel ? (pi.getThinkingLevel() as string) : null;

		// Register (also prunes stale entries).
		myIdentity = register(agentDir, {
			sessionId,
			sessionFile,
			cwd,
			name,
			model,
			thinkingLevel,
		});

		// Start heartbeat (writes lastHeartbeat every 10s).
		stopHeartbeat = startHeartbeat(agentDir, pid, hostname);

		// Start inbox watcher (polls every PI_MULTI_SESSION_POLL_MS, default 2s).
		const seen = seenIds;
		const tick = () => {
			try {
				const fresh = pollMailbox(agentDir, sessionId, seen);
				for (const msg of fresh) deliverMessage(msg);
			} catch {
				// Disk error — try again next tick.
			}
		};
		const intervalMs = readPollIntervalMs();
		const interval = setInterval(tick, intervalMs);
		interval.unref?.();
		stopWatcher = () => clearInterval(interval);

		// Drain any pending messages that were sent while we were offline.
		try {
			const fresh = pollMailbox(agentDir, sessionId, seen);
			for (const msg of fresh) deliverMessage(msg);
		} catch {
			// Best effort.
		}

		// Notify the user they're now discoverable.
		if (ctx.hasUI) {
			ctx.ui.notify(
				`Multi-session: registered as ${shortSessionId(sessionId)} (${myIdentity.name || "unnamed"})`,
				"info",
			);
		}

		// Avoid unused-var warning when reason isn't read.
		void event;
	});

	pi.on("agent_start", async (_event, _ctx) => {
		if (myIdentity) {
			const updated = update(agentDir, pid, hostname, { status: "busy" });
			if (updated) myIdentity = updated;
		}
	});

	pi.on("agent_end", async (_event, _ctx) => {
		if (myIdentity) {
			const updated = update(agentDir, pid, hostname, { status: "idle" });
			if (updated) myIdentity = updated;
		}
	});

	pi.on("model_select", async (event, _ctx) => {
		if (myIdentity) {
			const model = `${event.model.provider}/${event.model.id}`;
			const updated = update(agentDir, pid, hostname, { model });
			if (updated) myIdentity = updated;
		}
	});

	pi.on("thinking_level_select", async (event, _ctx) => {
		if (myIdentity) {
			const updated = update(agentDir, pid, hostname, { thinkingLevel: event.level });
			if (updated) myIdentity = updated;
		}
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		stopHeartbeat?.();
		stopWatcher?.();
		stopHeartbeat = null;
		stopWatcher = null;
		try {
			deregister(agentDir, pid, hostname);
		} catch {
			// Best effort.
		}
		myIdentity = null;
	});

	// -------------------------------------------------------------------------
	// Tools (callable by the LLM)
	// -------------------------------------------------------------------------

	const VALID_SEND_TYPES: ReadonlyArray<MessageType> = ["notify", "task", "steer", "request", "reply", "ack"];

	// Uniform return shape for pi_send so TypeScript can infer a single
	// details type. All branches set the same fields; null for unset.
	interface SendDetails {
		messageId: string | null;
		recipient: string | null;
		type: string | null;
	}

	function sendError(text: string): { content: Array<{ type: "text"; text: string }>; isError: true; details: SendDetails } {
		return { content: [{ type: "text", text }], isError: true, details: { messageId: null, recipient: null, type: null } };
	}

	function sendOk(text: string, d: { messageId: string; recipient: string; type: string }): { content: Array<{ type: "text"; text: string }>; details: SendDetails } {
		return { content: [{ type: "text", text }], details: { messageId: d.messageId, recipient: d.recipient, type: d.type } };
	}

	pi.registerTool({
		name: "pi_sessions",
		label: "List pi sessions",
		description:
			"List other pi sessions on this machine that you can communicate with via pi_send. " +
			"Returns one row per session: session id (full + short prefix), display name, working directory, " +
			"model, thinking level, and busy/idle status. " +
			"Use action='list_active' for live sessions only, or 'list_all' to include stale entries.",
		promptSnippet: "List other running pi sessions for inter-session communication.",
		promptGuidelines: [
			"Use pi_sessions with action='list_active' before pi_send when you don't already know the recipient's id, to confirm it's still alive.",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Either 'list_active' (live sessions only) or 'list_all' (includes stale entries).",
			}),
		}),
		async execute(_toolCallId, params) {
			const action = (params.action ?? "list_active").trim();
			const sessions = action === "list_all" ? listAll(agentDir) : listActive(agentDir);
			const me = liveMyEntry();
			// Filter out our own entry — we can't usefully message ourselves.
			const others = sessions.filter((s) => !(me && s.sessionId === me.sessionId && s.pid === me.pid));
			const text = others.length === 0
				? "No other live pi sessions."
				: others
						.map((s) => {
							const short = shortSessionId(s.sessionId);
							return `- ${short} | ${s.name || "(unnamed)"} | ${s.cwd} | ${s.model ?? "(no model)"} | ${s.status} | sessionId=${s.sessionId}`;
						})
						.join("\n");
			return {
				content: [{ type: "text", text }],
				details: { count: others.length, sessions: others },
			};
		},
	});

	pi.registerTool({
		name: "pi_send",
		label: "Send message to another pi session",
		description:
			"Send a message to another pi session identified by id (full or partial prefix) or display name. " +
			"type='task' injects the message as a user prompt in the recipient session (the recipient's LLM will process it). " +
			"type='steer' interrupts the recipient mid-stream. " +
			"type='notify' just shows a notification, no LLM action. " +
			"type='request' is like task but expects a reply (the recipient's LLM is told to reply via pi_send with type='reply' and replyTo=<id>).",
		promptSnippet: "Send a message to another pi session.",
		promptGuidelines: [
			"Use pi_send with type='task' for normal work delegation.",
			"Use pi_send with type='request' when you need a reply — set replyTo on the response.",
			"Resolve session refs by calling pi_sessions first if you don't have a stable id.",
		],
		parameters: Type.Object({
			to: Type.String({ description: "Recipient: full or partial session id, or display name." }),
			type: Type.String({
				description: "One of: 'notify' (just show), 'task' (inject as user message), 'steer' (interrupt mid-stream), 'request' (task + expect reply).",
			}),
			message: Type.String({ description: "The message text to deliver." }),
		}),
		async execute(_toolCallId, params) {
			const me = liveMyEntry();
			if (!me) {
				return sendError("Error: this session is not registered. Try again after /reload.");
			}

			// Validate type.
			const requestedType = (params.type ?? "").trim();
			if (!VALID_SEND_TYPES.includes(requestedType as MessageType)) {
				return sendError(`Error: unknown type "${params.type}". Use one of: ${VALID_SEND_TYPES.join(", ")}.`);
			}

			// Resolve recipient. Read the registry live so we don't depend on cached state.
			const { readRegistry } = await import("./registry.ts");
			const registry = readRegistry(agentDir);
			const resolved = resolveSessionRef(registry, params.to);
			if (!resolved) {
				return sendError(`Error: no live session matches "${params.to}". Try pi_sessions to see available sessions.`);
			}
			if ("ambiguous" in resolved && resolved.ambiguous) {
				const alts = resolved.candidates.map((c) => shortSessionId(c.sessionId)).join(", ");
				return sendError(`Error: "${params.to}" is ambiguous. Candidates: ${alts}. Pass a longer prefix.`);
			}
			if ("match" in resolved) {
				const target = resolved.match;
				if (target.sessionId === me.sessionId && target.pid === me.pid) {
					return sendError("Error: cannot send a message to your own session.");
				}

				const persisted = appendMessage(
					agentDir,
					target.sessionId,
					fromRef(),
					requestedType as MessageType,
					{ text: params.message },
				);

				return sendOk(
					`Sent ${persisted.type} to ${target.name || "(unnamed)"} (${shortSessionId(target.sessionId)}). Message id: ${persisted.id}.`,
					{ messageId: persisted.id, recipient: target.sessionId, type: persisted.type },
				);
			}
			// Unreachable but the type system wants a return.
			return sendError("Error: unexpected resolve outcome.");
		},
	});

	interface WhoDetails {
		identity: SessionIdentity | null;
	}

	pi.registerTool({
		name: "pi_who",
		label: "Show this session's identity",
		description: "Show this session's session id (full + short prefix), display name, working directory, model, and status. Other sessions address this session by these fields.",
		promptSnippet: "Show this session's identity (id, name, cwd, model, status).",
		parameters: Type.Object({}),
		async execute(): Promise<{ content: Array<{ type: "text"; text: string }>; details: WhoDetails }> {
			const me = liveMyEntry();
			if (!me) {
				return { content: [{ type: "text", text: "Not registered. Try /reload." }], details: { identity: null } };
			}
			const text = `sessionId: ${me.sessionId}\nshort: ${shortSessionId(me.sessionId)}\nname: ${me.name || "(unnamed)"}\ncwd: ${me.cwd}\nmodel: ${me.model ?? "(none)"}\nthinking: ${me.thinkingLevel ?? "(none)"}\nstatus: ${me.status}\npid: ${me.pid}\nhostname: ${me.hostname}`;
			return { content: [{ type: "text", text }], details: { identity: me } };
		},
	});

	// -------------------------------------------------------------------------
	// Slash commands (for the user)
	// -------------------------------------------------------------------------

	pi.registerCommand("who", {
		description: "Show this session's multi-session identity (id, name, cwd, model, status).",
		handler: async (_args, ctx) => {
			const me = liveMyEntry();
			if (!me) {
				ctx.ui.notify("Not registered yet — wait for the multi-session extension to finish initializing.", "error");
				return;
			}
			ctx.ui.notify(
				`${shortSessionId(me.sessionId)} | ${me.name || "(unnamed)"} | ${me.cwd} | ${me.model ?? "(no model)"} | ${me.status}`,
				"info",
			);
		},
	});

	pi.registerCommand("sessions", {
		description: "List active pi sessions you can message. Optionally pick one to copy its short id.",
		handler: async (_args, ctx) => {
			const me = liveMyEntry();
			const all = listActive(agentDir);
			const others = all.filter((s) => !(me && s.sessionId === me.sessionId && s.pid === me.pid));
			if (others.length === 0) {
				ctx.ui.notify("No other live pi sessions.", "info");
				return;
			}
			const labels = others.map((s) => {
				const short = shortSessionId(s.sessionId);
				const name = s.name || "(unnamed)";
				return `${short}  ${name}  [${s.status}]  ${s.cwd}`;
			});
			const choice = await ctx.ui.select("Pick a session to address:", labels);
			if (choice) {
				const idx = labels.indexOf(choice);
				const picked = others[idx];
				ctx.ui.setEditorText(`/send ${shortSessionId(picked.sessionId)} `);
			}
		},
	});

	pi.registerCommand("send", {
		description: "Send a message to another pi session. Usage: /send <ref> <message...>",
		handler: async (args, ctx) => {
			const me = liveMyEntry();
			if (!me) {
				ctx.ui.notify("Not registered yet — wait for the multi-session extension to finish initializing.", "error");
				return;
			}

			// Parse: first token is the ref, rest is the message.
			const trimmed = args.trim();
			const spaceIdx = trimmed.indexOf(" ");
			if (spaceIdx < 0) {
				ctx.ui.notify("Usage: /send <session-ref> <message...>", "error");
				return;
			}
			const ref = trimmed.slice(0, spaceIdx);
			const text = trimmed.slice(spaceIdx + 1).trim();
			if (!text) {
				ctx.ui.notify("Usage: /send <session-ref> <message...>", "error");
				return;
			}

			const { readRegistry } = await import("./registry.ts");
			const registry = readRegistry(agentDir);
			const resolved = resolveSessionRef(registry, ref);
			if (!resolved) {
				ctx.ui.notify(`No live session matches "${ref}".`, "error");
				return;
			}
			if ("ambiguous" in resolved && resolved.ambiguous) {
				const alts = resolved.candidates.map((c) => `${shortSessionId(c.sessionId)} (${c.name || "unnamed"})`).join(", ");
				ctx.ui.notify(`"${ref}" is ambiguous: ${alts}.`, "error");
				return;
			}
			if ("match" in resolved) {
				const target = resolved.match;
				const persisted = appendMessage(agentDir, target.sessionId, fromRef(), "task", { text });
				ctx.ui.notify(
					`Sent task to ${target.name || "(unnamed)"} (${shortSessionId(target.sessionId)}). id=${persisted.id}`,
					"info",
				);
			}
		},
	});
}
