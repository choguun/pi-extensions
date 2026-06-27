// extensions/aidlc-workflow/test/skills-polish.test.ts
//
// Content tests for the Tier-3 polish-bundle skills (F8 + F9):
//   - F8: receiving-code-review (ban-list phrases, response pattern,
//     unclear-feedback + push-back sections)
//   - F9: finishing-a-development-branch (AIDLC worktree detection,
//     4-option presentation, worktree remove cleanup, install.sh symlink)

import assert from "node:assert/strict";
import { existsSync, readFileSync, lstatSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const F8_SKILL = join(ROOT, "skills/receiving-code-review/SKILL.md");
const F9_SKILL = join(ROOT, "skills/finishing-a-development-branch/SKILL.md");

function readSkill(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

// ---- F8: receiving-code-review ----

test("F8 receiving-code-review SKILL.md exists", () => {
  assert.ok(existsSync(F8_SKILL));
});

test("F8 has valid frontmatter", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /^---\nname: receiving-code-review\n/);
  assert.match(content, /^description: Use when/m);
});

test("F8 description ≤ 1024 chars", () => {
  const content = readSkill(F8_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("F8 contains 'The Response Pattern' with discipline steps", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /## The Response Pattern/);
  // Each step in the 6-step discipline is named in the skill body
  for (const step of ["READ", "UNDERSTAND", "VERIFY", "EVALUATE", "RESPOND", "IMPLEMENT"]) {
    assert.match(content, new RegExp(step));
  }
});

test("F8 contains ban-list phrases", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /You're absolutely right!/);
  assert.match(content, /Great point!/);
  assert.match(content, /Thanks!/);
});

test("F8 contains 'Handling Unclear Feedback' section", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /## Handling Unclear Feedback/);
});

test("F8 contains 'When To Push Back' section", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /## When To Push Back/);
});

test("F8 install.sh symlink points to right path", (t) => {
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/receiving-code-review/SKILL.md");
  if (!existsSync(linkPath)) {
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const stat = lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), `expected symlink at ${linkPath}`);
  // install.sh produces "//" artifacts in symlink targets (trailing
  // slash on the skill directory); normalize both sides.
  const target = readlinkSync(linkPath).replace(/\/\/+/g, "/");
  const expected = join(ROOT, "skills/receiving-code-review/SKILL.md");
  assert.equal(target, expected, `symlink should point to ${expected}, got ${target}`);
});

// ---- F9: finishing-a-development-branch ----

test("F9 finishing-a-development-branch SKILL.md exists", () => {
  assert.ok(existsSync(F9_SKILL));
});

test("F9 has valid frontmatter", () => {
  const content = readSkill(F9_SKILL);
  assert.match(content, /^---\nname: finishing-a-development-branch\n/);
  assert.match(content, /^description: Use when/m);
});

test("F9 description ≤ 1024 chars", () => {
  const content = readSkill(F9_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("F9 contains AIDLC worktree path detection", () => {
  const content = readSkill(F9_SKILL);
  assert.match(content, /pi-extensions-worktrees\/feat\//);
});

test("F9 contains 4 options presentation", () => {
  const content = readSkill(F9_SKILL);
  assert.match(content, /Merge back to <base-branch> locally/);
  assert.match(content, /Push and create a Pull Request/);
  assert.match(content, /Keep the branch as-is/);
  assert.match(content, /Discard this work/);
});

test("F9 contains AIDLC cleanup with git worktree remove", () => {
  const content = readSkill(F9_SKILL);
  assert.match(content, /git worktree remove/);
  assert.match(content, /git worktree prune/);
});

test("F9 install.sh symlink points to right path", (t) => {
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/finishing-a-development-branch/SKILL.md");
  if (!existsSync(linkPath)) {
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const stat = lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), `expected symlink at ${linkPath}`);
  const target = readlinkSync(linkPath).replace(/\/\/+/g, "/");
  const expected = join(ROOT, "skills/finishing-a-development-branch/SKILL.md");
  assert.equal(target, expected, `symlink should point to ${expected}, got ${target}`);
});
