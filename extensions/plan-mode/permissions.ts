/**
 * Permission ruleset engine for plan mode.
 *
 * Mirrors OpenCode's `Permission` model
 * (packages/opencode/src/permission/index.ts in the opencode repo):
 *   - Each rule = `{ tool, pattern?, patternKind?, action }`
 *   - Default action for unmatched tools is "allow"
 *   - More specific rules win: exact tool-name > "*", pattern > no-pattern
 *   - Within the same specificity, the rule listed first wins
 *
 * Two pattern kinds:
 *   - "glob" (default): standard minimatch-like semantics
 *       `*` matches any chars except `/`
 *       `**` matches any chars including `/`
 *   - "regex": the pattern is a JavaScript RegExp source
 *
 * Pi doesn't have a built-in per-tool, per-pattern permission system
 * like OpenCode does — its extension API gives us `setActiveTools()`
 * (per-tool on/off) and `tool_call` events (can block). We implement
 * OpenCode's pattern ruleset as a pure data structure evaluated by the
 * `tool_call` handler in index.ts.
 */

export type PermissionAction = "allow" | "deny" | "ask";
export type PatternKind = "glob" | "regex";

export interface PermissionRule {
	/** Tool name, or "*" for default. */
	tool: string;
	/** Glob or regex pattern matched against the relevant path argument.
	 *  - edit/write/read: matched against file_path / path
	 *  - bash: matched against command
	 *  - other: ignored unless the tool has a `command` / `path` arg */
	pattern?: string;
	/** "glob" (default) or "regex". */
	patternKind?: PatternKind;
	action: PermissionAction;
}

export interface PermissionRuleset {
	rules: PermissionRule[];
}

// =============================================================================
// Glob matching (minimatch-like semantics).
// `*` matches any chars except `/`. `**` matches any chars including `/`.
// =============================================================================

export function globToRegex(glob: string): RegExp {
	// First, split on unescaped `**` and process each segment separately.
	// This is simpler than tracking state.
	let regex = "^";
	let i = 0;
	while (i < glob.length) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				// ** matches anything (including /)
				regex += ".*";
				i += 2;
				// Consume trailing slash so `**/` matches zero or more segments
				if (glob[i] === "/") i++;
			} else {
				// * matches anything except /
				regex += "[^/]*";
				i++;
			}
		} else if (c === "?") {
			regex += "[^/]";
			i++;
		} else if (c === "." || c === "(" || c === ")" || c === "+" || c === "|" || c === "^" || c === "$" || c === "{") {
			regex += `\\${c}`;
			i++;
		} else if (c === "\\") {
			// Escape sequence (e.g., `\*`)
			if (i + 1 < glob.length) {
				regex += `\\${glob[i + 1]}`;
				i += 2;
			} else {
				regex += "\\\\";
				i++;
			}
		} else {
			regex += c;
			i++;
		}
	}
	regex += "$";
	return new RegExp(regex);
}

export function matchGlob(glob: string, value: string): boolean {
	return globToRegex(glob).test(value);
}

// =============================================================================
// Path extraction
// =============================================================================

/** Extract the path-like argument from a tool call. Returns undefined if
 *  no obvious path arg exists for the tool. */
export function extractPath(toolName: string, args: Record<string, unknown>): string | undefined {
	switch (toolName) {
		case "edit":
		case "write":
		case "read":
			return (args.file_path ?? args.path) as string | undefined;
		case "bash":
			return args.command as string | undefined;
		default:
			return undefined;
	}
}

/** Resolve a possibly-relative path against cwd. Pure (no fs). */
export function resolvePath(target: string, cwd: string): string {
	if (target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target)) return target;
	const cleaned = target.replace(/^\.\//, "");
	return joinPath(cwd, cleaned);
}

/** Tiny path.join replacement so we don't need to import node:path for
 *  the pure module. Handles trailing slashes correctly. */
function joinPath(...parts: string[]): string {
	const filtered = parts.filter((p) => p.length > 0);
	if (filtered.length === 0) return "";
	const isAbsolute = filtered[0]?.startsWith("/") ?? false;
	const segments: string[] = [];
	for (const part of filtered) {
		for (const seg of part.split("/")) {
			if (seg === "" || seg === ".") continue;
			if (seg === "..") {
				if (segments.length > 0 && segments[segments.length - 1] !== "..") {
					segments.pop();
				} else if (!isAbsolute) {
					segments.push("..");
				}
			} else {
				segments.push(seg);
			}
		}
	}
	const joined = segments.join("/");
	return isAbsolute ? `/${joined}` : joined;
}

function extractPathWithCwd(toolName: string, args: Record<string, unknown>, cwd: string): string | undefined {
	const raw = extractPath(toolName, args);
	if (raw === undefined) return undefined;
	return resolvePath(raw, cwd);
}

// =============================================================================
// Pattern matching
// =============================================================================

function matchesPattern(rule: PermissionRule, path: string, cwd?: string): boolean {
	const norm = rule.pattern?.replace(/^\.\//, "") ?? "";
	if (rule.patternKind === "regex") {
		return new RegExp(norm).test(path);
	}
	// Glob match.
	if (matchGlob(norm, path)) return true;
	// If pattern is relative (doesn't start with /) and the path is an
	// absolute path inside cwd, try matching against the path-relative-to-cwd.
	// This lets `{ tool: "edit", pattern: ".opencode/plans/*.md" }` match
	// the absolute path "/home/user/.opencode/plans/foo.md" when cwd is
	// "/home/user" — the relative form is ".opencode/plans/foo.md" which
	// matches the glob.
	if (cwd && !norm.startsWith("/") && path.startsWith(cwd + "/")) {
		const relPath = path.slice(cwd.length + 1);
		if (matchGlob(norm, relPath)) return true;
	}
	return false;
}

// =============================================================================
// Permission evaluation
// =============================================================================

/** Check a tool call against a ruleset. Returns the effective action.
 *
 * Algorithm (mirrors OpenCode's Permission.merge + more-specific-pattern semantics):
 *   1. Find rules with the EXACT tool name whose pattern matches (if any).
 *      If any pattern-matched rules exist, return the most restrictive
 *      (deny > ask > allow) among THOSE only.
 *   2. Otherwise, find rules with the exact tool name that have NO pattern
 *      (catch-alls). Return the most restrictive of those.
 *   3. If nothing matched in the exact-tool pass, repeat steps 1-2 for
 *      tool="*".
 *   4. If nothing matches anywhere, return "allow".
 *
 * This means a pattern-specific allow rule ({ tool: "edit", pattern:
 * ".aidlc/plan.md", action: "allow" }) takes precedence over a catch-all
 * deny ({ tool: "edit", action: "deny" }) for paths that match the pattern.
 * But the catch-all deny still applies to paths that don't match.
 */
export function check(
	ruleset: PermissionRuleset,
	toolName: string,
	args: Record<string, unknown>,
	cwd?: string,
): PermissionAction {
	const path = cwd ? extractPathWithCwd(toolName, args, cwd) : extractPath(toolName, args);

	const result = checkToolGroup(ruleset, toolName, path, cwd);
	if (result !== undefined) return result;

	return checkToolGroup(ruleset, "*", path, cwd) ?? "allow";
}

/** Check rules for a single tool name. Returns the most-restrictive
 *  action if any rules match, or undefined if no rules match. */
function checkToolGroup(
	ruleset: PermissionRuleset,
	toolName: string,
	path: string | undefined,
	cwd?: string,
): PermissionAction | undefined {
	// Step 1: pattern-matching rules for this tool.
	const patternMatches: PermissionRule[] = [];
	const catchAllMatches: PermissionRule[] = [];
	for (const rule of ruleset.rules) {
		if (rule.tool !== toolName) continue;
		if (rule.pattern !== undefined) {
			if (path === undefined) continue;
			if (!matchesPattern(rule, path, cwd)) continue;
			patternMatches.push(rule);
		} else {
			catchAllMatches.push(rule);
		}
	}
	if (patternMatches.length > 0) {
		return mostRestrictive(patternMatches);
	}
	if (catchAllMatches.length > 0) {
		return mostRestrictive(catchAllMatches);
	}
	return undefined;
}

const RESTRICTIVE_RANK: Record<PermissionAction, number> = { allow: 0, ask: 1, deny: 2 };

function mostRestrictive(rules: PermissionRule[]): PermissionAction {
	let best: PermissionAction = "allow";
	for (const rule of rules) {
		if (RESTRICTIVE_RANK[rule.action] > RESTRICTIVE_RANK[best]) {
			best = rule.action;
		}
	}
	return best;
}

// =============================================================================
// Default plan-mode ruleset
// =============================================================================

/** Permission ruleset for the plan agent. Mirrors opencode's `plan`
 *  agent permissions: deny all edits, allow only the plan file.
 *
 * Rule order matters — more-specific allow rules are listed BEFORE the
 * catch-all deny for each tool. */
export const PLAN_AGENT_PERMISSIONS: PermissionRuleset = {
	rules: [
		// Bash: allow safe commands (catch-all allow, then specific denies)
		{ tool: "bash", action: "allow" },
		// Destructive commands — regex patterns matching anywhere in the command.
		// Order: most specific first, but for safety we list them in one block.
		{
			tool: "bash",
			pattern: "\\brm\\b|\\brmdir\\b|\\bmv\\b|\\bcp\\b|\\bmkdir\\b|\\btouch\\b|\\bchmod\\b|\\bchown\\b|\\bchgrp\\b|\\bln\\b|\\btee\\b|\\btruncate\\b|\\bdd\\b|\\bshred\\b",
			patternKind: "regex",
			action: "deny",
		},
		{ tool: "bash", pattern: "(^|[^<])>(?!>)", patternKind: "regex", action: "deny" }, // > redirect (but not >>)
		{ tool: "bash", pattern: ">>", patternKind: "regex", action: "deny" }, // >> append
		{ tool: "bash", pattern: "\\bnpm\\s+(install|uninstall|update|ci|link|publish)\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\byarn\\s+(add|remove|install|publish)\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\bpnpm\\s+(add|remove|install|publish)\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\bpip\\s+(install|uninstall)\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\bapt(-get)?\\s+(install|remove|purge|update|upgrade)\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\bbrew\\s+(install|uninstall|upgrade)\\b", patternKind: "regex", action: "deny" },
		{
			tool: "bash",
			pattern: "\\bgit\\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)\\b",
			patternKind: "regex",
			action: "deny",
		},
		{ tool: "bash", pattern: "\\bsudo\\b|\\bsu\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\bkill\\b|\\bpkill\\b|\\bkillall\\b|\\breboot\\b|\\bshutdown\\b", patternKind: "regex", action: "deny" },
		{ tool: "bash", pattern: "\\b(vim?|nano|emacs|code|subl)\\b", patternKind: "regex", action: "deny" },

		// Edit / write: allow only the plan file (specific allow BEFORE catch-all deny)
		{ tool: "edit", pattern: ".opencode/plans/*.md", action: "allow" },
		{ tool: "write", pattern: ".opencode/plans/*.md", action: "allow" },
		{ tool: "edit", pattern: ".aidlc/plan.md", action: "allow" },
		{ tool: "write", pattern: ".aidlc/plan.md", action: "allow" },
		{ tool: "edit", action: "deny" }, // catch-all deny for any other edit path
		{ tool: "write", action: "deny" }, // catch-all deny for any other write path

		// plan_exit is the only allowed "exit" action
		{ tool: "plan_exit", action: "allow" },

		// plan_enter is for the build agent; deny inside plan
		{ tool: "plan_enter", action: "deny" },

		// Default for any other tool: allow
		{ tool: "*", action: "allow" },
	],
};