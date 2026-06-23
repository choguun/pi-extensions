/**
 * Tests for the knowledge-base substrate primitives in substrate.ts:
 *   - slugify: comment body → kebab-case filename slug
 *   - upsertSignal: create or update a signal (dedup by slug, atomic write)
 *   - readSignal / writeSignal / listSignals: round-trip I/O
 *   - classifyCategory: classifier reason → signal category
 *   - appendLogEntry / formatLogEntry: LOG.md append with proper separators
 *
 * Run with: node --experimental-strip-types --test test/substrate.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	slugify,
	upsertSignal,
	readSignal,
	writeSignal,
	listSignals,
	classifyCategory,
	appendLogEntry,
	formatLogEntry,
} from "../substrate.ts";

// =============================================================================
// Helpers
// =============================================================================

function mkTmpRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-substrate-"));
	fs.mkdirSync(path.join(dir, "signals"), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "LOG.md"),
		"# Work log\n\n<!-- Append below. -->\n",
	);
	return dir;
}

function rmTmpRepo(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

// =============================================================================
// slugify
// =============================================================================

test("slugify: lowercase + kebab", () => {
	assert.equal(slugify("Race Condition In Cache"), "race-condition-in-cache");
});

test("slugify: strips punctuation", () => {
	assert.equal(slugify("SQL injection?!"), "sql-injection");
});

test("slugify: collapses whitespace", () => {
	assert.equal(slugify("  multiple   spaces  "), "multiple-spaces");
});

test("slugify: truncates at word boundary", () => {
	const long = "the cache invalidation callback races with the TTL refresh logic every time the user logs in";
	const slug = slugify(long);
	assert.ok(slug.length <= 50, `slug should be ≤50 chars, got ${slug.length}: ${slug}`);
	assert.ok(!slug.endsWith("-"), "slug should not end with a hyphen");
});

test("slugify: falls back when empty", () => {
	assert.equal(slugify("???!!!"), "untitled-signal");
	assert.equal(slugify(""), "untitled-signal");
});

// =============================================================================
// Signal I/O round-trip
// =============================================================================

test("writeSignal + readSignal: round-trips a new signal", () => {
	const dir = mkTmpRepo();
	try {
		const slug = "cache-race";
		const today = new Date().toISOString().slice(0, 10);
		writeSignal(dir, {
			slug,
			kind: "signal",
			category: "bug",
			frequency: 1,
			sources: ["https://pr/1"],
			domain: ["my-proj"],
			status: "open",
			phase: "implement",
			priority: "P1",
			body: "# Cache race condition\n\nStale entries can survive a refresh.",
			timeline: [`${today} | https://pr/1 — first sighting`],
		});

		const sig = readSignal(dir, slug);
		assert.ok(sig, "signal should be readable");
		assert.equal(sig.slug, slug);
		assert.equal(sig.kind, "signal");
		assert.equal(sig.category, "bug");
		assert.equal(sig.frequency, 1);
		assert.deepEqual(sig.sources, ["https://pr/1"]);
		assert.deepEqual(sig.domain, ["my-proj"]);
		assert.equal(sig.status, "open");
		assert.equal(sig.priority, "P1");
		assert.ok(sig.body.includes("Stale entries"));
		assert.equal(sig.timeline.length, 1);
	} finally {
		rmTmpRepo(dir);
	}
});

test("writeSignal: rejects invalid slug", () => {
	const dir = mkTmpRepo();
	try {
		assert.throws(
			() => writeSignal(dir, { ...emptySignal("UPPER"), slug: "Bad-Slug" }),
			/invalid signal slug/,
		);
		assert.throws(
			() => writeSignal(dir, { ...emptySignal("has space"), slug: "has space" }),
			/invalid signal slug/,
		);
	} finally {
		rmTmpRepo(dir);
	}
});

function emptySignal(slug: string) {
	return {
		slug,
		kind: "signal" as const,
		category: "feedback" as const,
		frequency: 1,
		sources: [],
		domain: [],
		status: "open" as const,
		priority: "P2" as const,
		body: "",
		timeline: [],
	};
}

// =============================================================================
// upsertSignal — the core dedup logic
// =============================================================================

test("upsertSignal: first sighting creates with frequency 1", () => {
	const dir = mkTmpRepo();
	try {
		const { signal, created } = upsertSignal(dir, "race-condition", {
			category: "bug",
			sources: ["https://pr/1"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P1", reason: "Real bug reported" },
			body: "There's a race condition in the cache invalidation.",
		});
		assert.equal(created, true);
		assert.equal(signal.frequency, 1);
		assert.equal(signal.status, "open");
		assert.equal(signal.priority, "P1");
	} finally {
		rmTmpRepo(dir);
	}
});

test("upsertSignal: second sighting on same slug → frequency 2, status triaged", () => {
	const dir = mkTmpRepo();
	try {
		upsertSignal(dir, "race-condition", {
			category: "bug",
			sources: ["https://pr/1"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P1", reason: "Real bug reported" },
			body: "first",
		});
		const { signal, created } = upsertSignal(dir, "race-condition", {
			category: "bug",
			sources: ["https://pr/2"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P1", reason: "Real bug reported" },
			body: "second",
		});
		assert.equal(created, false);
		assert.equal(signal.frequency, 2);
		assert.equal(signal.status, "triaged");
		assert.deepEqual(signal.sources, ["https://pr/1", "https://pr/2"]);
		assert.equal(signal.timeline.length, 2);
	} finally {
		rmTmpRepo(dir);
	}
});

test("upsertSignal: third sighting → frequency 3, both sources merged", () => {
	const dir = mkTmpRepo();
	try {
		const sources = ["https://pr/1", "https://pr/2", "https://pr/3"];
		for (const src of sources) {
			upsertSignal(dir, "x", {
				category: "bug",
				sources: [src],
				domain: ["proj"],
				classification: { phase: "implement", priority: "P1", reason: "Real bug reported" },
				body: src,
			});
		}
		const sig = readSignal(dir, "x");
		assert.ok(sig, "signal should exist");
		assert.equal(sig.frequency, 3);
		assert.deepEqual(sig.sources, sources);
		assert.equal(sig.timeline.length, 3);
	} finally {
		rmTmpRepo(dir);
	}
});

test("upsertSignal: P0 sighting upgrades priority on existing P1 signal", () => {
	const dir = mkTmpRepo();
	try {
		upsertSignal(dir, "x", {
			category: "bug",
			sources: ["pr/1"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P1", reason: "Test failure mentioned" },
			body: "first",
		});
		const { signal } = upsertSignal(dir, "x", {
			category: "bug",
			sources: ["pr/2"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P0", reason: "Real bug reported" },
			body: "second",
		});
		assert.equal(signal.priority, "P0", "priority should upgrade from P1 to P0");
	} finally {
		rmTmpRepo(dir);
	}
});

test("upsertSignal: P2 sighting does NOT downgrade existing P0 signal", () => {
	const dir = mkTmpRepo();
	try {
		upsertSignal(dir, "x", {
			category: "bug",
			sources: ["pr/1"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P0", reason: "Real bug reported" },
			body: "first",
		});
		const { signal } = upsertSignal(dir, "x", {
			category: "bug",
			sources: ["pr/2"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P2", reason: "Style nit" },
			body: "second",
		});
		assert.equal(signal.priority, "P0", "priority should NOT downgrade from P0 to P2");
	} finally {
		rmTmpRepo(dir);
	}
});

// =============================================================================
// listSignals
// =============================================================================

test("listSignals: sorted by frequency (highest first)", () => {
	const dir = mkTmpRepo();
	try {
		// Create three signals with different frequencies
		upsertSignal(dir, "a", {
			category: "bug",
			sources: ["pr/1"],
			domain: ["proj"],
			classification: { phase: "implement", priority: "P1", reason: "Real bug" },
			body: "a",
		});
		// Bump b to freq 3
		for (let i = 0; i < 3; i++) {
			upsertSignal(dir, "b", {
				category: "bug",
				sources: [`pr/${i}`],
				domain: ["proj"],
				classification: { phase: "implement", priority: "P1", reason: "Real bug" },
				body: "b",
			});
		}
		// Bump c to freq 2
		for (let i = 0; i < 2; i++) {
			upsertSignal(dir, "c", {
				category: "bug",
				sources: [`pr/${i}`],
				domain: ["proj"],
				classification: { phase: "implement", priority: "P1", reason: "Real bug" },
				body: "c",
			});
		}

		const list = listSignals(dir);
		assert.equal(list.length, 3);
		assert.equal(list[0].slug, "b");
		assert.equal(list[0].frequency, 3);
		assert.equal(list[1].slug, "c");
		assert.equal(list[1].frequency, 2);
		assert.equal(list[2].slug, "a");
		assert.equal(list[2].frequency, 1);
	} finally {
		rmTmpRepo(dir);
	}
});

test("listSignals: empty directory returns []", () => {
	const dir = mkTmpRepo();
	try {
		assert.deepEqual(listSignals(dir), []);
	} finally {
		rmTmpRepo(dir);
	}
});

// =============================================================================
// classifyCategory
// =============================================================================

test("classifyCategory: maps classifier reason → signal category", () => {
	assert.equal(classifyCategory("Real bug reported"), "bug");
	assert.equal(classifyCategory("Security issue"), "bug");
	assert.equal(classifyCategory("Test/build failure mentioned"), "friction");
	assert.equal(classifyCategory("Spec/requirements issue"), "observation");
	assert.equal(classifyCategory("Style nit"), "observation");
	assert.equal(classifyCategory("Design/refactor suggestion"), "observation");
	assert.equal(classifyCategory("Something else"), "feedback");
});

// =============================================================================
// LOG.md
// =============================================================================

test("appendLogEntry + formatLogEntry: first entry, valid file", () => {
	const dir = mkTmpRepo();
	try {
		const logPath = path.join(dir, "LOG.md");
		const entry = formatLogEntry({
			date: "2026-06-23",
			title: "Test entry",
			tags: ["aidlc"],
			what: "This is the first entry.",
		});
		appendLogEntry(logPath, entry);
		const content = fs.readFileSync(logPath, "utf-8");
		assert.ok(content.includes("## 2026-06-23 · Test entry · #aidlc"));
		assert.ok(content.includes("What: This is the first entry."));
	} finally {
		rmTmpRepo(dir);
	}
});

test("appendLogEntry: second entry separated from first by blank line", () => {
	const dir = mkTmpRepo();
	try {
		const logPath = path.join(dir, "LOG.md");
		appendLogEntry(
			logPath,
			formatLogEntry({ date: "2026-06-22", title: "First", tags: ["t"], what: "hi" }),
		);
		appendLogEntry(
			logPath,
			formatLogEntry({ date: "2026-06-23", title: "Second", tags: ["t"], what: "bye" }),
		);
		const content = fs.readFileSync(logPath, "utf-8");
		const lines = content.split("\n");
		const secondIdx = lines.findIndex((l) => l.startsWith("## 2026-06-23"));
		assert.ok(secondIdx > 0);
		assert.equal(lines[secondIdx - 1], "", "second entry should be preceded by a blank line");
	} finally {
		rmTmpRepo(dir);
	}
});

test("appendLogEntry: throws if LOG.md missing", () => {
	const dir = mkTmpRepo();
	try {
		const logPath = path.join(dir, "LOG.md");
		fs.unlinkSync(logPath);
		assert.throws(() => appendLogEntry(logPath, "anything"), /LOG.md not found/);
	} finally {
		rmTmpRepo(dir);
	}
});