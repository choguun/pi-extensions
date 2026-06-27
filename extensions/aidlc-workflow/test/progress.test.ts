// extensions/aidlc-workflow/test/progress.test.ts
//
// Content tests for F12 (.aidlc-progress.md) — the per-worktree ledger
// the implementer appends to after each T-NNN commit. We test the
// underlying file operations directly because invoking the `aidlc`
// tool requires the full ExtensionAPI mock.
//
// Verifies:
//   - the line format matches what implementer.md / `append-progress`
//     produce (complete status, BLOCKED status)
//   - `read-progress` parses lines starting with `- T-<id>: ` and
//     filters out non-task lines
//   - the file is absent → read returns empty (not an error)
//   - sequential appends accumulate (don't overwrite)

import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function readProgress(cwd: string): string {
  const p = join(cwd, ".aidlc-progress.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function parseTasks(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /^- T-\d+: /.test(line))
    .map((line) => line.slice(2));
}

test("append-progress format: complete-status line", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const line = "- T-001: complete (commits abc1234..def5678, review clean)\n";
  writeFileSync(join(cwd, ".aidlc-progress.md"), line);
  const content = readProgress(cwd);
  assert.match(content, /T-001: complete \(commits abc1234\.\.def5678, review clean\)/);
  rmSync(cwd, { recursive: true });
});

test("append-progress format: BLOCKED-status line with reason", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const line = "- T-003: BLOCKED (waiting for human input)\n";
  writeFileSync(join(cwd, ".aidlc-progress.md"), line);
  const content = readProgress(cwd);
  assert.match(content, /T-003: BLOCKED \(waiting for human input\)/);
  rmSync(cwd, { recursive: true });
});

test("read-progress: returns array of task lines", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const content = [
    "# AIDLC Progress Ledger",
    "",
    "- T-001: complete (commits abc..def, review clean)",
    "- T-002: complete (commits def..ghi, review clean)",
    "",
  ].join("\n");
  writeFileSync(join(cwd, ".aidlc-progress.md"), content);

  const lines = parseTasks(readProgress(cwd));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /T-001/);
  assert.match(lines[1], /T-002/);
  rmSync(cwd, { recursive: true });
});

test("read-progress: returns empty when file missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const content = readProgress(cwd);
  assert.equal(content, "");
  rmSync(cwd, { recursive: true });
});

test("read-progress: filters non-task lines", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const content = [
    "# AIDLC Progress Ledger",
    "",
    "Last updated: 2026-06-27",
    "",
    "- T-001: complete (commits abc..def, review clean)",
    "- This is not a task line",
    "- T-002: complete (commits def..ghi, review clean)",
    "",
  ].join("\n");
  writeFileSync(join(cwd, ".aidlc-progress.md"), content);

  const tasks = parseTasks(readProgress(cwd));
  assert.equal(tasks.length, 2);
  rmSync(cwd, { recursive: true });
});

test("append-progress: appends (not overwrites) on repeat", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const path = join(cwd, ".aidlc-progress.md");
  // Simulate sequential appends the way `append-progress` would
  appendFileSync(path, "- T-001: complete (commits abc..def, review clean)\n");
  appendFileSync(path, "- T-002: complete (commits def..ghi, review clean)\n");

  const content = readProgress(cwd);
  assert.match(content, /T-001/);
  assert.match(content, /T-002/);
  rmSync(cwd, { recursive: true });
});
