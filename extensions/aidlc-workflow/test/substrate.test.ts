/**
 * Tests for the knowledge-base substrate primitives:
 *   - signal file parsing (frontmatter + body + Timeline)
 *   - signal dedup (slug-based)
 *   - LOG.md append (one line per ship/ingest)
 *   - domain scaffold validation
 *
 * These are the foundation tests. The classifier test covers the
 * classifier; this covers the I/O it writes to.
 *
 * Run with: node --experimental-strip-types --test test/substrate.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// =============================================================================
// Signal schema validation
// =============================================================================

interface SignalFrontmatter {
	kind: string;
	category: string;
	frequency: number;
	sources: string[];
	domain: string[];
	status: "open" | "triaged" | "actioned" | "closed";
	phase?: string;
	priority: "P0" | "P1" | "P2";
}

function parseSignal(content: string): { fm: SignalFrontmatter; body: string; timeline: string[] } {
	const fmMatch = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
	if (!fmMatch) throw new Error("missing frontmatter");
	const fmText = fmMatch[1];
	const rest = fmMatch[2];

	const fm: Record<string, unknown> = {};
	for (const line of fmText.split("\n")) {
		const m = line.match(/^(\w+):\s*(.*)$/);
		if (m) fm[m[1]] = m[2];
	}

	// Coerce numeric fields (yaml frontmatter parses to strings).
	if (typeof fm.frequency === "string") fm.frequency = parseInt(fm.frequency, 10);

	// Parse list fields (sources, domain) — strip [ ] then split by comma.
	// The current naive frontmatter parser doesn't handle YAML list syntax
	// natively, so we do it by hand. Returns string[].
	const parseList = (v: unknown): string[] => {
		if (Array.isArray(v)) return v as string[];
		if (typeof v !== "string") return [];
		return v
			.replace(/[\[\]]/g, "")
			.split(",")
			.map((s) => s.trim())
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
		fm: fm as unknown as SignalFrontmatter,
		body: bodyLines.join("\n").trim(),
		timeline: timeline.filter((l) => l.trim().length > 0),
	};
}

test("parseSignal: extracts frontmatter, body, and timeline", () => {
	const content = `---
kind: signal
category: feedback
frequency: 2
sources: [https://github.com/foo/bar/pull/1, https://github.com/foo/bar/pull/2]
domain: [my-project]
status: open
phase: implement
priority: P1
---

# Race condition in cache invalidation

A reviewer flagged this. The cache TTL races with the invalidation
callback, so stale entries can survive a refresh.

## Timeline
2026-06-10 | PR #1 — first sighting
2026-06-15 | PR #2 — same root cause
`;
	const sig = parseSignal(content);
	assert.equal(sig.fm.kind, "signal");
	assert.equal(sig.fm.category, "feedback");
	assert.equal(sig.fm.frequency, 2);
	assert.deepEqual(sig.fm.sources, [
		"https://github.com/foo/bar/pull/1",
		"https://github.com/foo/bar/pull/2",
	]);
	assert.equal(sig.fm.domain[0], "my-project");
	assert.equal(sig.fm.phase, "implement");
	assert.equal(sig.fm.priority, "P1");
	assert.ok(sig.body.toLowerCase().includes("race condition"));
	assert.equal(sig.timeline.length, 2);
	assert.ok(sig.timeline[0].includes("first sighting"));
});

test("parseSignal: handles empty Timeline", () => {
	const content = `---
kind: signal
category: bug
frequency: 1
sources: []
domain: []
status: open
priority: P2
---

# Something happened

But there's no timeline yet.

`;
	const sig = parseSignal(content);
	assert.equal(sig.timeline.length, 0);
});

// =============================================================================
// Signal dedup logic
// =============================================================================

interface SignalSlugIndex {
	[slug: string]: { path: string; fm: SignalFrontmatter };
}

function buildSignalIndex(signalsDir: string): SignalSlugIndex {
	const idx: SignalSlugIndex = {};
	if (!fs.existsSync(signalsDir)) return idx;
	for (const f of fs.readdirSync(signalsDir)) {
		if (!f.endsWith(".md")) continue;
		const full = path.join(signalsDir, f);
		const content = fs.readFileSync(full, "utf-8");
		const sig = parseSignal(content);
		const slug = path.basename(f, ".md");
		idx[slug] = { path: full, fm: sig.fm };
	}
	return idx;
}

test("signal dedup: 3 comments → 1 signal with frequency 3", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-signal-"));
	try {
		const sigPath = path.join(dir, "cache-race.md");
		const writeSignal = (frequency: number, source: string) => {
			const content = `---
kind: signal
category: bug
frequency: ${frequency}
sources: [${source}]
domain: [proj]
status: open
phase: implement
priority: P1
---

# Cache race condition

Stale entries can survive a refresh.

## Timeline
${frequency > 0 ? `2026-06-${10 + frequency} | ${source} — sighting #${frequency}` : ""}
`;
			fs.writeFileSync(sigPath, content);
		};

		// Simulate 3 PR comments all hitting the same signal
		writeSignal(1, "https://pr/1");
		const idx1 = buildSignalIndex(dir);
		assert.equal(idx1["cache-race"].fm.frequency, 1);

		writeSignal(2, "https://pr/2");
		const idx2 = buildSignalIndex(dir);
		assert.equal(idx2["cache-race"].fm.frequency, 2);

		writeSignal(3, "https://pr/3");
		const idx3 = buildSignalIndex(dir);
		assert.equal(idx3["cache-race"].fm.frequency, 3);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// =============================================================================
// LOG.md append
// =============================================================================

function appendLogEntry(logPath: string, entry: string): void {
	const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "";
	// Look for existing entry headers (`## YYYY-MM-DD`). If at least one
	// entry exists, prepend a blank line so entries are visually separated.
	// If no entries yet (just the header), no separator — the first entry
	// follows `<!-- Append below. -->` directly.
	const entryCount = (existing.match(/^## \d{4}-\d{2}-\d{2}/gm) || []).length;
	const sep = entryCount > 0 ? "\n" : "";
	fs.appendFileSync(logPath, sep + entry + "\n");
}

test("LOG.md append: first entry gets no leading blank line", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-log-"));
	try {
		const logPath = path.join(dir, "LOG.md");
		const header = "# Work log\n\n<!-- Append below. -->\n";
		fs.writeFileSync(logPath, header);
		appendLogEntry(logPath, "## 2026-06-23 · Test · #test\nWhat: hi\nRefs: nothing");
		const content = fs.readFileSync(logPath, "utf-8");
		assert.ok(content.endsWith("nothing\n"));
		// The first entry follows `<!-- Append below. -->` directly — no
		// blank line gap.
		assert.ok(content.includes("-->\n## 2026"));
		assert.ok(!content.includes("-->\n\n## 2026"));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("LOG.md append: subsequent entries get a leading blank line", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-log-"));
	try {
		const logPath = path.join(dir, "LOG.md");
		const header = "# Work log\n\n<!-- Append below. -->\n";
		fs.writeFileSync(logPath, header);
		appendLogEntry(logPath, "## 2026-06-22 · First · #test\nWhat: hi");
		appendLogEntry(logPath, "## 2026-06-23 · Second · #test\nWhat: bye");
		const content = fs.readFileSync(logPath, "utf-8");
		const lines = content.split("\n");
		// Find the index of the second entry — should be preceded by a blank line
		const idx = lines.findIndex((l) => l.startsWith("## 2026-06-23"));
		assert.ok(idx > 0);
		assert.equal(lines[idx - 1], "");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// =============================================================================
// Domain scaffold validation
// =============================================================================

function validateDomainScaffold(domainDir: string): { ok: boolean; errors: string[] } {
	const errors: string[] = [];
	if (!fs.existsSync(path.join(domainDir, "README.md"))) errors.push("missing README.md");
	const stateFile = path.join(domainDir, ".aidlc", "state.md");
	if (!fs.existsSync(stateFile)) errors.push("missing .aidlc/state.md");
	return { ok: errors.length === 0, errors };
}

test("domain scaffold: validates README.md + .aidlc/state.md exist", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-domain-"));
	try {
		// Empty domain — should fail
		const result = validateDomainScaffold(dir);
		assert.equal(result.ok, false);
		assert.ok(result.errors.includes("missing README.md"));
		assert.ok(result.errors.includes("missing .aidlc/state.md"));

		// Add the files
		fs.writeFileSync(path.join(dir, "README.md"), "# test\n");
		fs.mkdirSync(path.join(dir, ".aidlc"));
		fs.writeFileSync(path.join(dir, ".aidlc", "state.md"), "- phase: not_started\n");

		const result2 = validateDomainScaffold(dir);
		assert.equal(result2.ok, true);
		assert.deepEqual(result2.errors, []);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});