// extensions/aidlc-workflow/test/skills-tdd.test.ts
//
// Content tests for the new test-driven-development skill (Tier-1
// fusion). Verifies the skill:
//   - exists at the documented path
//   - has valid YAML frontmatter (name + description)
//   - description fits pi's 1024-char limit
//   - includes the iron law + RED/GREEN/REFACTOR sections
//   - has the AIDLC-Specific Notes section
//   - cross-links to systematic-debugging (F4)
//   - is symlinked by install.sh under ~/.pi/agent/skills/

import assert from "node:assert/strict";
import { existsSync, readFileSync, lstatSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const TDD_SKILL = join(ROOT, "skills/test-driven-development/SKILL.md");

function readSkill(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

test("test-driven-development SKILL.md exists", () => {
  assert.ok(existsSync(TDD_SKILL));
});

test("test-driven-development has valid frontmatter", () => {
  const content = readSkill(TDD_SKILL);
  assert.match(content, /^---\nname: test-driven-development\n/);
  assert.match(content, /^description: Use when/m);
});

test("test-driven-development description ≤ 1024 chars", () => {
  const content = readSkill(TDD_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("test-driven-development contains iron law", () => {
  const content = readSkill(TDD_SKILL);
  assert.match(content, /NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST/);
});

test("test-driven-development contains all 3 RED/GREEN/REFACTOR sections", () => {
  const content = readSkill(TDD_SKILL);
  assert.match(content, /## RED - Write Failing Test|## RED/i);
  assert.match(content, /## GREEN - Minimal Code|## GREEN/i);
  assert.match(content, /## REFACTOR - Clean Up|## REFACTOR/i);
});

test("test-driven-development contains 'AIDLC-Specific Notes' section", () => {
  const content = readSkill(TDD_SKILL);
  assert.match(content, /## AIDLC-Specific Notes/);
});

test("test-driven-development references systematic-debugging (F4 cross-link)", () => {
  const content = readSkill(TDD_SKILL);
  assert.match(content, /systematic-debugging/);
});

test("install.sh symlink points to test-driven-development", (t) => {
  // install.sh creates ~/.pi/agent/skills/<name>/ as a real directory and
  // symlinks the SKILL.md inside it — check the file, not the directory.
  const linkPath = join(
    process.env.HOME ?? "",
    ".pi/agent/skills/test-driven-development/SKILL.md",
  );
  if (!existsSync(linkPath)) {
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
  const expected = join(ROOT, "skills/test-driven-development/SKILL.md");
  assert.equal(
    target.replace(/\/+/g, "/"),
    expected.replace(/\/+/g, "/"),
    `symlink should point to ${expected}, got ${target}`,
  );
});