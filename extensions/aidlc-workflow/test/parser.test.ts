/**
 * Parser test — isolated unit test for the state.md parser in index.ts.
 * Run with: node --experimental-strip-types --test test/parser.test.ts
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

interface AidlcState {
	phase: string;
	branch: string | null;
	pr: string | null;
	lastAction: string;
	nextAction: string;
	notes: string;
	[key: string]: string | null;
}

function parseState(md: string): AidlcState {
	const result: AidlcState = {
		phase: "unknown",
		branch: null,
		pr: null,
		lastAction: "",
		nextAction: "",
		notes: "",
	};
	const SNAKE_TO_CAMEL: Record<string, string> = {
		last_action: "lastAction",
		next_action: "nextAction",
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

test("parser extracts all six fields from a complete state file", () => {
	const md = `# AIDLC State

- **Phase**: implementing
- **Branch**: feat/test
- **PR**: 99
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /test
- **Notes**: T-001 done

_Updated: 2026-06-23T11:00:00Z_
`;

	const s = parseState(md);
	assert.equal(s.phase, "implementing");
	assert.equal(s.branch, "feat/test");
	assert.equal(s.pr, "99");
	assert.equal(s.lastAction, "2026-06-23T11:00:00Z");
	assert.equal(s.nextAction, "Run /test");
	assert.equal(s.notes, "T-001 done");
});

test("parser handles empty values (no last action)", () => {
	const md = `# AIDLC State

- **Phase**: specifying
- **Branch**:
- **PR**:
- **Last action**:
- **Next action**:
- **Notes**:

_Updated: 2026-06-23T11:00:00Z_
`;
	const s = parseState(md);
	// Empty values: regex requires `.+` (one or more) so empty lines won't match
	// The result keeps the default values
	assert.equal(s.phase, "specifying");
	assert.equal(s.lastAction, "");
});
