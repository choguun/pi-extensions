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
import { classifyComment } from "./classifier.ts";
import { upsertSignal, listSignals, slugify, classifyCategory, appendLogEntry, formatLogEntry } from "./substrate.ts";
import { setupWorktree, listWorktrees } from "./worktree.ts";

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

/** Read and parse package.json (Node projects only). Returns null if missing. */
function readPackageJson(cwd: string): { scripts?: Record<string, string> } | null {
	const raw = readFile(path.join(cwd, "package.json"));
	if (!raw) return null;
	try {
		return JSON.parse(raw);
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

/**
 * Map camelCase/snake_case field names to the sentence-case display
 * label used in state.md. Centralized so writer and reader agree on
 * the canonical format. (`parseState` is case-insensitive, so any
 * casing works for READING, but writing is a one-way contract — if
 * the writer emits a form the reader doesn't know about, the value
 * is silently dropped on the next parse.)
 */
const DISPLAY_KEY: Record<string, string> = {
	phase: "Phase",
	branch: "Branch",
	pr: "PR",
	lastAction: "Last action",
	nextAction: "Next action",
	notes: "Notes",
};

function renderState(state: AidlcState): string {
	const lines: string[] = ["# AIDLC State", ""];
	for (const [key, value] of Object.entries(state)) {
		if (value === null || value === undefined || value === "") continue;
		// Look up the canonical display label; fall back to a generic
		// title-case conversion for unknown keys (forward-compat).
		const displayKey =
			DISPLAY_KEY[key] ??
			key
				.replace(/_/g, " ")
				.replace(/([a-z])([A-Z])/g, "$1 $2")
				.replace(/^./, (c) => c.toUpperCase());
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
	// Atomic write: write to a .tmp file in the same directory, then
	// rename. If the process crashes mid-write, the user still has the
	// old state.md intact. `rename` is atomic on POSIX when src/dst are
	// on the same filesystem (same dir is guaranteed here).
	const target = path.join(cwd, STATE_FILE);
	const tmp = target + ".tmp";
	writeFile(tmp, renderState(state));
	fs.renameSync(tmp, target);
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

/**
 * Detect the default branch of the repo.
 *
 * Tries, in order:
 *   1. `git symbolic-ref refs/remotes/origin/HEAD` — what `gh repo view`
 *      would return, set by `gh repo set-default`.
 *   2. The current branch (e.g. user is on main when starting a feature).
 *   3. Literal `"main"` — the historical default in git itself.
 *
 * Different repos use different defaults (main, master, trunk, develop,
 * gh-pages, etc.). Don't hardcode.
 */
export function detectDefaultBranch(cwd: string): string {
	return (
		tryRun("git symbolic-ref refs/remotes/origin/HEAD", cwd)?.replace(
			"refs/remotes/origin/",
			"",
		) ??
		currentBranch(cwd) ??
		"main"
	);
}

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

	// Issue comments. `--paginate --slurp` returns a JSON array of arrays
	// (`[[page1], [page2], …]`); `--paginate` alone concatenates raw JSON
	// which produces `}][{` between pages and silently fails JSON.parse
	// for any PR with >30 (default page size) comments.
	const issueCommentsJson = gh(
		`api repos/:owner/:repo/issues/${prNumber}/comments --paginate --slurp`,
		cwd,
	);
	let issueComments: Array<{ author: { login: string }; body: string; created_at: string }> = [];
	try {
		const pages = JSON.parse(issueCommentsJson ?? "[]");
		issueComments = Array.isArray(pages) ? pages.flat() : [];
	} catch {
		issueComments = [];
	}

	// Review comments (on the diff) — same `--slurp` fix.
	const reviewCommentsJson = gh(
		`api repos/:owner/:repo/pulls/${prNumber}/comments --paginate --slurp`,
		cwd,
	);
	let reviewComments: Array<{ user: { login: string }; body: string; created_at: string }> = [];
	try {
		const pages = JSON.parse(reviewCommentsJson ?? "[]");
		reviewComments = Array.isArray(pages) ? pages.flat() : [];
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
	Type.Literal("shipped"),
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
						details: {},
					};
				}

				// Create branch from the default branch. Detect the default
				// dynamically (some repos use `master`, some `main`, some
				// `trunk`, some `develop`) so this works in any repo.
				const slug = feature
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-+|-+$/g, "")
					.slice(0, 50);
				const branchName = `feat/${slug}`;
				const defaultBranch = detectDefaultBranch(cwd);

				// Worktree discipline (borrowed from loop-engineer):
				// each feature gets its own worktree so parallel agents
				// don't collide. Sibling dir `<repo>-worktrees/<branch>`.
				// Falls back to in-place branch if worktree creation fails
				// (e.g. no parent write permission).
				let worktreePath: string | null = null;
				let worktreeSetupError: string | null = null;
				try {
					const wt = setupWorktree({
						repoRoot: cwd,
						branch: branchName,
						baseRef: defaultBranch,
					});
					worktreePath = wt.worktreePath;
				} catch (err) {
					worktreeSetupError = err instanceof Error ? err.message : String(err);
				}

				// Fallback path: in-place branch on main checkout.
				if (worktreePath === null) {
					const branchResult = tryRun(`git checkout -b ${branchName} ${defaultBranch}`, cwd);
					if (branchResult === null) {
						return {
							content: [
								{
									type: "text",
									text: `Failed to create branch ${branchName} from '${defaultBranch}'. Worktree error: ${worktreeSetupError}. Check that the repo is on a branch with commits and that '${defaultBranch}' exists.`,
								},
							],
							isError: true,
							details: {},
						};
					}
				}

				// State lives in the original checkout (where .aidlc/state.md
				// belongs). Worktrees share the .git directory, so commits
				// from the worktree are visible here.
				const stateCwd = cwd;

				// Initialize AIDLC state
				const state = updateAidlcState(stateCwd, {
					phase: "specifying",
					branch: branchName,
					pr: null,
					nextAction: "Run /specify to write the spec",
					notes: feature,
				});

				// Create draft PR so the rest of the workflow can update it.
// SECURITY: the `feature` string is LLM-supplied free text. Strip shell
// metacharacters and embed in single quotes (POSIX shell escaping) to
// prevent injection even though the only caller is an LLM. The branch
// name is already sanitized to `[a-z0-9-]` via `slug`.
				const safeFeature = feature
					.replace(/[\n\r"\\$`!]/g, "")
					.replace(/'/g, "'\\''"); // close-quote, escaped quote, reopen
				const safeTitle = `'[aidlc] ${safeFeature}'`;
				// Backticks in the body string are escaped so the surrounding
				// template literal parses cleanly.
				const safeBody = `'Work in progress. This PR is the workspace for the AIDLC workflow.\n\nSee \`.aidlc/state.md\` for current state.'`;
				const prOut = tryRun(
					`gh pr create --draft --base ${defaultBranch} --head ${branchName} --title ${safeTitle} --body ${safeBody}`,
					cwd,
				);
				const prNum = openPRForBranch(cwd);
				if (prNum) {
					updateAidlcState(stateCwd, { pr: prNum });
				}

				const worktreeNote = worktreePath
					? `- Worktree: \`${worktreePath}\``
					: `- Worktree: (none — working in main checkout)`;

				return {
					content: [
						{
							type: "text",
							text: [
								`**AIDLC started**`,
								``,
								`- Branch: \`${branchName}\``,
								worktreeNote,
								`- PR: ${prNum ? `#${prNum}` : "(not created — try manually)"}`,
								`- Phase: specifying`,
								``,
								`Next: \`/specify\` to write the spec, or read the \`aidlc-workflow\` skill for the full workflow.`,
							].join("\n"),
						},
					],
					details: { branch: branchName, pr: prNum, worktreePath, state },
				};
			}

			if (action === "classify-comments" || action === "classify") {
				const state = readAidlcState(cwd);
				if (!state.pr) {
					return {
						content: [{ type: "text", text: "No open PR. Run `/aidlc start` first or set the PR number." }],
						isError: true,
						details: {},
					};
				}
				const ctx = getPRContext(cwd, state.pr);
				if (!ctx || ctx.comments.length === 0) {
					return {
						content: [{ type: "text", text: `No comments on PR #${state.pr}.` }],
						details: {},
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

			if (action === "triage") {
				// Bridge: classifier → signals/. For each classified
				// PR comment, slugify the body and either create a new
				// signal or update an existing one (bump frequency,
				// append Timeline). Same dedup contract as
				// `signal-triage/SKILL.md`.
				const state = readAidlcState(cwd);
				if (!state.pr) {
					return {
						content: [{ type: "text", text: "No open PR. Run `/aidlc start` first or set the PR number." }],
						isError: true,
						details: {},
					};
				}
				const ctx = getPRContext(cwd, state.pr);
				if (!ctx || ctx.comments.length === 0) {
					return {
						content: [{ type: "text", text: `No comments on PR #${state.pr} to triage.` }],
						details: { created: 0, updated: 0 },
					};
				}

				const domain = path.basename(cwd);
				let created = 0;
				let updated = 0;
				const results: string[] = [];

				for (const c of ctx.comments) {
					const classification = classifyComment(c.body, c.author);
					// Skip pure style nits from automatic triage — they
					// pollute the signal pool. Style fixes go in the PR
					// review, not the knowledge base.
					if (classification.priority === "P2" && classification.reason.includes("Style")) {
						continue;
					}
					const slug = slugify(`${classification.reason} ${c.body.slice(0, 100)}`);
					const sourceUrl = `https://github.com/${state.pr}`;
					const { signal, created: wasCreated } = upsertSignal(cwd, slug, {
						category: classifyCategory(classification.reason),
						sources: [sourceUrl],
						domain: [domain],
						classification,
						body: c.body,
					});
					if (wasCreated) created++;
					else updated++;
					results.push(`${wasCreated ? "+" : "~"} ${slug} (P${signal.priority.slice(1)}, freq=${signal.frequency}, ${classification.reason})`);
				}

				// Append to LOG.md if anything changed
				if (created + updated > 0) {
					const logPath = path.join(cwd, "LOG.md");
					if (fs.existsSync(logPath)) {
						appendLogEntry(
							logPath,
							formatLogEntry({
								date: new Date().toISOString().slice(0, 10),
								title: `Triaged ${created + updated} signals for ${domain}`,
								tags: ["signal", "aidlc"],
								what: `${created} new signals + ${updated} updated (frequency bumped).`,
								refs: ["signals/"],
							}),
						);
					}
				}

				return {
					content: [
						{
							type: "text",
							text: [
								`**Triage results for PR #${state.pr}**`,
								``,
								`Created: ${created}`,
								`Updated: ${updated}`,
								``,
								...results.slice(0, 20),
								results.length > 20 ? `... (${results.length - 20} more)` : "",
							]
								.filter(Boolean)
								.join("\n"),
						},
					],
					details: { created, updated, total: results.length, domain },
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
							details: {},
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
					details: {},
				};
			}

			if (action === "verify") {
				// Verify-before-PR gate (borrowed from loop-engineer's
				// `/pr` skill). Run the project's local checks — typecheck,
				// lint, tests. Only open a PR if all pass.
				//
				// We intentionally run lightweight, scoped checks (not a
				// full build) so verification is fast. The full e2e
				// verification (driving the running app) is delegated to
				// the target repo's own /pr skill if it has one — see the
				// `hasPrSkill` note in setup-codebase-harness.
				const pkg = readPackageJson(cwd);
				const checks: Array<{ name: string; cmd: string; ok: boolean; note?: string }> = [];

				if (pkg?.scripts?.["typecheck"]) {
					const out = tryRun("npm run typecheck 2>&1", cwd);
					checks.push({
						name: "typecheck",
						cmd: "npm run typecheck",
						ok: out !== null,
						note: out ?? "command exited non-zero",
					});
				} else if (pkg?.scripts?.["build"]) {
					const out = tryRun("npm run build 2>&1", cwd);
					checks.push({
						name: "build",
						cmd: "npm run build",
						ok: out !== null,
						note: out ?? "command exited non-zero",
					});
				} else {
					checks.push({
						name: "typecheck-or-build",
						cmd: "(none)",
						ok: false,
						note: "package.json has no typecheck or build script",
					});
				}

				if (pkg?.scripts?.["test"]) {
					const out = tryRun("npm test 2>&1", cwd);
					checks.push({
						name: "test",
						cmd: "npm test",
						ok: out !== null,
						note: out ?? "command exited non-zero",
					});
				} else {
					checks.push({ name: "test", cmd: "(none)", ok: false, note: "package.json has no test script" });
				}

				if (pkg?.scripts?.["lint"]) {
					const out = tryRun("npm run lint 2>&1", cwd);
					checks.push({
						name: "lint",
						cmd: "npm run lint",
						ok: out !== null,
						note: out ?? "command exited non-zero",
					});
				}

				const passed = checks.every((c) => c.ok);
				const summary = passed
					? "All checks passed — safe to /ship."
					: `${checks.filter((c) => !c.ok).length} check(s) failed — fix before /ship.`;

				return {
					content: [
						{
							type: "text",
							text: [
								`**Verify-before-PR gate**`,
								``,
								...checks.map((c) => `- ${c.ok ? "✔" : "✖"} ${c.name}: ${c.cmd}${c.note ? ` (${c.note.slice(0, 100)})` : ""}`),
								``,
								`**${summary}**`,
							].join("\n"),
						},
					],
					details: { passed, checks },
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
				details: {},
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
				// The handler returns Promise<void> — pi discards the return
				// value. To actually trigger the skill we must inject a user
				// message via `pi.sendUserMessage`. The skill name maps to the
				// matching `skills/<name>/SKILL.md` registered separately.
				const skillName = cmd.name === "aidlc-status" ? "aidlc-workflow" : cmd.name;
				const directive = args ? `/${cmd.name} ${args}` : `/${cmd.name}`;

				if (ctx.isIdle && !ctx.isIdle()) {
					ctx.ui.notify(`Agent is busy — try ${directive} once the current turn finishes`, "warning");
					return;
				}

				try {
					pi.sendUserMessage(directive);
				} catch (err) {
					ctx.ui.notify(
						`Failed to invoke ${skillName}`,
						"warning",
					);
				}
			},
		});
	}
}
