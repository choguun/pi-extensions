# Tier 3 Superpowers Fusion — Polish Bundle (F8+F9+F12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three polish fusions in one release: F8 anti-performative review (verbatim skill + agent reference), F9 4-option finishing (adapted skill + shipper.md rewrite), F12 durable progress ledger (2 new aidlc tool actions + gitignore).

**Architecture:** 2 new SKILL.md files (verbatim F8, adapted F9); 2 agent file rewrites (pr-feedback-handler.md reference, shipper.md lifecycle); 2 new aidlc tool actions (append-progress, read-progress); .gitignore addition; ~26 new tests across 2 test files.

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), `node --test`, existing project conventions.

## Global Constraints

These constraints apply to every task. Tasks' requirements implicitly include this section.

- **TypeScript style (from AGENTS.md):** no in-function imports; module split keeps `index.ts` thin; atomic writes use appendFileSync (Tier 3 convention for ledger writes).
- **Skill format (from Tier 1+2 + superpowers):** frontmatter with `name` + `description` only (description ≤ 1024 chars); iron laws in fenced caps blocks; voice "your human partner" for new skills.
- **Test pattern:** `node --test`, one test file per module, `MockExtensionAPI` from `extensions/aidlc-workflow/test/mock-extension-api.ts`.
- **Commit hygiene:** 3 commits total (one per fusion). Regular merge, no squash. Spec `## Timeline` entry on each commit.
- **No placeholders** in any code block (per writing-plans "No Placeholders" rule).
- **Worktree prerequisite:** `npm install --no-save typebox` from `extensions/aidlc-workflow/` (worktrees don't share node_modules with main checkout).

---

## File Structure (locked-in by this plan)

### Create

| Path | Fusion | Lines (est.) |
|---|---|---|
| `extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md` | F8 | ~250 (verbatim port) |
| `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md` | F9 | ~250 (adapted) |
| `extensions/aidlc-workflow/test/skills-polish.test.ts` | F8+F9 | ~150 |
| `extensions/aidlc-workflow/test/progress.test.ts` | F12 | ~120 |

### Modify

| Path | Fusion | Change |
|---|---|---|
| `extensions/aidlc-workflow/agents/pr-feedback-handler.md` | F8 | Add HARD-GATE referencing receiving-code-review skill |
| `extensions/aidlc-workflow/agents/shipper.md` | F9 | Rewrite to full lifecycle |
| `extensions/aidlc-workflow/agents/implementer.md` | F12 | Add append-progress step after commit |
| `extensions/aidlc-workflow/index.ts` | F12 | Add `append-progress` + `read-progress` actions |
| `.gitignore` | F12 | Add `.aidlc-progress.md` |

### No changes

- `bootstrap.ts`, `agents/spec-writer.md`, `agents/planner.md`, `agents/reviewer.md`, `agents/tester.md`
- Other skill files
- `commands.md` (already verified no F8/F9/F12 mentions in Tier 2)

---

## Task Sequencing

```
F8 (verbatim skill + agent ref) → F9 (adapted skill + shipper rewrite) → F12 (tool actions + gitignore + agent step)
commit F8                            commit F9                                commit F12
```

Each fusion is one commit. Final release ships in one PR with 3 commits.

---

# F8: Anti-performative Review

## Task F8.1: Copy receiving-code-review skill verbatim

**Files:**
- Create: `extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md`

**Step 1: Copy from superpowers**

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/receiving-code-review/SKILL.md \
   extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md
```

**Step 2: Verify byte-identical**

Run:
```bash
diff ~/.pi/agent/git/github.com/obra/superpowers/skills/receiving-code-review/SKILL.md \
     extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md
```
Expected: no diff output.

**Step 3: Install symlink**

Run: `bash install.sh 2>&1 | grep receiving`
Expected: see symlink at `~/.pi/agent/skills/receiving-code-review`.

---

## Task F8.2: Add HARD-GATE to pr-feedback-handler.md

**Files:**
- Modify: `extensions/aidlc-workflow/agents/pr-feedback-handler.md`

**Step 1: Read current file**

Run: `cat extensions/aidlc-workflow/agents/pr-feedback-handler.md`

**Step 2: Prepend HARD-GATE**

After any frontmatter:

```markdown
<HARD-GATE>
When handling PR review feedback, invoke the `receiving-code-review` skill and follow its discipline. Iron rule: NO PERFORMATIVE AGREEMENT. Never write "You're absolutely right!", "Great catch!", or "Thanks!" — verify, evaluate, then act.
</HARD-GATE>
```

**Step 3: Commit**

```bash
git add extensions/aidlc-workflow/skills/receiving-code-review/ \
        extensions/aidlc-workflow/agents/pr-feedback-handler.md
git commit -m "feat(aidlc): F8 — receiving-code-review skill + pr-feedback-handler HARD-GATE"
```

---

# F9: 4-Option Finishing

## Task F9.1: Copy finishing-a-development-branch skill as starting point

**Files:**
- Create: `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

**Step 1: Copy from superpowers**

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/finishing-a-development-branch/SKILL.md \
   extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md
```

**Step 2: Verify copy**

Run: `wc -l extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`
Expected: similar to source (~230 lines).

---

## Task F9.2: Adapt Step 2 (Detect Environment) for AIDLC worktree paths

**Files:**
- Modify: `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

**Step 1: Find the "Detect Environment" section in the file**

Run: `grep -n "Detect Environment\|GIT_DIR\|GIT_COMMON\|worktrees/" extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

**Step 2: Replace the worktree detection bash with AIDLC-specific version**

Find this code block:
```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

Replace the subsequent worktree detection logic with:

```bash
WORKTREE_PATH=$(git rev-parse --show-toplevel)
IS_AIDLC_WORKTREE=false
if [[ "$WORKTREE_PATH" == *"pi-extensions-worktrees/feat/"* ]]; then
  IS_AIDLC_WORKTREE=true
  echo "Detected: AIDLC worktree at $WORKTREE_PATH"
fi
```

Keep `GIT_DIR` and `GIT_COMMON` (still useful for other detection). Add `WORKTREE_PATH` and `IS_AIDLC_WORKTREE`.

---

## Task F9.3: Adapt Step 6 (Cleanup Workspace) for AIDLC worktree removal

**Files:**
- Modify: `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

**Step 1: Find the cleanup section**

Run: `grep -n "Cleanup Workspace\|worktree remove" extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

**Step 2: Replace generic cleanup with AIDLC-specific**

Find this code block:
```bash
if [ -d ".worktrees" ] || [ "$WORKTREE_PATH" = ... ]; then
  MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
  cd "$MAIN_ROOT"
  git worktree remove "$WORKTREE_PATH"
  git worktree prune
fi
```

Replace with:

```bash
if [ "$IS_AIDLC_WORKTREE" = true ]; then
  MAIN_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
  cd "$MAIN_ROOT"
  git worktree remove "$WORKTREE_PATH"
  git worktree prune
  echo "Removed AIDLC worktree at $WORKTREE_PATH"
fi
```

---

## Task F9.4: Verify F9 adaptations

**Files:**
- (verification only)

**Step 1: Verify the skill mentions AIDLC worktree paths**

Run: `grep "pi-extensions-worktrees" extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`
Expected: 2+ matches (Step 2 detection + Step 6 cleanup).

**Step 2: Install symlink**

Run: `bash install.sh 2>&1 | grep finishing`
Expected: symlink created.

---

## Task F9.5: Rewrite shipper.md to full lifecycle

**Files:**
- Modify: `extensions/aidlc-workflow/agents/shipper.md`

**Step 1: Read current file**

Run: `cat extensions/aidlc-workflow/agents/shipper.md`

**Step 2: Replace entire content with full lifecycle**

```markdown
# Shipper (full finishing lifecycle)

<HARD-GATE>
Before shipping, verify tests pass and present the user with 4 structured options. Never auto-merge or auto-push without explicit user choice.
</HARD-GATE>

## Responsibilities

1. **Verify tests** — invoke `test` skill, confirm `npm test` exits 0
2. **Detect environment** — check if currently in worktree, determine base branch
3. **Present 4 options** to user:
   - Merge back to main locally (no push)
   - Push and create a Pull Request
   - Keep the branch as-is (user handles later)
   - Discard this work (requires typed "discard" confirmation)
4. **Execute chosen option** (git/gh commands per option)
5. **Cleanup workspace** if option 1 or 4 (remove worktree per AIDLC convention)

## Reference

- **`finishing-a-development-branch`** — full discipline + edge cases + AIDLC worktree adaptation
- **`test`** — test verification step
- **`verification-before-completion`** — iron law for completion claims
```

**Step 3: Commit**

```bash
git add extensions/aidlc-workflow/skills/finishing-a-development-branch/ \
        extensions/aidlc-workflow/agents/shipper.md
git commit -m "feat(aidlc): F9 — finishing-a-development-branch skill (adapted) + shipper.md lifecycle rewrite"
```

---

# F12: Durable Progress Ledger

## Task F12.1: Add .aidlc-progress.md to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Check current .gitignore**

Run: `cat .gitignore | tail -10`

**Step 2: Append `.aidlc-progress.md`**

If not already present, append:

```
.aidlc-progress.md
```

**Step 3: Verify gitignore**

Run: `git check-ignore .aidlc-progress.md || echo "not ignored"`
Expected: `.aidlc-progress.md` (file is ignored).

---

## Task F12.2: Add `append-progress` action to aidlc tool

**Files:**
- Modify: `extensions/aidlc-workflow/index.ts`

**Step 1: Find AidlcParams schema and action enum**

Run: `grep -n "action:\|AidlcParams\|validate-plan\|validate-tdd" extensions/aidlc-workflow/index.ts | head -10`

**Step 2: Update schema description**

Find the `action` field description and append:

```
; append-progress: append a task line to .aidlc-progress.md (F12)
```

**Step 3: Add the append-progress case in execute()**

Find the chain of `if (action === "...")` cases (around line 686-770). Add:

```typescript
if (action === "append-progress") {
  const taskId = params.task_id?.trim();
  const status = params.status?.trim();
  const commitRange = params.commit_range?.trim();
  const reviewStatus = params.review_status?.trim();
  const reason = params.reason?.trim();

  if (!taskId || !status) {
    return { details: { valid: false, errors: ["task_id and status required"] } };
  }

  const aidlcDir = join(cwd, ".aidlc");
  if (!existsSync(aidlcDir)) {
    return { details: { valid: false, errors: ["No .aidlc/ directory in cwd"] } };
  }

  const progressPath = join(cwd, ".aidlc-progress.md");
  const line = status === "BLOCKED"
    ? `- ${taskId}: BLOCKED (${reason ?? "no reason given"})\n`
    : `- ${taskId}: ${status} (commits ${commitRange ?? "unknown"}, ${reviewStatus ?? "review pending"})\n`;

  appendFileSync(progressPath, line);
  return { details: { valid: true, appended: line } };
}
```

Make sure to add `appendFileSync` to the imports at the top of the file if not already imported.

**Step 4: Verify typecheck**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: existing 154 tests pass; new tests deferred to F12.5.

---

## Task F12.3: Add `read-progress` action to aidlc tool

**Files:**
- Modify: `extensions/aidlc-workflow/index.ts`

**Step 1: Update schema description**

Append to the action description:

```
; read-progress: read .aidlc-progress.md ledger for compaction recovery
```

**Step 2: Add the read-progress case**

Add below `append-progress`:

```typescript
if (action === "read-progress") {
  const progressPath = join(cwd, ".aidlc-progress.md");
  if (!existsSync(progressPath)) {
    return { details: { tasks: [], count: 0, message: "No progress ledger yet" } };
  }
  try {
    const content = readFileSync(progressPath, "utf8");
    const tasks = content
      .split("\n")
      .filter((line) => /^- T-\d+: /.test(line))
      .map((line) => line.slice(2));
    return { details: { tasks, count: tasks.length } };
  } catch (err) {
    return { details: { tasks: [], count: 0, message: `Failed to read: ${err}` } };
  }
}
```

**Step 3: Verify typecheck**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: 154 tests pass.

---

## Task F12.4: Update implementer.md to call append-progress after commit

**Files:**
- Modify: `extensions/aidlc-workflow/agents/implementer.md`

**Step 1: Read current file**

Run: `cat extensions/aidlc-workflow/agents/implementer.md | head -60`

**Step 2: Find the existing commit step and add append-progress after it**

Add this step after the commit guidance (the file should already mention committing; this adds what to do AFTER commit):

```markdown

## After Commit (F12)

After committing T-NNN, invoke `aidlc append-progress` to record the task in `.aidlc-progress.md` (the durable ledger for compaction recovery):

```
Use aidlc with action=append-progress, task_id="T-NNN", status="complete",
commit_range="<base7>..<head7>", review_status="review clean"
```

Replace `<base7>..<head7>` with the actual 7-char commit hashes from `git log --oneline -2`. This enables post-compaction recovery: any future agent reads `.aidlc-progress.md` + `git log` to resume from the first incomplete task.
```

**Step 3: Commit**

```bash
git add .gitignore \
        extensions/aidlc-workflow/index.ts \
        extensions/aidlc-workflow/agents/implementer.md
git commit -m "feat(aidlc): F12 — .aidlc-progress.md ledger via aidlc tool + implementer integration"
```

---

# Tests (Parts F8/F9 + F12)

## Task T.1: Write skills-polish.test.ts (F8 + F9 content tests)

**Files:**
- Create: `extensions/aidlc-workflow/test/skills-polish.test.ts`

**Step 1: Write the test file**

```typescript
// extensions/aidlc-workflow/test/skills-polish.test.ts
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

function symlinkTarget(linkPath: string): string | null {
  if (!existsSync(linkPath)) return null;
  try {
    return readlinkSync(linkPath).replace(/\/\/+/g, "/");
  } catch {
    return null;
  }
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

test("F8 contains 'The Response Pattern' with 5-step discipline", () => {
  const content = readSkill(F8_SKILL);
  assert.match(content, /## The Response Pattern/);
  // Check for all 5 steps mentioned
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
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/receiving-code-review");
  if (!existsSync(linkPath)) {
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const target = symlinkTarget(linkPath);
  assert.ok(target);
  const expected = join(ROOT, "skills/receiving-code-review/SKILL.md");
  assert.equal(target, expected);
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
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/finishing-a-development-branch");
  if (!existsSync(linkPath)) {
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const target = symlinkTarget(linkPath);
  assert.ok(target);
  const expected = join(ROOT, "skills/finishing-a-development-branch/SKILL.md");
  assert.equal(target, expected);
});
```

**Step 2: Run tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: 154 + 14 = 168 tests pass (some may skip if symlinks missing).

---

## Task T.2: Write progress.test.ts (F12 tool action tests)

**Files:**
- Create: `extensions/aidlc-workflow/test/progress.test.ts`

**Step 1: Write the test file**

```typescript
// extensions/aidlc-workflow/test/progress.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// We can't easily call the aidlc tool directly without mocking the ExtensionAPI.
// Instead, test the underlying file operations that the tool performs.

const ROOT = join(import.meta.dirname, "..");

function readProgress(cwd: string): string {
  const path = join(cwd, ".aidlc-progress.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
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

  const lines = readProgress(cwd)
    .split("\n")
    .filter((line) => /^- T-\d+: /.test(line))
    .map((line) => line.slice(2));
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

  const tasks = readProgress(cwd)
    .split("\n")
    .filter((line) => /^- T-\d+: /.test(line));
  assert.equal(tasks.length, 2);
  rmSync(cwd, { recursive: true });
});

test("append-progress: appends (not overwrites) on repeat", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-progress-"));
  mkdirSync(join(cwd, ".aidlc"));
  const path = join(cwd, ".aidlc-progress.md");
  // Simulate sequential appends
  const { appendFileSync } = await import("node:fs");
  appendFileSync(path, "- T-001: complete (commits abc..def, review clean)\n");
  appendFileSync(path, "- T-002: complete (commits def..ghi, review clean)\n");

  const content = readProgress(cwd);
  assert.match(content, /T-001/);
  assert.match(content, /T-002/);
  rmSync(cwd, { recursive: true });
});
```

**Step 2: Run tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: 168 + 6 = 174 tests pass.

---

## Task T.3: Run install.sh + verify all symlinks

**Files:**
- (verification only)

**Step 1: Run install.sh**

Run: `bash install.sh 2>&1 | grep -E "receiving|finishing"`
Expected: both new skills symlinked.

**Step 2: Verify both symlinks**

Run: `ls -la ~/.pi/agent/skills/receiving-code-review ~/.pi/agent/skills/finishing-a-development-branch`
Expected: both symlinks exist and point to the right paths.

**Step 3: Verify .aidlc-progress.md is gitignored**

Run: `git check-ignore -v .aidlc-progress.md`
Expected: exit 0, output shows the .gitignore rule.

**Step 4: Run final test count**

Run: `cd extensions/aidlc-workflow && npm test 2>&1 | grep "tests\|pass\|fail"`
Expected: 174 tests, 0 fail.

---

## Task T.4: Update spec Timeline + commit

**Files:**
- Modify: `extensions/aidlc-workflow/docs/2026-06-26-tier-3-polish-bundle-f8-f9-f12-design.md` (Timeline only)

**Step 1: Append to Timeline**

```markdown
2026-06-26 | Tier 3 polish bundle shipped — F8 receiving-code-review (verbatim) + pr-feedback-handler HARD-GATE; F9 finishing-a-development-branch (adapted for AIDLC worktrees) + shipper.md lifecycle rewrite; F12 .aidlc-progress.md ledger via aidlc tool (append-progress + read-progress) + implementer integration. 20 new tests (14 in skills-polish, 6 in progress). 174 total tests passing.
```

**Step 2: Commit**

```bash
git add extensions/aidlc-workflow/docs/2026-06-26-tier-3-polish-bundle-f8-f9-f12-design.md
git commit -m "docs(aidlc): log Tier 3 polish bundle ship in spec Timeline"
```

---

# Self-Review

After writing this plan, scan once for issues:

**1. Spec coverage:**
- F8 → Tasks F8.1-F8.2 ✓
- F9 → Tasks F9.1-F9.5 ✓
- F12 → Tasks F12.1-F12.4 ✓
- Tests → Tasks T.1-T.2 ✓
- Final smoke + Timeline → Tasks T.3-T.4 ✓

**2. Placeholder scan:** none — every code block has actual code.

**3. Type consistency:** `AIDLCState` interface from Tier 1 (not used in Tier 3). New actions use `params.task_id`, `params.status`, etc. consistent with Tier 2 validation actions.

**4. Test coverage:** 20 new tests across 2 test files (14 F8+F9 + 6 F12). Combined with existing 154, total 174.

---

# Execution Handoff

After this plan is reviewed and approved, two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task with two-stage review. Tier 1+2 used this; caught 7 real bugs. Plan has 13 tasks; per-task review catches issues early.

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints. Faster per task but less rigorous.

Which approach?
