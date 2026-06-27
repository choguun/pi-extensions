// extensions/aidlc-workflow/test/skills.test.ts
//
// Tests for the AIDLC skills/ subtree — verifies that every skill:
//   - exists at the documented path
//   - has valid YAML frontmatter (name + description)
//   - description fits pi's 1024-char limit
//   - includes the iron-law / anti-rationalization content the
//     Tier-1 fusion passes require
//
// F3 (verification-before-completion) also verifies:
//   - the shipper and reviewer agents reference the new skill
//   - install.sh creates the symlink under ~/.pi/agent/skills/

import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const VERIFICATION_SKILL = join(ROOT, "skills/verification-before-completion/SKILL.md");
const DEBUGGING_SKILL = join(ROOT, "skills/systematic-debugging/SKILL.md");

function readSkill(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- F3: verification-before-completion ----

test("verification-before-completion SKILL.md exists", () => {
  assert.ok(existsSync(VERIFICATION_SKILL));
});

test("verification-before-completion has valid frontmatter", () => {
  const content = readSkill(VERIFICATION_SKILL);
  assert.match(content, /^---\nname: verification-before-completion\n/);
  assert.match(content, /^description: Use when/m);
});

test("verification-before-completion description ≤ 1024 chars", () => {
  const content = readSkill(VERIFICATION_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match, "description line must be present");
  assert.ok(
    match[1].length <= 1024,
    `description is ${match[1].length} chars (max 1024)`,
  );
});

test("verification-before-completion contains iron law", () => {
  const content = readSkill(VERIFICATION_SKILL);
  assert.match(content, /NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE/);
});

test("verification-before-completion contains all 5 Key Patterns", () => {
  const content = readSkill(VERIFICATION_SKILL);
  for (const pattern of ["Tests:", "Regression tests", "Build:", "Requirements:", "Agent delegation"]) {
    assert.match(content, new RegExp(escapeRegExp(pattern)));
  }
});

test("shipper.md references verification-before-completion", () => {
  const content = readSkill(join(ROOT, "agents/shipper.md"));
  assert.match(content, /verification-before-completion/);
});

test("reviewer.md references verification-before-completion", () => {
  const content = readSkill(join(ROOT, "agents/reviewer.md"));
  assert.match(content, /verification-before-completion/);
});

test("install.sh symlink points to verification-before-completion", (t) => {
  // install.sh creates ~/.pi/agent/skills/<name>/ as a real directory and
  // symlinks the SKILL.md inside it — check the file, not the directory.
  const linkPath = join(
    process.env.HOME ?? "",
    ".pi/agent/skills/verification-before-completion/SKILL.md",
  );
  if (!existsSync(linkPath)) {
    // Skip — not silently pass. A silent `return` would report the test as
    // passing without any assertion, which is exactly the false-positive
    // failure mode the verification-before-completion skill warns about.
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const stat = lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), `expected symlink at ${linkPath}`);
  // Verify WHERE the symlink points, not just THAT it's a symlink. A stale
  // link to a deleted file would otherwise pass. install.sh builds the
  // target as "$skill/SKILL.md" where $skill is a directory path with a
  // trailing slash, producing a "//" artifact — normalize both sides.
  const target = readlinkSync(linkPath);
  const expected = join(ROOT, "skills/verification-before-completion/SKILL.md");
  assert.equal(
    target.replace(/\/+/g, "/"),
    expected.replace(/\/+/g, "/"),
    `symlink should point to ${expected}, got ${target}`,
  );
});

// ---- F4: systematic-debugging ----

test("systematic-debugging SKILL.md exists", () => {
  assert.ok(existsSync(DEBUGGING_SKILL));
});

test("systematic-debugging has valid frontmatter", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /^---\nname: systematic-debugging\n/);
  assert.match(content, /^description: Use when/m);
});

test("systematic-debugging description ≤ 1024 chars", () => {
  const content = readSkill(DEBUGGING_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("systematic-debugging contains iron law", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST/);
});

test("systematic-debugging contains all 4 phase headers", () => {
  const content = readSkill(DEBUGGING_SKILL);
  for (const phase of [
    "Root Cause Investigation",
    "Pattern Analysis",
    "Hypothesis and Testing",
    "Implementation",
  ]) {
    assert.match(content, new RegExp(phase));
  }
});

test("systematic-debugging contains the '3+ Fixes Failed' rule", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /3\+ Fixes Failed/);
});

test("test/SKILL.md references systematic-debugging", () => {
  const content = readSkill(join(ROOT, "skills/test/SKILL.md"));
  assert.match(content, /systematic-debugging/);
});

test("implement/SKILL.md references systematic-debugging", () => {
  const content = readSkill(join(ROOT, "skills/implement/SKILL.md"));
  assert.match(content, /systematic-debugging/);
});

// ---- F6: execute-task orchestrator (implementer agent) ----
//
// F6 redefines the implementer agent as an orchestrator that delegates
// each T-XXX task to a fresh subagent via `aidlc execute-task`. The
// TDD-as-iron-law content moved to the test-driven-development skill
// (tested in skills-tdd.test.ts). The tests below lock in the new
// orchestrator contract: HARD-GATE, Workflow section, Reference
// section, and the dispatch-skill cross-links.

test("implementer.md contains HARD-GATE block", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.match(content, /<HARD-GATE>[\s\S]*aidlc execute-task[\s\S]*<\/HARD-GATE>/);
});

test("implementer.md contains Workflow section", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.match(content, /## Workflow/);
});

test("implementer.md contains Reference section", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.match(content, /## Reference/);
});

test("implementer.md references test-driven-development skill", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.match(content, /test-driven-development/);
});

test("implementer.md references subagent-driven-development skill", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.match(content, /subagent-driven-development/);
});

test("implementer.md HARD-GATE appears before the body sections", () => {
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  const hardGateIdx = content.indexOf("<HARD-GATE>");
  const workflowIdx = content.indexOf("## Workflow");
  assert.ok(hardGateIdx >= 0, "HARD-GATE block missing");
  assert.ok(workflowIdx >= 0, "## Workflow section missing");
  assert.ok(hardGateIdx < workflowIdx, "HARD-GATE must appear before ## Workflow");
});

test("implementer.md no longer has scattered RED step from old cycle", () => {
  // The old implementer.md had step 5 = "RED: write a failing test that
  // captures the task's acceptance criteria" inline. After F6 that
  // detail lives in the test-driven-development skill; the agent file
  // references the skill instead.
  const content = readSkill(join(ROOT, "agents/implementer.md"));
  assert.doesNotMatch(content, /RED: write a failing test that captures the task/);
});