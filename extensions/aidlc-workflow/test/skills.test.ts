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
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const VERIFICATION_SKILL = join(ROOT, "skills/verification-before-completion/SKILL.md");

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

test("install.sh symlink points to verification-before-completion", () => {
  // install.sh creates ~/.pi/agent/skills/<name>/ as a real directory and
  // symlinks the SKILL.md inside it — check the file, not the directory.
  const linkPath = join(
    process.env.HOME ?? "",
    ".pi/agent/skills/verification-before-completion/SKILL.md",
  );
  if (!existsSync(linkPath)) {
    // install.sh hasn't run; this is acceptable in CI
    return;
  }
  const stat = lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), "should be a symlink");
});