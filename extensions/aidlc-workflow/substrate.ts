/**
 * Knowledge-base substrate I/O.
 *
 * Reads + writes the artifacts in `signals/`, `docs/`, `domains/`, and
 * `LOG.md`. These primitives back the signal-triage workflow — given a
 * classified PR comment, decide whether to create a new signal or
 * update an existing one (bump frequency, append Timeline).
 *
 * Conventions (see `ARCHITECTURE.md`):
 *   - Two-layer pages: body + `## Timeline` (append-only, dated).
 *   - One concept = one home (by kind). Dedup by slug.
 *   - Frontmatter = anything you'd query.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

export type SignalStatus = "open" | "triaged" | "actioned" | "closed";
export type SignalCategory = "feedback" | "friction" | "bug" | "observation" | "idea";
export type Priority = "P0" | "P1" | "P2";
export type Phase = "specify" | "plan" | "implement" | "test" | "review" | "ship" | "not_started" | "specifying" | "planning" | "implementing" | "testing" | "reviewing" | "shipping" | "shipped";

export interface Signal {
	slug: string;
	kind: "signal";
	category: SignalCategory;
	frequency: number;
	sources: string[];
	domain: string[];
	status: SignalStatus;
	phase?: Phase;
	priority: Priority;
	body: string;
	timeline: string[];
}

export interface Classification {
	phase: string;
	priority: Priority;
	reason: string;
}

// =============================================================================
// Frontmatter parser (intentionally minimal — handles the shape we write)
// =============================================================================

interface Frontmatter {
	[key: string]: string | number | string[] | undefined;
}

function parseFrontmatter(content: string): { fm: Frontmatter; body: string; timeline: string[] } {
	const m = content.match(/^---\n([\s\S]+?)\n---\n?([\s\S]*)$/);
	if (!m) throw new Error("missing frontmatter");
	const fmText = m[1];
	const rest = m[2];

	const fm: Frontmatter = {};
	for (const line of fmText.split("\n")) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1];
		let value: string | number = kv[2];
		// Strip surrounding quotes
		if (typeof value === "string") {
			value = value.replace(/^['"]|['"]$/g, "");
			// Coerce numbers
			if (/^-?\d+$/.test(value)) value = parseInt(value, 10);
		}
		fm[key] = value;
	}

	// List fields: `[a, b]` → ["a", "b"]
	const parseList = (v: unknown): string[] => {
		if (Array.isArray(v)) return v as string[];
		if (typeof v !== "string") return [];
		return v
			.replace(/^\[|\]$/g, "")
			.split(",")
			.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
			.filter(Boolean);
	};
	fm.sources = parseList(fm.sources);
	fm.domain = parseList(fm.domain);

	const timeline: string[] = [];
	const bodyLines: string[] = [];
	let inTimeline = false;
	for (const line of rest.split("\n")) {
		if (line.trim() === "## Timeline") {
			inTimeline = true;
			continue;
		}
		if (inTimeline) {
			timeline.push(line);
		} else {
			bodyLines.push(line);
		}
	}
	return {
		fm,
		body: bodyLines.join("\n").trim(),
		timeline: timeline.filter((l) => l.trim().length > 0),
	};
}

function renderFrontmatter(fm: Frontmatter): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(fm)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			lines.push(`${key}: [${value.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(", ")}]`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

// =============================================================================
// Signal I/O
// =============================================================================

const SIGNAL_FILENAME_RE = /^[a-z0-9][a-z0-9-]*\.md$/;

/**
 * Slugify a comment body into a kebab-case filename slug.
 *
 * Rules:
 *   - Lowercase, strip non-alphanumeric except spaces/hyphens.
 *   - Replace runs of spaces with single hyphens.
 *   - Trim leading/trailing hyphens.
 *   - Cap at 50 chars (split on last word boundary).
 *   - Fall back to "untitled-signal" if empty.
 */
export function slugify(text: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (slug.length === 0) return "untitled-signal";
	if (slug.length <= 50) return slug;
	// Split at last hyphen before 50 chars
	const truncated = slug.slice(0, 50);
	const lastHyphen = truncated.lastIndexOf("-");
	return lastHyphen > 20 ? truncated.slice(0, lastHyphen) : truncated;
}

/** Build a signal file path from a slug. */
export function signalPath(repoRoot: string, slug: string): string {
	if (!SIGNAL_FILENAME_RE.test(`${slug}.md`)) {
		throw new Error(`invalid signal slug: ${slug} (must be kebab-case, lowercase)`);
	}
	return path.join(repoRoot, "signals", `${slug}.md`);
}

/** Read a signal from disk. Returns null if the file doesn't exist. */
export function readSignal(repoRoot: string, slug: string): Signal | null {
	const p = signalPath(repoRoot, slug);
	if (!fs.existsSync(p)) return null;
	const content = fs.readFileSync(p, "utf-8");
	const parsed = parseFrontmatter(content);
	return {
		slug,
		kind: "signal",
		category: (parsed.fm.category as string) as SignalCategory,
		frequency: parsed.fm.frequency as number,
		sources: parsed.fm.sources as string[],
		domain: parsed.fm.domain as string[],
		status: parsed.fm.status as SignalStatus,
		phase: parsed.fm.phase as Phase | undefined,
		priority: parsed.fm.priority as Priority,
		body: parsed.body,
		timeline: parsed.timeline,
	};
}

/** Build the markdown content for a signal. */
export function renderSignal(signal: Signal): string {
	const fm: Frontmatter = {
		kind: "signal",
		category: signal.category,
		frequency: signal.frequency,
		sources: signal.sources,
		domain: signal.domain,
		status: signal.status,
		priority: signal.priority,
	};
	if (signal.phase) fm.phase = signal.phase;
	const header = renderFrontmatter(fm);
	const timelineBlock = signal.timeline.length > 0
		? `\n\n## Timeline\n${signal.timeline.join("\n")}`
		: "";
	return `${header}\n\n${signal.body}${timelineBlock}\n`;
}

/**
 * Atomic write — write to .tmp + rename so a crash mid-write can't
 * leave a half-written signal file.
 */
export function writeSignal(repoRoot: string, signal: Signal): void {
	const target = signalPath(repoRoot, signal.slug);
	const tmp = target + ".tmp";
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(tmp, renderSignal(signal));
	fs.renameSync(tmp, target);
}

/**
 * Upsert a signal: create if not exists, update frequency + timeline
 * + sources + status if it does. Returns `{ signal, created }`.
 *
 * Dedup is by slug — the caller is expected to derive the slug from
 * the comment body (see `slugify`).
 */
export function upsertSignal(
	repoRoot: string,
	slug: string,
	opts: {
		category: SignalCategory;
		sources: string[];
		domain: string[];
		classification: Classification;
		body: string;
	},
): { signal: Signal; created: boolean } {
	const existing = readSignal(repoRoot, slug);
	const today = new Date().toISOString().slice(0, 10);
	const newTimelineEntry = `${today} | ${opts.sources[0] ?? "unknown"} — sighting #${(existing?.frequency ?? 0) + 1}`;
	const sources = Array.from(new Set([...(existing?.sources ?? []), ...opts.sources]));

	if (existing) {
		const updated: Signal = {
			...existing,
			frequency: existing.frequency + 1,
			sources,
			status: existing.status === "open" ? "triaged" : existing.status,
			timeline: [...existing.timeline, newTimelineEntry],
			// Only upgrade priority, never downgrade — P0 stays P0 even if
			// later sighting classified as P2. The classifier may be wrong
			// on a single sighting; multiple P0 sightings are stronger.
			priority: priorityRank(opts.classification.priority) > priorityRank(existing.priority)
				? opts.classification.priority
				: existing.priority,
			// Phase: same rule — don't downgrade.
			phase: existing.phase ?? (opts.classification.phase as Phase),
		};
		writeSignal(repoRoot, updated);
		return { signal: updated, created: false };
	}

	const created: Signal = {
		slug,
		kind: "signal",
		category: opts.category,
		frequency: 1,
		sources: opts.sources,
		domain: opts.domain,
		status: "open",
		phase: opts.classification.phase as Phase,
		priority: opts.classification.priority,
		body: opts.body,
		timeline: [newTimelineEntry],
	};
	writeSignal(repoRoot, created);
	return { signal: created, created: true };
}

/** Numeric priority rank — higher = more urgent. */
function priorityRank(p: Priority): number {
	return p === "P0" ? 2 : p === "P1" ? 1 : 0;
}

/** Map a comment category (classifier's classification reason) to a signal category. */
export function classifyCategory(reason: string): SignalCategory {
	const lower = reason.toLowerCase();
	if (/security|cve|injection|xss|vuln|rce/.test(lower)) return "bug";
	if (/bug|broken|race|leak|crash|panic|null/.test(lower)) return "bug";
	// Note: spec/requirement BEFORE test/build, because "spec" matches the
	// latter. "Spec/requirements issue" is an observation; "test/build
	// failure" is a friction.
	if (/spec|requirement|out of scope/.test(lower)) return "observation";
	if (/test|build|failing|failed|failure/.test(lower)) return "friction";
	if (/nit|style|typo/.test(lower)) return "observation";
	if (/refactor|design/.test(lower)) return "observation";
	return "feedback";
}

/**
 * List all signals in the repo, sorted by frequency (highest first).
 */
export function listSignals(repoRoot: string): Signal[] {
	const dir = path.join(repoRoot, "signals");
	if (!fs.existsSync(dir)) return [];
	const out: Signal[] = [];
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith(".md") || !SIGNAL_FILENAME_RE.test(f)) continue;
		const slug = path.basename(f, ".md");
		const sig = readSignal(repoRoot, slug);
		if (sig) out.push(sig);
	}
	out.sort((a, b) => b.frequency - a.frequency);
	return out;
}

// =============================================================================
// LOG.md append
// =============================================================================

const LOG_HEADER_RE = /^# .*\n/;

/**
 * Append an entry to LOG.md. First entry follows the marker comment
 * directly; subsequent entries get a leading blank line for visual
 * separation.
 *
 * @param logPath absolute path to LOG.md
 * @param entry the full entry text (including `## YYYY-MM-DD · ...` header)
 * @returns `{ bytesAppended }`
 */
export function appendLogEntry(logPath: string, entry: string): { bytesAppended: number } {
	if (!fs.existsSync(logPath)) {
		throw new Error(`LOG.md not found at ${logPath} — create it first (see templates in ARCHITECTURE.md)`);
	}
	const existing = fs.readFileSync(logPath, "utf-8");
	const entryCount = (existing.match(/^## \d{4}-\d{2}-\d{2}/gm) || []).length;
	const sep = entryCount > 0 ? "\n" : "";
	const payload = sep + entry + "\n";
	fs.appendFileSync(logPath, payload);
	return { bytesAppended: payload.length };
}

/** Generate the standard LOG.md entry text from a structured payload. */
export function formatLogEntry(input: {
	date: string; // YYYY-MM-DD
	title: string;
	tags: string[];
	what: string;
	refs?: string[];
}): string {
	const tagStr = input.tags.map((t) => `#${t}`).join(" ");
	const refs = input.refs && input.refs.length > 0
		? `\nRefs: ${input.refs.join(", ")}.`
		: "";
	return `## ${input.date} · ${input.title} · ${tagStr}\nWhat: ${input.what}${refs}`;
}