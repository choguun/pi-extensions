/**
 * AIDLC Workflow Extension
 *
 * Registers the `aidlc` tool and the per-phase slash commands
 * (/specify, /plan, /implement, /test, /review, /ship, /aidlc-status).
 *
 * State is maintained in two places:
 *   1. Local: .aidlc/state.md in the project root
 *   2. Remote: branch + PR (title, description, comments) on GitHub
 *
 * The tool provides thin glue around the `gh` CLI so each phase can
 * read/write both state sources. The heavy lifting (the actual workflow
 * logic) lives in the skills and agents — the tool just orchestrates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AIDLC_DIR = ".aidlc";
const STATE_FILE = ".aidlc/state.md";

// =============================================================================
// Helpers
// =============================================================================

/** Run a shell command, return stdout. Throws on non-zero exit. */
function run(cmd: string, cwd: string = process.cwd()): string {
	return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Run a shell command, return stdout. Returns null on failure (no throw). */
function tryRun(cmd: string, cwd: string = process.cwd()): string | null {
	try {
		return run(cmd, cwd);
	} catch {
		return null;
	}
}

/** Run `gh` command. Returns null if `gh` is not installed or the command fails. */
function gh(args: string, cwd: string = process.cwd()): string | null {
	return tryRun(`gh ${args}`, cwd);
}

/** Check if a file exists. */
function exists(p: string): boolean {
	try {
		fs.accessSync(p);
		return true;
	} catch {
		return false;
	}
}

/** Read file as string, or null if it doesn't exist. */
function readFile(p: string): string | null {
	try {
		return fs.readFileSync(p, "utf-8");
	} catch {
		return null;
	}
}

/** Write string to file, creating parent dirs if needed. */
function writeFile(p: string, content: string): void {
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content);
}

/** Extract a section from markdown by `## Heading`. */
function extractSection(md: string, heading: string): string | null {
	const re = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |\\Z)`, "m");
	const m = md.match(re);
	return m ? m[1].trim() : null;
}

/** Parse `.aidlc/state.md` — flat key/value format. */
interface AidlcState {
	phase: string;
	branch: string | null;
	pr: string | null; // PR number
	lastAction: string;
	nextAction: string;
	notes: string;
	[key: string]: string | null;
}

/**
 * Map source-file keys (snake_case, as the human writes them) to the
 * TypeScript field names (camelCase). This avoids the bug where
 * `last_action` from the file was stored on `result.last_action` but
 * read from `result.lastAction` (returning the default empty string).
 */
const SNAKE_TO_CAMEL: Record<string, string> = {
	last_action: "lastAction",
	next_action: "nextAction",
};

function parseState(md: string): AidlcState {
	const result: AidlcState = {
		phase: "unknown",
		branch: null,
		pr: null,
		lastAction: "",
		nextAction: "",
		notes: "",
	};
	for (const line of md.split("\n")) {
		const m = line.match(/^[-*]?\s*\*\*([^*]+)\*\*:\s*(.+)$/);
		if (m) {
			const snakeKey = m[1].trim().toLowerCase().replace(/\s+/g, "_");
			const value = m[2].trim();
			const camelKey = SNAKE_TO_CAMEL[snakeKey] ?? snakeKey;
			if (camelKey in result || ["phase", "branch", "pr", "last_action", "next_action", "notes"].includes(snakeKey)) {
				(result as Record<string, string>)[camelKey] = value;
			}
		}
	}
	return result;
}

function renderState(state: AidlcState): string {
	const lines: string[] = ["# AIDLC State", ""];
	for (const [key, value] of Object.entries(state)) {
		if (value === null || value === undefined || value === "") continue;
		const displayKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		lines.push(`- **${displayKey}**: ${value}`);
	}
	lines.push("", `_Updated: ${new Date().toISOString()}_`);
	return lines.join("\n") + "\n";
}

// =============================================================================
// State read/write
// =============================================================================

function readAidlcState(cwd: string): AidlcState {
	const md = readFile(path.join(cwd, STATE_FILE));
	return md ? parseState(md) : { phase: "not_started", branch: null, pr: null, lastAction: "", nextAction: "", notes: "" };
}

function writeAidlcState(cwd: string, state: AidlcState): void {
	writeFile(path.join(cwd, STATE_FILE), renderState(state));
}

function updateAidlcState(cwd: string, updates: Partial<AidlcState>): AidlcState {
	const current = readAidlcState(cwd);
	const next: AidlcState = { ...current, ...updates, lastAction: new Date().toISOString() };
	writeAidlcState(cwd, next);
	return next;
}

// =============================================================================
// GitHub integration
// =============================================================================

/** Get the current branch (or null if detached). */
function currentBranch(cwd: string): string | null {
	return tryRun("git rev-parse --abbrev-ref HEAD", cwd);
}

/** Check if the current branch has an open PR. Returns PR number or null. */
function openPRForBranch(cwd: string): string | null {
	const branch = currentBranch(cwd);
	if (!branch) return null;
	const out = gh(`pr list --head ${branch} --state open --json number --jq '.[0].number // empty'`, cwd);
	if (!out || out === "empty" || out === "") return null;
	const n = parseInt(out, 10);
	return isNaN(n) ? null : String(n);
}

/** Get PR title, body, and review comments as JSON. */
function getPRContext(cwd: string, prNumber: string): {
	title: string;
	body: string;
	comments: Array<{ author: string; body: string; createdAt: string; isReview: boolean }>;
	reviewDecision: string;
} | null {
	const json = gh(`pr view ${prNumber} --json title,body,reviewDecision`, cwd);
	if (!json) return null;
	const meta = JSON.parse(json);

	// Issue comments
	const issueCommentsJson = gh(`api repos/:owner/:repo/issues/${prNumber}/comments --paginate`, cwd);
	let issueComments: Array<{ author: { login: string }; body: string; created_at: string }> = [];
	try {
		issueComments = JSON.parse(issueCommentsJson ?? "[]");
	} catch {
		issueComments = [];
	}

	// Review comments (on the diff)
	const reviewCommentsJson = gh(`api repos/:owner/:repo/pulls/${prNumber}/comments --paginate`, cwd);
	let reviewComments: Array<{ user: { login: string }; body: string; created_at: string }> = [];
	try {
		reviewComments = JSON.parse(reviewCommentsJson ?? "[]");
	} catch {
		reviewComments = [];
	}

	const comments = [
		...issueComments.map((c) => ({
			author: c.author?.login ?? "unknown",
			body: c.body,
			createdAt: c.created_at,
			isReview: false,
		})),
		...reviewComments.map((c) => ({
			author: c.user?.login ?? "unknown",
			body: c.body,
			createdAt: c.created_at,
			isReview: true,
		})),
	];

	return {
		title: meta.title ?? "",
		body: meta.body ?? "",
		comments,
		reviewDecision: meta.reviewDecision ?? "",
	};
}

/** Classify a comment into a routing action. */
function classifyComment(
	body: string,
	author: string,
): { phase: string; priority: "P0" | "P1" | "P2"; reason: string } {
	const lower = body.toLowerCase();

	// Test failure
	if (/\b(test|tests|spec|build|failing|failed|failure)\b/.test(lower) && /\b(fail|broken|error)\b/.test(lower)) {
		return { phase: "test", priority: "P1", reason: "Test/build failure mentioned" };
	}

	// Test/coverage request
	if (/\b(add|need|missing|where).*(test|coverage|spec)\b/.test(lower)) {
		return { phase: "test", priority: "P1", reason: "Test/coverage missing" };
	}

	// Real bug
	if (/\b(bug|broken|race|leak|crash|overflow|panic|null pointer)\b/.test(lower)) {
		return { phase: "implement", priority: "P0", reason: "Real bug reported" };
	}

	// Security
	if (/\b(security|cve|injection|xss|csrf|vuln)\b/.test(lower)) {
		return { phase: "implement", priority: "P0", reason: "Security issue" };
	}

	// Spec/requirements
	if (/\b(spec|requirement|missing requirement|out of scope|scope creep)\b/.test(lower)) {
		return { phase: "specify", priority: "P1", reason: "Spec/requirements issue" };
	}

	// Architecture/design
	if (/\b(design|architect|refactor|abstraction|coupling|simplif)\b/.test(lower)) {
		return { phase: "implement", priority: "P2", reason: "Design/refactor suggestion" };
	}

	// Style/nit
	if (/\b(nit|naming|comment|typo|doc|style|format)\b/.test(lower)) {
		return { phase: "implement", priority: "P2", reason: "Style nit" };
	}

	// Default: needs human review
	return { phase: "review", priority: "P2", reason: "Needs human classification" };
}

// =============================================================================
// Commands
// =============================================================================

const PhaseSchema = Type.Union([
	Type.Literal("not_started"),
	Type.Literal("specifying"),
	Type.Literal("planning"),
	Type.Literal("implementing"),
	Type.Literal("testing"),
	Type.Literal("reviewing"),
	Type.Literal("shipping"),
]);

const AidlcParams = Type.Object({
	action: Type.String({
		description: "Action: start, status, sync, classify-comments, next",
	}),
	feature: Type.Optional(Type.String({ description: "Feature name (for 'start')" })),
});

// =============================================================================
// Extension entry
// =============================================================================

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "aidlc",
		label: "AIDLC",
		description:
			"AI-Driven Development Life Cycle orchestrator. Tracks state across the spec → plan → implement → test → review → ship pipeline. Reads/writes `.aidlc/state.md` and the GitHub PR. Use to start a new feature, check status, or classify review comments.",
		parameters: AidlcParams,

		async execute(_id, params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			const action = params.action.toLowerCase().trim();

			if (action === "status") {
				const state = readAidlcState(cwd);
				const branch = currentBranch(cwd);
				const pr = openPRForBranch(cwd);
				let prSummary = "(no open PR)";
				if (pr) {
					const ctx = getPRContext(cwd, pr);
					if (ctx) {
						const lastComment = ctx.comments[ctx.comments.length - 1];
						prSummary = `PR #${pr}: ${ctx.title}\n  Review: ${ctx.reviewDecision || "none"}\n  Comments: ${ctx.comments.length}${lastComment ? `\n  Last: ${lastComment.author} — ${lastComment.body.slice(0, 100)}` : ""}`;
					}
				}
				return {
					content: [
						{
							type: "text",
							text: [
								`**AIDLC Status**`,
								``,
								`- Phase: ${state.phase}`,
								`- Branch: ${branch ?? "(detached)"}`,
								`- PR: ${pr ?? "(none)"}`,
								`- Last action: ${state.lastAction || "—"}`,
								`- Next action: ${state.nextAction || "—"}`,
								``,
								`**PR context:**`,
								prSummary,
							].join("\n"),
						},
					],
					details: { phase: state.phase, branch, pr },
				};
			}

			if (action === "start") {
				const feature = params.feature?.trim();
				if (!feature) {
					return {
						content: [{ type: "text", text: "Error: `feature` is required for `start`. Usage: /aidlc start \"Add rate limiting to API\"" }],
						isError: true,
					};
				}

				// Create branch from main. `tryRun` returns `null` on failure
				// (e.g. branch already exists, no commits, no main). An empty
				// string is success with no output — do NOT treat it as failure.
				const slug = feature
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-+|-+$/g, "")
					.slice(0, 50);
				const branchName = `feat/${slug}`;
				const branchResult = tryRun(`git checkout -b ${branchName} main`, cwd);
				if (branchResult === null) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to create branch ${branchName}. Did you commit your changes and is 'main' the default branch?`,
							},
						],
						isError: true,
					};
				}

				// Initialize AIDLC state
				const state = updateAidlcState(cwd, {
					phase: "specifying",
					branch: branchName,
					pr: null,
					nextAction: "Run /specify to write the spec",
					notes: feature,
				});

				// Create draft PR so the rest of the workflow can update it
				const prOut = tryRun(
					`gh pr create --draft --base main --head ${branchName} --title "[aidlc] ${feature}" --body "Work in progress. This PR is the workspace for the AIDLC workflow.\\n\\nSee \`.aidlc/state.md\` for current state."`,
					cwd,
				);
				const prNum = openPRForBranch(cwd);
				if (prNum) {
					updateAidlcState(cwd, { pr: prNum });
				}

				return {
					content: [
						{
							type: "text",
							text: [
								`**AIDLC started**`,
								``,
								`- Branch: \`${branchName}\``,
								`- PR: ${prNum ? `#${prNum}` : "(not created — try manually)"}`,
								`- Phase: specifying`,
								``,
								`Next: \`/specify\` to write the spec, or read the \`aidlc-workflow\` skill for the full workflow.`,
							].join("\n"),
						},
					],
					details: { branch: branchName, pr: prNum, state },
				};
			}

			if (action === "classify-comments" || action === "classify") {
				const state = readAidlcState(cwd);
				if (!state.pr) {
					return {
						content: [{ type: "text", text: "No open PR. Run `/aidlc start` first or set the PR number." }],
						isError: true,
					};
				}
				const ctx = getPRContext(cwd, state.pr);
				if (!ctx || ctx.comments.length === 0) {
					return {
						content: [{ type: "text", text: `No comments on PR #${state.pr}.` }],
					};
				}

				const classified = ctx.comments.map((c) => ({
					...c,
					classification: classifyComment(c.body, c.author),
				}));

				// Group by phase
				const byPhase: Record<string, typeof classified> = {};
				for (const c of classified) {
					(byPhase[c.classification.phase] ??= []).push(c);
				}

				const lines: string[] = [`**PR #${state.pr} comments — classified**`, ""];
				for (const [phase, items] of Object.entries(byPhase)) {
					lines.push(`### \`${phase}\` (${items.length})`);
					for (const c of items) {
						lines.push(`- [${c.classification.priority}] ${c.author}: ${c.body.slice(0, 120)}…`);
					}
					lines.push("");
				}

				// Recommend the next phase
				const priorityOrder = ["P0", "P1", "P2"];
				const allByPhase = Object.entries(byPhase).sort(([a, itemsA], [b, itemsB]) => {
					const maxA = Math.min(...itemsA.map((c) => priorityOrder.indexOf(c.classification.priority)));
					const maxB = Math.min(...itemsB.map((c) => priorityOrder.indexOf(c.classification.priority)));
					return maxA - maxB;
				});
				if (allByPhase.length > 0) {
					lines.push(`**Recommended next phase:** \`${allByPhase[0][0]}\` (highest priority comments)`);
				}

				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: { byPhase, total: classified.length },
				};
			}

			if (action === "next") {
				const state = readAidlcState(cwd);
				const phaseCommands: Record<string, string> = {
					specifying: "/specify",
					planning: "/plan",
					implementing: "/implement",
					testing: "/test",
					reviewing: "/review",
					shipping: "/ship",
				};
				const cmd = phaseCommands[state.phase] ?? "/aidlc start \"<feature>\"";

				// Check PR for new review comments
				if (state.pr) {
					const ctx = getPRContext(cwd, state.pr);
					if (ctx && ctx.comments.length > 0) {
						return {
							content: [
								{
									type: "text",
									text: [
										`**PR #${state.pr} has ${ctx.comments.length} comment(s).**`,
										`Run \`/aidlc classify-comments\` to route them to the right phase.`,
										``,
										`Current phase: ${state.phase} → \`${cmd}\``,
									].join("\n"),
								},
							],
						};
					}
				}

				return {
					content: [
						{
							type: "text",
							text: [
								`**Next action**`,
								``,
								`Phase: ${state.phase}`,
								`Command: \`${cmd}\``,
								``,
								`Next action from state: ${state.nextAction || "—"}`,
							].join("\n"),
						},
					],
				};
			}

			if (action === "sync") {
				// Sync .aidlc/state.md from the actual PR/branch state
				const branch = currentBranch(cwd);
				const pr = openPRForBranch(cwd);
				const state = updateAidlcState(cwd, {
					branch: branch,
					pr: pr,
				});
				return {
					content: [
						{
							type: "text",
							text: [
								`**State synced from Git**`,
								``,
								`- Branch: ${branch ?? "(detached)"}`,
								`- PR: ${pr ?? "(none)"}`,
								``,
								`Updated \`.aidlc/state.md\`.`,
							].join("\n"),
						},
					],
					details: { state },
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Unknown action: ${action}. Use: status, start, sync, classify-comments, next`,
					},
				],
				isError: true,
			};
		},
	});

	// Slash commands that wrap the skill invocations.
	const phaseCommands: Array<{
		name: string;
		description: string;
		phase: string;
		help: string;
	}> = [
		{ name: "specify", description: "Write the spec for the current AIDLC feature", phase: "specifying", help: "Reads .aidlc/state.md + the issue brief, writes .aidlc/spec.md, commits, pushes" },
		{ name: "plan", description: "Break the spec into ordered tasks", phase: "planning", help: "Reads .aidlc/spec.md, writes .aidlc/plan.md, commits, pushes" },
		{ name: "implement", description: "Implement a specific task from the plan", phase: "implementing", help: "Usage: /implement T-001 — finds the task, runs TDD, commits" },
		{ name: "test", description: "Run the test suite and address failures", phase: "testing", help: "Runs the project's test command, fixes breakages, commits" },
		{ name: "review", description: "Read PR review comments and route them to phases", phase: "reviewing", help: "Pulls PR comments, classifies, dispatches sub-agent for fixes" },
		{ name: "ship", description: "Mark PR ready and trigger merge", phase: "shipping", help: "Marks PR ready-for-review, updates state to shipped" },
		{ name: "aidlc-status", description: "Show current AIDLC state", phase: "*", help: "Reads .aidlc/state.md + the PR, shows where we are" },
	];

	for (const cmd of phaseCommands) {
		pi.registerCommand(cmd.name, {
			description: cmd.description,
			handler: async (args, ctx) => {
				// The handler emits a directive message; pi will then load the
				// corresponding skill (registered separately) for the heavy lifting.
				const skillName =
					cmd.name === "aidlc-status" ? "aidlc-workflow" : cmd.name;
				return [
					{
						type: "text",
						text: [
							`/aidlc ${cmd.phase} → load \`${skillName}\` skill`,
							``,
							cmd.help,
							args ? `\nArguments: ${args}` : "",
						]
							.filter(Boolean)
							.join("\n"),
						// Hint to load the skill by emitting a `skill:load`-shaped
						// hint. The actual skill loading is handled by pi when the
						// user invokes the slash command — the skill auto-loads
						// based on its description.
					},
				];
			},
		});
	}
}
