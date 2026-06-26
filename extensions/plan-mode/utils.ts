/**
 * Pure utilities for plan mode.
 *
 * Path resolution, plan-filename formatting, AIDLC state detection.
 * No pi imports — safe to test without a pi runtime.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Plan-file path resolution
// =============================================================================

export interface PlanPathInputs {
	/** Override path from --plan-file flag. May be relative or absolute. */
	override: string | undefined;
	/** Current working directory (for resolving relative paths). */
	cwd: string;
	/** Slug derived from session name or session ID. */
	slug: string;
	/** Optional timestamp for deterministic tests. Defaults to now(). */
	now?: () => Date;
}

/** Resolve the absolute path of the plan file.
 *
 * Precedence:
 *   1. `override` (--plan-file flag) — wins always
 *   2. AIDLC context (`.aidlc/state.md` exists with phase ∈
 *      {specifying, planning}) → `<cwd>/.aidlc/plan.md`
 *   3. Default → `<cwd>/.opencode/plans/<timestamp>-<slug>.md`
 *
 * Side effect: creates the parent directory of the resolved path. */
export function resolvePlanPath(inputs: PlanPathInputs): string {
	const { override, cwd, slug } = inputs;
	const now = inputs.now ?? (() => new Date());

	if (override !== undefined && override !== "") {
		const resolved = path.isAbsolute(override) ? override : path.resolve(cwd, override);
		fs.mkdirSync(path.dirname(resolved), { recursive: true });
		return resolved;
	}

	const aidlcStatePath = path.join(cwd, ".aidlc", "state.md");
	if (fs.existsSync(aidlcStatePath)) {
		const phase = readPhaseFromState(aidlcStatePath);
		if (phase === "specifying" || phase === "planning") {
			const resolved = path.join(cwd, ".aidlc", "plan.md");
			fs.mkdirSync(path.dirname(resolved), { recursive: true });
			return resolved;
		}
	}

	const dir = path.join(cwd, ".opencode", "plans");
	fs.mkdirSync(dir, { recursive: true });
	const filename = formatPlanFilename(slug, now());
	return path.join(dir, filename);
}

// =============================================================================
// Filename formatting
// =============================================================================

/** Format a plan filename: `<timestamp>-<slug>.md`.
 *  Timestamp uses ISO-8601 with `:` and `.` replaced by `-` for FS safety.
 *  Mirrors OpenCode's `Session.plan()` format. */
export function formatPlanFilename(slug: string, when: Date = new Date()): string {
	const ts = when.toISOString().replace(/[:.]/g, "-");
	const safeSlug = slugify(slug);
	return `${ts}-${safeSlug}.md`;
}

/** Make a string filesystem-safe: lowercase, replace non-alphanumeric
 *  with `-`, collapse repeats, trim dashes. */
export function slugify(input: string): string {
	if (!input) return "untitled";
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return slug.length > 0 ? slug.slice(0, 64) : "untitled";
}

// =============================================================================
// AIDLC state detection
// =============================================================================

/** Read `.aidlc/state.md` and return the phase field, or undefined if
 *  the file is missing / malformed. Matches the AIDLC state-file format:
 *  a markdown file with `- **Phase**: <value>` somewhere in the body. */
export function readPhaseFromState(statePath: string): string | undefined {
	let content: string;
	try {
		content = fs.readFileSync(statePath, "utf-8");
	} catch {
		return undefined;
	}
	const match = content.match(/^\s*-\s*\*\*Phase\*\*\s*:\s*(\S+)/m);
	return match?.[1];
}

// =============================================================================
// Session-derived slug
// =============================================================================

/** Derive a plan-file slug from session metadata. Falls back to a
 *  short random hex string. */
export function deriveSlug(sessionName: string | undefined, sessionId: string | undefined): string {
	if (sessionName && sessionName.trim().length > 0) {
		return slugify(sessionName);
	}
	if (sessionId && sessionId.length > 0) {
		// Take first 8 hex chars; works whether the id is hex or uuid-like
		const cleaned = sessionId.replace(/[^a-z0-9]/gi, "").toLowerCase();
		return cleaned.slice(0, 8) || "untitled";
	}
	return "untitled";
}