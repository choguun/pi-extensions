/**
 * Plan Mode Extension
 *
 * Implements Claude Code / OpenCode-style plan mode for pi:
 *   - Two custom tools: plan_enter (build → plan) and plan_exit (plan → build)
 *   - Pattern-based permission ruleset (mirrors OpenCode's Permission system)
 *   - 5-phase system prompt injected via before_agent_start
 *   - Bash restricted to safe read-only commands in plan mode
 *   - edit/write only allowed on the resolved plan file
 *   - Plan file path: <cwd>/.opencode/plans/<timestamp>-<slug>.md by default
 *     (overridable via --plan-file, or auto-detects .aidlc/plan.md)
 *
 * Activated by:
 *   - --plan-mode CLI flag (start in plan mode)
 *   - /plan-mode slash command (toggle)
 *   - plan_enter tool call (agent-initiated)
 *
 * Reference: https://github.com/anomalyco/opencode
 *   packages/opencode/src/agent/agent.ts
 *   packages/opencode/src/tool/plan.ts
 */

import * as fs from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { check, extractPath, PLAN_AGENT_PERMISSIONS } from "./permissions.ts";
import { deriveSlug, type PlanPathInputs, resolvePlanPath } from "./utils.ts";

// =============================================================================
// State
// =============================================================================

interface PlanModeState {
	enabled: boolean;
	planFilePath: string; // absolute
	toolsBeforePlanMode?: string[];
}

const SESSION_ENTRY_TYPE = "plan-mode-state";

/** Max length of the --plan-file flag value. Beyond this we treat the input
 *  as suspicious (potential DoS via context-window bloat from a giant
 *  path in the injected prompt). 4096 chars is more than enough for any
 *  realistic filesystem path. */
const MAX_PLAN_FILE_FLAG_LENGTH = 4096;

/** Module-level state. Pi runs one session per process, so a singleton is
 *  the natural shape. If pi ever supports multiple concurrent sessions per
 *  process, this needs to move into a per-session context. */
let state: PlanModeState = {
	enabled: false,
	planFilePath: "",
};

// =============================================================================
// System prompt
// =============================================================================

const PLAN_MODE_PROMPT_TEMPLATE = `## Plan mode is active

You are in plan mode. You MUST NOT make any edits, run any non-readonly
tools (including changing configs or making commits), or otherwise make
any changes to the system, except writing the plan file. This supersedes
any other instructions you have received.

You MUST follow this exact workflow. Do NOT skip phases. Do NOT do work
that belongs to a later phase.

### Phase 1 — Initial Understanding

Goal: gain a comprehensive understanding of the user's request by reading
code and asking the user questions. Use the explore subagent (in parallel)
when the scope is uncertain, multiple areas of the codebase are involved,
or you need to understand existing patterns before designing.

- Launch up to 3 explore agents IN PARALLEL (single message, multiple
  tool calls) when warranted. Use 1 when the task is isolated to known
  files or a small targeted change.
- After exploring, ask clarifying questions to the user via the
  questionnaire/question tool. Surface ambiguity; don't assume.

### Phase 2 — Design

Launch a general-purpose plan agent with the explore findings + user
answers. Request a detailed implementation design. You can launch up to
1 agent in this phase; for non-trivial tasks, do not skip it.

### Phase 3 — Review

Read the critical files identified by the agents to deepen your own
understanding. Confirm the design lines up with the user's intent. Ask
remaining questions if any.

### Phase 4 — Final Plan

Write the final plan to: <PLAN_FILE_PATH>

Only this file may be edited. No other writes are permitted. The
tool_call guard will block any edit/write to a different path.

The plan file should include:
- Goal (one sentence)
- Files to modify (with paths)
- Step-by-step changes
- Verification (how to test end-to-end)

### Phase 5 — Exit

Call the plan_exit tool. This surfaces the plan path to the user and
asks whether to switch to build mode. Do NOT start any implementation
work inside plan mode.

## Plan File Info

Plan file path: <PLAN_FILE_PATH>
`;

// =============================================================================
// Helpers
// =============================================================================

function cwd(ctx: ExtensionContext): string {
	return ctx.cwd;
}

function buildPrompt(planFilePath: string): string {
	return PLAN_MODE_PROMPT_TEMPLATE.replaceAll("<PLAN_FILE_PATH>", planFilePath);
}

/** Enter plan mode. Swaps in the plan-agent permissions, sets the
 *  plan-file path, and persists state. */
function enterPlanMode(ctx: ExtensionContext): void {
	const toolsBefore = pi.getActiveTools();
	state.toolsBeforePlanMode = toolsBefore;
	state.enabled = true;
	// Tools before entering: build-agent's full set, minus plan_enter
	// (we're already entering, no need to re-enter). Keep plan_exit
	// available so the user can re-call it later.
	const planTools = toolsBefore.filter((t) => t !== "plan_enter");
	pi.setActiveTools(planTools);
	persistState(ctx);
	updateStatus(ctx);
}

function exitPlanMode(ctx: ExtensionContext): void {
	state.enabled = false;
	if (state.toolsBeforePlanMode) {
		pi.setActiveTools(state.toolsBeforePlanMode);
		state.toolsBeforePlanMode = undefined;
	}
	persistState(ctx);
	updateStatus(ctx);
}

function persistState(ctx: ExtensionContext): void {
	pi.appendEntry(SESSION_ENTRY_TYPE, {
		enabled: state.enabled,
		planFilePath: state.planFilePath,
		toolsBeforePlanMode: state.toolsBeforePlanMode,
	});
}

function updateStatus(ctx: ExtensionContext): void {
	if (state.enabled) {
		// Use accent (not warning) — plan mode is an intentional state, not
		// an error. Warning would imply something's wrong.
		ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", "⏸ plan"));
	} else {
		ctx.ui.setStatus("plan-mode", undefined);
	}
}

// =============================================================================
// Extension
// =============================================================================

let pi: ExtensionAPI;

export default function (api: ExtensionAPI): void {
	pi = api;

	// -------------------------------------------------------------------------
	// CLI flags
	// -------------------------------------------------------------------------

	pi.registerFlag("plan-mode", {
		description: "Start in plan mode (read-only exploration + plan file).",
		type: "boolean",
		default: false,
	});

	pi.registerFlag("plan-file", {
		description: "Path to the plan file (default: <cwd>/.opencode/plans/<timestamp>-<slug>.md).",
		type: "string",
	});

	// -------------------------------------------------------------------------
	// Slash commands
	// -------------------------------------------------------------------------

	pi.registerCommand("plan-mode", {
		description: "Toggle plan mode (read-only exploration).",
		handler: async (_args, ctx) => {
			if (state.enabled) {
				exitPlanMode(ctx);
				ctx.ui.notify("Plan mode disabled.", "info");
			} else {
				enterPlanMode(ctx);
				ctx.ui.notify(`Plan mode enabled.\n\nPlan file: ${state.planFilePath}`, "info");
			}
		},
	});

	pi.registerCommand("plan-enter", {
		description: "Enter plan mode (same as plan_enter tool).",
		handler: async (_args, ctx) => {
			if (state.enabled) {
				ctx.ui.notify("Already in plan mode.", "info");
				return;
			}
			enterPlanMode(ctx);
			ctx.ui.notify(`Plan mode enabled.\n\nPlan file: ${state.planFilePath}`, "info");
		},
	});

	pi.registerCommand("plan-exit", {
		description: "Exit plan mode (same as plan_exit tool).",
		handler: async (_args, ctx) => {
			if (!state.enabled) {
				ctx.ui.notify("Not in plan mode.", "info");
				return;
			}
			exitPlanMode(ctx);
			ctx.ui.notify("Plan mode disabled.", "info");
		},
	});

	// -------------------------------------------------------------------------
	// Custom tools: plan_enter and plan_exit
	// -------------------------------------------------------------------------

	pi.registerTool({
		name: "plan_enter",
		label: "Enter Plan Mode",
		description: [
			"Use this tool to suggest switching to plan mode when the user's request would benefit from",
			"planning before implementation. If they explicitly mention wanting to create a plan,",
			"ALWAYS call this tool first. This tool asks the user to confirm.",
			"",
			"Call this tool when:",
			"- The user's request is complex and would benefit from planning first",
			"- You want to research and design before making changes",
			"- The task involves multiple files or significant architectural decisions",
			"",
			"Do NOT call this tool:",
			"- For simple, straightforward tasks",
			"- When the user explicitly wants immediate implementation",
		].join(" "),
		parameters: Type.Object({}),
		execute: async (_id, _params, _signal, _onUpdate, ctx) => {
			if (state.enabled) {
				return {
					content: [{ type: "text", text: "Already in plan mode." }],
					details: {},
				};
			}
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Plan mode requires interactive UI." }],
					details: {},
				};
			}
			const ok = await ctx.ui.confirm(
				"Switch to plan mode?",
				"Plan mode disables most tools except reading + writing the plan file. Use this for complex tasks that benefit from planning first.",
			);
			if (!ok) {
				return {
					content: [{ type: "text", text: "User declined to enter plan mode." }],
					details: { entered: false },
				};
			}
			enterPlanMode(ctx);
			return {
				content: [
					{
						type: "text",
						text: `Plan mode active.\n\nPlan file: ${state.planFilePath}\n\nFollow the 5-phase workflow: explore → design → review → write plan → plan_exit.`,
					},
				],
				details: { entered: true, planFilePath: state.planFilePath },
			};
		},
	});

	pi.registerTool({
		name: "plan_exit",
		label: "Exit Plan Mode",
		description: [
			"Use this tool when you have completed the planning phase and are ready to exit plan mode.",
			"This tool asks the user if they want to switch to build mode to start implementing the plan.",
			"",
			"Call this tool:",
			"- After you have written a complete plan to the plan file",
			"- After you have clarified any questions with the user",
			"- When you are confident the plan is ready for implementation",
			"",
			"Do NOT call this tool:",
			"- Before you have created or finalized the plan",
			"- If you still have unanswered questions about the implementation",
			"- If the user has indicated they want to continue planning",
		].join(" "),
		parameters: Type.Object({}),
		execute: async (_id, _params, _signal, _onUpdate, ctx) => {
			if (!state.enabled) {
				return {
					content: [{ type: "text", text: "Not in plan mode." }],
					details: {},
				};
			}
			if (!ctx.hasUI) {
				// Non-interactive: just exit, no confirm
				exitPlanMode(ctx);
				return {
					content: [{ type: "text", text: `Plan mode exited (non-interactive). Plan: ${state.planFilePath}` }],
					details: { exited: true, switchedToBuild: false },
				};
			}
			const ok = await ctx.ui.confirm(
				`Plan at ${state.planFilePath} is complete. Switch to build mode and start implementing?`,
				"Yes: switch to build mode + execute the plan.\nNo: stay in plan mode to continue refining.",
			);
			if (!ok) {
				return {
					content: [{ type: "text", text: "Staying in plan mode for refinement." }],
					details: { exited: false, switchedToBuild: false },
				};
			}
			// Verify the plan file actually exists on disk before claiming
			// it was approved. If the agent never wrote to the file (e.g.,
			// path resolution failed), surface that to the user instead of
			// sending a misleading synthetic message.
			if (!fs.existsSync(state.planFilePath)) {
				ctx.ui.notify(
					`Plan file does not exist on disk: ${state.planFilePath}. Did the agent write to it? Staying in plan mode.`,
					"warning",
				);
				return {
					content: [
						{
							type: "text",
							text: `Plan file not found at ${state.planFilePath}. Staying in plan mode so the agent can write it.`,
						},
					],
					details: { exited: false, switchedToBuild: false, planFileMissing: true },
				};
			}
			exitPlanMode(ctx);
			// Synthetic user message — mirrors OpenCode's PlanExitTool
			pi.sendUserMessage(
				`The plan at ${state.planFilePath} has been approved, you can now edit files. Execute the plan.`,
				{ deliverAs: "followUp" },
			);
			return {
				content: [
					{
						type: "text",
						text: `Switched to build mode. Plan: ${state.planFilePath}`,
					},
				],
				details: { exited: true, switchedToBuild: true, planFilePath: state.planFilePath },
			};
		},
	});

	// -------------------------------------------------------------------------
	// Permission enforcement (tool_call)
	// -------------------------------------------------------------------------

	pi.on("tool_call", async (event, ctx) => {
		if (!state.enabled) return;

		const ruleset = PLAN_AGENT_PERMISSIONS;
		const action = check(ruleset, event.toolName, event.input, cwd(ctx));

		if (action === "deny") {
			const path = extractPath(event.toolName, event.input);
			const preview = path ? truncate(path, 60) : "<no path>";
			// Surface a brief TUI notification so the user knows why the
			// tool call failed (otherwise only the LLM sees the reason).
			ctx.ui.notify(
				`Plan mode blocked: ${event.toolName} → ${preview}`,
				"warning",
			);
			return {
				block: true,
				reason: `Plan mode: \`${event.toolName}\` is not permitted. Use \`/plan-exit\` to leave plan mode first.`,
			};
		}
		if (action === "ask") {
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Plan mode: \`${event.toolName}\` requires confirmation, but no UI is available.`,
				};
			}
			const path = extractPath(event.toolName, event.input);
			const preview = path ? truncate(path, 60) : "<no path>";
			const ok = await ctx.ui.confirm(
				`Plan mode: allow \`${event.toolName}\`?`,
				`Target: ${preview}\n\nAllow this tool call in plan mode?`,
			);
			if (!ok) {
				ctx.ui.notify(`Plan mode: user denied ${event.toolName}`, "info");
				return {
					block: true,
					reason: "Plan mode: user denied permission.",
				};
			}
		}
		// "allow" → fall through
	});

	// -------------------------------------------------------------------------
	// System prompt injection
	// -------------------------------------------------------------------------

	pi.on("before_agent_start", async (_event, ctx) => {
		if (!state.enabled) return;
		if (!state.planFilePath) return;
		return {
			message: {
				customType: "plan-mode-context",
				content: buildPrompt(state.planFilePath),
				display: false,
			},
		};
	});

	// -------------------------------------------------------------------------
	// State restoration on session start
	// -------------------------------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		// --plan-mode flag: start in plan mode
		const startInPlanMode = pi.getFlag("plan-mode") === true;
		const planFileOverride = readPlanFileFlag(pi.getFlag("plan-file"), ctx);

		// Resolve the plan-file path either from --plan-file or from defaults.
		const sessionName = ctx.sessionManager.getSessionName();
		const sessionId = ctx.sessionManager.getSessionId();
		const inputs: PlanPathInputs = {
			override: planFileOverride,
			cwd: cwd(ctx),
			slug: deriveSlug(sessionName, sessionId),
		};
		state.planFilePath = resolvePlanPath(inputs);

		// Restore persisted state from session entries (if any). We scan once
		// and cache the last plan-mode-state entry rather than rescanning
		// getEntries() per event.
		const lastStateEntry = findLastPlanModeStateEntry(ctx.sessionManager.getEntries());
		const persistedEnabled = lastStateEntry?.data?.enabled === true;

		state.enabled = startInPlanMode || persistedEnabled;
		if (state.enabled) {
			// Enter plan mode (swaps tools + persists state)
			enterPlanMode(ctx);
		} else {
			// Persist state anyway so the resolved plan-file path is recorded
			// in the session (resume / inspection will see it).
			persistState(ctx);
			updateStatus(ctx);
		}
	});
}

/** Read and validate the --plan-file flag value. Returns undefined if
 *  the value is missing, empty, or exceeds the length limit. Surfaces
 *  a UI warning if rejected (best-effort — falls back to the default
 *  plan-path resolution in that case). */
function readPlanFileFlag(
	raw: boolean | string | undefined,
	ctx: ExtensionContext,
): string | undefined {
	if (raw === undefined || raw === "") return undefined;
	if (typeof raw !== "string") return undefined;
	if (raw.length > MAX_PLAN_FILE_FLAG_LENGTH) {
		ctx.ui.notify(
			`--plan-file value is too long (${raw.length} chars, max ${MAX_PLAN_FILE_FLAG_LENGTH}). Falling back to default path.`,
			"warning",
		);
		return undefined;
	}
	return raw;
}

/** Scan session entries linearly and return the most recent
 *  `plan-mode-state` entry, or undefined if none. */
function findLastPlanModeStateEntry(
	entries: readonly unknown[],
): { data?: { enabled?: boolean; [k: string]: unknown } } | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type?: string; customType?: string };
		if (e?.type === "custom" && e.customType === SESSION_ENTRY_TYPE) {
			return e as { data?: { enabled?: boolean; [k: string]: unknown } };
		}
	}
	return undefined;
}

// =============================================================================
// Helpers (continued — moved out of main export to keep closure clean)
// =============================================================================

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 3)}...`;
}