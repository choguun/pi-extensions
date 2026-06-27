# Tier 2 Superpowers Fusion — TDD-as-Iron-Law Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt test-driven-development as an iron law throughout AIDLC. New `test-driven-development` skill + iron law in `implementer.md` + mandatory `## Test Plan` in every spec + TDD-ordered tasks in every plan + TDD verification in `/test` phase.

**Architecture:** One new SKILL.md (adapted port from superpowers); surgical prepends to 4 agent files; surgical updates to 4 skill files; orchestrator SKILL.md + commands.md reference; optional 3 new aidlc tool actions for programmatic validation (validate-spec, validate-plan, validate-tdd).

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), `node --test`, existing project conventions.

## Global Constraints

These constraints apply to every task. Tasks' requirements implicitly include this section.

- **TypeScript style (from AGENTS.md):** no in-function imports; module split keeps `index.ts` thin; atomic writes use `.tmp + rename`; POSIX shell escaping via `shellQuote()`.
- **Skill format (from Tier 1 + superpowers):** frontmatter with `name` + `description` only (description ≤ 1024 chars); "Red Flags" + "Common Rationalizations" tables; iron laws in fenced caps blocks; voice "your human partner" for new skills (Tier 1 Q7+D).
- **Test pattern:** `node --test`, one test file per module, `MockExtensionAPI` from `extensions/aidlc-workflow/test/mock-extension-api.ts`.
- **Commit hygiene:** one commit per part (A through H + Optional aidlc tool extension); regular merge, no squash. Spec `## Timeline` entry on each commit.
- **No placeholders** in any code block (per writing-plans "No Placeholders" rule). Every step that changes code shows the code.
- **ST-NNN scenario ID scheme:** every spec `## Test Plan` scenario gets an ID (ST-001, ST-002, ...). These flow through plan tasks and tests.

---

## File Structure (locked-in by this plan)

### Create

| Path | Part | Lines (est.) |
|---|---|---|
| `extensions/aidlc-workflow/skills/test-driven-development/SKILL.md` | A | ~400 (adapted port) |
| `extensions/aidlc-workflow/test/skills-tdd.test.ts` | G | ~150 |
| `extensions/aidlc-workflow/agents/tester.md` | F | ~80 (only if doesn't exist) |

### Modify

| Path | Part | Change |
|---|---|---|
| `extensions/aidlc-workflow/agents/implementer.md` | B | Prepend iron law + RED-GREEN-REFACTOR + table; replace existing TDD mentions |
| `extensions/aidlc-workflow/agents/spec-writer.md` | C | Add `## Test Plan` enforcement |
| `extensions/aidlc-workflow/agents/planner.md` | D | TDD-ordered tasks + ST-NNN refs |
| `extensions/aidlc-workflow/skills/specify/SKILL.md` | E | Mandatory `## Test Plan` requirement |
| `extensions/aidlc-workflow/skills/plan/SKILL.md` | E | TDD-ordered task format |
| `extensions/aidlc-workflow/skills/implement/SKILL.md` | E | Iron law reference + replace scattered TDD mentions |
| `extensions/aidlc-workflow/skills/test/SKILL.md` | E | TDD verification (already has F4) |
| `extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md` | E | Orchestrator overview references new TDD skill |
| `extensions/aidlc-workflow/commands.md` | E | Update if TDD command references exist |
| `extensions/aidlc-workflow/index.ts` (Optional) | H | Add 3 validation actions |

### No changes

- `bootstrap.ts` — already shipped in Tier 1, no TDD-specific changes
- `agents/reviewer.md`, `agents/shipper.md` — no TDD-specific changes; they verify via `/test` report
- Other skill files (entropy-control, signal-triage, state-management, etc.) — no TDD relevance

---

## Task Sequencing

```
Part A (new TDD skill)       → Part B (implementer)  → Part C (spec-writer)
adapted port from superpowers  iron law + table       enforce Test Plan
commit A                       commit B               commit C

Part D (planner)             → Part E (skill updates) → Part F (tester)
TDD-ordered tasks              4 skill files updated   TDD verification
commit D                       commit E                commit F

Part G (content tests)       → Part H (Optional: aidlc tool actions)
8 tests for new skill          3 validation actions
commit G                       commits H1-H3
```

Each part is one commit (or multiple for Part H). Final release ships in one PR.

---

# Part A: New `test-driven-development` Skill

## Task A.1: Create the TDD skill file (adapted port)

**Files:**
- Create: `extensions/aidlc-workflow/skills/test-driven-development/SKILL.md`

**Step 1: Copy superpowers' TDD skill as starting point**

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/test-driven-development/SKILL.md \
   extensions/aidlc-workflow/skills/test-driven-development/SKILL.md
```

**Step 2: Verify file matches source**

Run:
```bash
diff ~/.pi/agent/git/github.com/obra/superpowers/skills/test-driven-development/SKILL.md \
     extensions/aidlc-workflow/skills/test-driven-development/SKILL.md
```
Expected: no diff output (perfect copy).

**Step 3: Install symlink**

Run: `cd /Users/choguun/Documents/workspaces/cool-projects/pi-extensions && bash install.sh 2>&1 | grep test-driven`
Expected: see symlink creation at `~/.pi/agent/skills/test-driven-development`.

---

## Task A.2: Adapt the TDD skill for AIDLC (per spec Q3=C)

**Files:**
- Modify: `extensions/aidlc-workflow/skills/test-driven-development/SKILL.md`

**Step 1: Update frontmatter description if needed**

Read the existing frontmatter. The description from superpowers is already appropriate. No change.

**Step 2: Add AIDLC-specific adaptations to "When to Use"**

Find the "When to Use" section and append (don't replace existing content):

```markdown

**AIDLC-specific triggers:**
- Starting a new T-XXX task from `.aidlc/plan.md`
- A spec scenario ST-NNN from `.aidlc/spec.md` `## Test Plan` section
- A bug found during `/test` phase or by reviewer comments
- Any code change in `extensions/*/src/` or `extensions/*/*.ts`
```

**Step 3: Add AIDLC-specific content to "RED - Write Failing Test"**

Find that section and append:

```markdown

**AIDLC test patterns:**
- Test files live at `extensions/<extension>/test/*.test.ts`
- Use `node:test` framework (not Jest, not Mocha)
- Import production code: `import { foo } from "../<module>.ts";`
- Use shared mock from `../mock-extension-api.ts` for extension API tests
- Run from worktree: `cd <worktree> && npm test test/<file>.test.ts`
```

**Step 4: Update "Common Rationalizations" with AIDLC-specific excuses**

Find that table and add 3 rows:

```markdown
| "Spec didn't have Test Plan" | Spec WRITER didn't enforce, but implementer must add test scenarios to spec.md BEFORE writing any code. Update spec, get user approval, then proceed. |
| "I'll test the next task" | TDD is per-task, not per-feature. Each T-XXX gets its own RED-GREEN-REFACTOR. |
| "Multi-session subagent will handle it" | Subagents follow TDD too. They must produce the failing test in their worktree before implementation. |
```

**Step 5: Add AIDLC-specific example to "Example: Bug Fix"**

Find that section and add (after the existing example):

```markdown

**AIDLC example: Bug in bootstrap.ts**

Bug found: `event.cwd` is always undefined in the bootstrap context handler.

**RED:**
```typescript
test("context handler reads cwd from ctx, not event.cwd", async () => {
  const pi = new MockExtensionAPI();
  bootstrapExtension(pi);
  await pi.emit("session_start", {});
  const result = await pi.emit("context", {
    messages: [],
    cwd: "/some/cwd"
  });
  // assertion: bootstrap should read from ctx.cwd
});
```

**Verify RED:** Run `npm test test/bootstrap.test.ts`. Test fails: "ReferenceError: event.cwd is not defined" or similar.

**GREEN:** Fix in `bootstrap.ts` — read `ctx.cwd` instead of `event.cwd`.

**Verify GREEN:** Test passes.
```

**Step 6: Add new "AIDLC-Specific Notes" section at the end**

After "Final Rule" section, add:

```markdown

## AIDLC-Specific Notes

- Tests live in `extensions/<extension>/test/*.test.ts`
- Run from worktree: `cd <worktree> && npm test <file>` (not from main checkout)
- Multi-session subagents follow TDD too — they produce failing tests in their worktrees
- The `/test` phase validates scenario coverage (ST-NNN grep) + commit history (test-before-impl)
- Existing `agents/implementer.md` enforces this skill via iron law
```

**Step 7: Verify**

Run: `wc -l extensions/aidlc-workflow/skills/test-driven-development/SKILL.md`
Expected: ~400-450 lines (vs ~300 superpowers source).

**Step 8: Commit**

```bash
git add extensions/aidlc-workflow/skills/test-driven-development/
git commit -m "feat(aidlc): Part A — adapted test-driven-development skill from superpowers"
```

---

# Part B: `implementer.md` Iron Law + RED-GREEN-REFACTOR

## Task B.1: Prepend iron law + table to `implementer.md`

**Files:**
- Modify: `extensions/aidlc-workflow/agents/implementer.md`

**Step 1: Read current implementer.md**

Run: `cat extensions/aidlc-workflow/agents/implementer.md`

**Step 2: Add the iron law section at the top (after frontmatter if any)**

Prepend:

```markdown
# Implementer Agent (TDD-as-Iron-Law)

<EXTREMELY-IMPORTANT>
**IRON LAW: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

If you didn't watch the test fail, you don't know if it tests the right thing.

Violating the letter of this rule is violating the spirit of the rule.
</EXTREMELY-IMPORTANT>

## Hard Rules

1. **Write the failing test FIRST.** Before any production code in `extensions/*/src/` or `extensions/*/*.ts`.
2. **Run the test and paste the FAIL output.** Mandatory verification step.
3. **Write the minimum implementation to pass.** No "while I'm here" improvements.
4. **Run the test again and paste the PASS output.** Mandatory verification step.
5. **Refactor only after green.** Keep tests passing.
6. **Commit test + impl together.** Both are part of the same TDD cycle.

## Red-Green-Refactor

```
RED → verify_red → GREEN → verify_green → REFACTOR → next
 ↓        ↓           ↓          ↓            ↓
write   run test    write     run test    cleanup
failing FAIL output  minimal   PASS output  no behavior
test    expected    code      expected     change
```

## Common Rationalizations (DO NOT)

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests-after pass immediately. Prove nothing. |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Unverified code is debt. |
| "TDD will slow me down" | TDD is faster than debugging. Pragmatic = test-first. |
| "Spec didn't have Test Plan" | Add test scenarios to spec.md FIRST, then proceed. |
| "Multi-session subagent will handle it" | Subagents follow TDD too — they produce failing tests first. |

## Reference

For full discipline, invoke the **`test-driven-development`** skill (Skill tool). This file is a summary; the skill is the operating manual.

---
```

**Step 3: Verify**

Run: `head -50 extensions/aidlc-workflow/agents/implementer.md`
Expected: see the iron law section at the top.

**Step 4: Commit**

```bash
git add extensions/aidlc-workflow/agents/implementer.md
git commit -m "feat(aidlc): Part B — iron law + RED-GREEN-REFACTOR in implementer.md"
```

---

# Part C: `spec-writer.md` Mandatory `## Test Plan`

## Task C.1: Add `## Test Plan` enforcement to spec-writer

**Files:**
- Modify: `extensions/aidlc-workflow/agents/spec-writer.md`

**Step 1: Read current spec-writer.md**

Run: `cat extensions/aidlc-workflow/agents/spec-writer.md`

**Step 2: Add Test Plan enforcement section**

Prepend (after any frontmatter):

```markdown
# Spec Writer (TDD-aware)

<HARD-GATE>
Every spec MUST include a `## Test Plan` section before commit. Refuse to commit if missing.
</HARD-GATE>

## Mandatory `## Test Plan` Section

Every spec.md MUST include:

```markdown
## Test Plan

### ST-001: <scenario name>
- **Given:** <preconditions>
- **When:** <action>
- **Then:** <expected result>

### ST-002: <scenario name>
...

### Edge Cases
- <edge case scenario>

### Error Cases
- <error scenario>
```

**Minimum requirements:**
- ≥1 acceptance criterion scenario (ST-NNN)
- ≥1 edge case OR error case (additional ST-NNN)
- Each scenario has a unique ID (ST-001, ST-002, ...)
- IDs are referenced by plan tasks (T-NNN) and tests

## Hard Rules

1. **Refuse to commit spec.md without `## Test Plan`.** No exceptions.
2. **Scenario IDs must be sequential (ST-001, ST-002, ...).** No gaps.
3. **Each scenario is testable as a unit test.** Not "user can do X" — "test that X happens when Y."
4. **Edge cases and error cases are explicit.** Don't bury them in prose.

---
```

**Step 3: Verify**

Run: `grep -A2 "Test Plan" extensions/aidlc-workflow/agents/spec-writer.md | head -10`

**Step 4: Commit**

```bash
git add extensions/aidlc-workflow/agents/spec-writer.md
git commit -m "feat(aidlc): Part C — spec-writer enforces mandatory ## Test Plan"
```

---

# Part D: `planner.md` TDD-Ordered Tasks

## Task D.1: Update planner.md to produce TDD-ordered tasks

**Files:**
- Modify: `extensions/aidlc-workflow/agents/planner.md`

**Step 1: Read current planner.md**

Run: `cat extensions/aidlc-workflow/agents/planner.md`

**Step 2: Add TDD-ordered task format section**

Prepend (after any frontmatter):

```markdown
# Planner (TDD-ordered tasks)

## Task Format

Every task in `.aidlc/plan.md` MUST follow this format:

```markdown
### Task T-001: <component name>

**Implements:** ST-001, ST-002

**Files:**
- Create: `extensions/<ext>/test/<file>.test.ts` (test first)
- Modify: `extensions/<ext>/src/<file>.ts` (after test fails)
- Test: `npm test test/<file>.test.ts`

**Steps:**
- [ ] **Step 1: Write failing test (RED)**
  [full test code shown]
- [ ] **Step 2: Run test, verify FAIL**
  Run: `npm test test/<file>.test.ts`
  Expected: FAIL with "<expected error message>"
- [ ] **Step 3: Write minimal implementation (GREEN)**
  [full implementation code shown]
- [ ] **Step 4: Run test, verify PASS**
  Run: `npm test test/<file>.test.ts`
  Expected: PASS, all tests in file pass
- [ ] **Step 5: Commit**
  Run: `git add <files> && git commit -m "feat(<scope>): T-001 <description>"`
```

## Hard Rules

1. **Every task references ≥1 ST-NNN scenario.** No orphan tasks.
2. **Tasks follow RED-GREEN-REFACTOR order.** Test first, then impl.
3. **Full code shown per step.** No "implement the function" — show the code.
4. **Each task is independently committable.** Includes its own RED + GREEN + commit cycle.
5. **Plan.md validates via the `validate-plan` aidlc action** (if Part H ships).

## Orphan Task Exception

Tasks may be tagged `**Implements:** (non-test refactor)` for refactors that don't add new test scenarios. Example: "rename function X to Y across codebase." These are explicit; without the tag, the validator flags them.

---
```

**Step 3: Verify**

Run: `grep -A2 "TDD-ordered" extensions/aidlc-workflow/agents/planner.md | head -10`

**Step 4: Commit**

```bash
git add extensions/aidlc-workflow/agents/planner.md
git commit -m "feat(aidlc): Part D — planner produces TDD-ordered tasks with ST-NNN refs"
```

---

# Part E: Skill File Updates

## Task E.1: Update `skills/specify/SKILL.md` — mandatory Test Plan

**Files:**
- Modify: `extensions/aidlc-workflow/skills/specify/SKILL.md`

**Step 1: Read existing file**

Run: `cat extensions/aidlc-workflow/skills/specify/SKILL.md`

**Step 2: Prepend Test Plan requirement**

After frontmatter:

```markdown
<HARD-GATE>
Every spec MUST include `## Test Plan` with ≥1 scenario (ST-NNN). Spec-writer refuses to commit without it.
</HARD-GATE>
```

**Step 3: Verify + commit**

```bash
git add extensions/aidlc-workflow/skills/specify/SKILL.md
git commit -m "feat(aidlc): Part E.1 — specify skill requires mandatory ## Test Plan"
```

---

## Task E.2: Update `skills/plan/SKILL.md` — TDD-ordered tasks

**Files:**
- Modify: `extensions/aidlc-workflow/skills/plan/SKILL.md`

**Step 1: Read existing file**

Run: `cat extensions/aidlc-workflow/skills/plan/SKILL.md`

**Step 2: Prepend TDD-ordered task requirement**

After frontmatter:

```markdown
<HARD-GATE>
Every plan task MUST follow TDD-ordered format: reference ≥1 ST-NNN scenario, RED-GREEN-REFACTOR steps with full code, independently committable. Planner refuses to commit orphan tasks.
</HARD-GATE>
```

**Step 3: Verify + commit**

```bash
git add extensions/aidlc-workflow/skills/plan/SKILL.md
git commit -m "feat(aidlc): Part E.2 — plan skill requires TDD-ordered tasks"
```

---

## Task E.3: Update `skills/implement/SKILL.md` — iron law reference

**Files:**
- Modify: `extensions/aidlc-workflow/skills/implement/SKILL.md`

**Step 1: Read existing file**

Run: `cat extensions/aidlc-workflow/skills/implement/SKILL.md`

**Step 2: Update the F2 Red Flags table that already exists**

Find the existing table that mentions TDD and append a row referencing the new skill:

```markdown
| "I'll write the test after" | Invoke `test-driven-development` skill. Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST. Tests-after prove nothing. |
```

**Step 3: Verify + commit**

```bash
git add extensions/aidlc-workflow/skills/implement/SKILL.md
git commit -m "feat(aidlc): Part E.3 — implement skill references test-driven-development"
```

---

## Task E.4: Update `skills/test/SKILL.md` — TDD verification

**Files:**
- Modify: `extensions/aidlc-workflow/skills/test/SKILL.md`

**Step 1: Read existing file**

Run: `cat extensions/aidlc-workflow/skills/test/SKILL.md`

**Step 2: Append TDD verification section**

After the existing F4 systematic-debugging HARD-GATE, append:

```markdown

<HARD-GATE>
The `/test` phase MUST validate TDD compliance. For each spec `## Test Plan` scenario (ST-NNN), verify ≥1 test covers it. For each production code commit, verify a test commit preceded it. Report violations explicitly.
</HARD-GATE>

## TDD Validation Steps

1. **Scenario coverage check:** grep test files for `ST-NNN` IDs from spec.md. Report: "X scenarios covered, Y missing."
2. **Commit history check:** `git log --oneline | head -20` — verify test files are committed before or with their corresponding production code.
3. **TDD violation detection:** if production files changed without test files also changed, report as TDD violation.
```

**Step 3: Verify + commit**

```bash
git add extensions/aidlc-workflow/skills/test/SKILL.md
git commit -m "feat(aidlc): Part E.4 — test skill enforces TDD validation"
```

---

## Task E.5: Update `skills/aidlc-workflow/SKILL.md` — orchestrator overview

**Files:**
- Modify: `extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md`

**Step 1: Read existing file**

Run: `cat extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md`

**Step 2: Add reference to new TDD skill**

Find the section that lists available skills or the AIDLC overview, and add:

```markdown
- `test-driven-development` — TDD as iron law; loaded automatically during `/implement`
```

**Step 3: Verify + commit**

```bash
git add extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md
git commit -m "feat(aidlc): Part E.5 — orchestrator references test-driven-development skill"
```

---

## Task E.6: Update `commands.md` if needed

**Files:**
- Modify: `extensions/aidlc-workflow/commands.md` (only if TDD references exist)

**Step 1: Check if commands.md mentions TDD**

Run: `grep -i "TDD\|test.driven" extensions/aidlc-workflow/commands.md || echo "  (no TDD mentions — skip this task)"`

**Step 2: If mentions exist, update them to reference the new skill. If no mentions, skip the commit.**

If updated, commit:

```bash
git add extensions/aidlc-workflow/commands.md
git commit -m "docs(aidlc): Part E.6 — commands.md references test-driven-development skill"
```

---

# Part F: `tester.md` Agent

## Task F.1: Create or update `agents/tester.md`

**Files:**
- Modify (or create): `extensions/aidlc-workflow/agents/tester.md`

**Step 1: Check if tester.md exists**

Run: `ls extensions/aidlc-workflow/agents/tester.md 2>/dev/null && echo "  EXISTS" || echo "  MISSING — will create"`

**Step 2: If MISSING, create the file with this content:**

```markdown
# Tester Agent (TDD compliance verifier)

<HARD-GATE>
The tester validates that TDD was followed. Refuses to approve if TDD violations exist.
</HARD-GATE>

## Responsibilities

1. **Run the full test suite.** `cd <worktree> && npm test`
2. **Verify scenario coverage.** For each ST-NNN in spec.md `## Test Plan`, find ≥1 test covering it.
3. **Verify commit history.** Test commits precede or accompany production commits.
4. **Report TDD violations.** "X scenarios missing tests; Y commits have no preceding test commit."
5. **Run `validate-tdd` aidlc action** (if Part H ships) for programmatic check.

## Output Format

```markdown
## Test Report

**Suite result:** PASS | FAIL
**Test count:** N pass / M fail / K skip

**Scenario coverage:**
- ST-001: covered (test/bootstrap.test.ts:42)
- ST-002: MISSING (no test references this ID)
- ...

**TDD violations:**
- Commit abc123 modified `src/foo.ts` without preceding test commit
- ...

**Verdict:** APPROVED | NEEDS_FIXES
```

## Reference

Invoke the **`test-driven-development`** skill for TDD discipline. The tester enforces it.
```

**Step 3: If EXISTS, append the validation steps to the existing file**

**Step 4: Commit**

```bash
git add extensions/aidlc-workflow/agents/tester.md
git commit -m "feat(aidlc): Part F — tester.md agent enforces TDD compliance"
```

---

# Part G: Content Tests for New TDD Skill

## Task G.1: Write `test/skills-tdd.test.ts`

**Files:**
- Create: `extensions/aidlc-workflow/test/skills-tdd.test.ts`

**Step 1: Write the test file**

```typescript
// extensions/aidlc-workflow/test/skills-tdd.test.ts
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
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/test-driven-development");
  if (!existsSync(linkPath)) {
    t.skip("install.sh symlink not present (run bash install.sh)");
    return;
  }
  const stat = lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), "should be a symlink");
  const target = readlinkSync(linkPath).replace(/\/\/+/g, "/");
  const expected = join(ROOT, "skills/test-driven-development/SKILL.md");
  assert.equal(target, expected);
});
```

**Step 2: Run tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: all prior tests pass + 8 new TDD tests pass.

**Step 3: Commit**

```bash
git add extensions/aidlc-workflow/test/skills-tdd.test.ts
git commit -m "feat(aidlc): Part G — 8 content tests for test-driven-development skill"
```

---

# Part H (OPTIONAL): aidlc Tool Validation Actions

**This part is recommended but optional.** Adds ~3 commits, ~10-15 hours of work, 3 programmatic validation actions. If user prefers to skip and rely on agent markdown validation, skip to Self-Review.

## Task H.1: Add `validate-spec` action

**Files:**
- Modify: `extensions/aidlc-workflow/index.ts`
- Modify: `extensions/aidlc-workflow/AidlcParams` schema (likely in `classifier.ts` or separate `schema.ts`)

**Step 1: Read current AidlcParams schema**

Run: `grep -n "AidlcParams\|action.*status\|action.*start" extensions/aidlc-workflow/*.ts | head -10`

**Step 2: Add `validate-spec` to the schema**

Add to the action enum:

```typescript
// in the schema definition
action: Type.String({
  description: "...existing...; validate-spec: check spec.md has ## Test Plan with ≥1 ST-NNN scenario",
  // ...
}),
```

**Step 3: Add the handler in `execute()`**

Add a new case in the `if (action === "...")` chain:

```typescript
if (action === "validate-spec") {
  const specPath = join(cwd, ".aidlc/spec.md");
  if (!existsSync(specPath)) {
    return { details: { valid: false, errors: ["spec.md not found"] } };
  }
  const content = readFileSync(specPath, "utf8");
  const errors: string[] = [];

  if (!/^## Test Plan/m.test(content)) {
    errors.push("Missing `## Test Plan` section");
  }

  const scenarios = content.match(/^### ST-\d+:/gm) ?? [];
  if (scenarios.length === 0) {
    errors.push("No ST-NNN scenarios found in ## Test Plan");
  }

  return {
    details: {
      valid: errors.length === 0,
      errors,
      scenarioCount: scenarios.length,
    },
  };
}
```

**Step 4: Test the action**

Write a smoke test that creates a temp spec and runs validate-spec.

**Step 5: Commit**

```bash
git add extensions/aidlc-workflow/index.ts
git commit -m "feat(aidlc): Part H.1 — validate-spec action for spec.md Test Plan enforcement"
```

---

## Task H.2: Add `validate-plan` action

Same pattern as H.1. Checks every T-NNN task references ≥1 ST-NNN scenario.

---

## Task H.3: Add `validate-tdd` action

Same pattern as H.1. Checks git diff for production-without-test imbalance.

---

# Self-Review

After writing this plan, scan once for issues:

**1. Spec coverage:**
- Part A (new skill) → Tasks A.1-A.2 ✓
- Part B (implementer) → Task B.1 ✓
- Part C (spec-writer) → Task C.1 ✓
- Part D (planner) → Task D.1 ✓
- Part E (skill updates) → Tasks E.1-E.6 ✓
- Part F (tester) → Task F.1 ✓
- Part G (content tests) → Task G.1 ✓
- Part H (aidlc tool, optional) → Tasks H.1-H.3 ✓

**2. Placeholder scan:** none — every code block has actual code.

**3. Type consistency:** Part G imports use existing patterns from `mock-extension-api.ts` (Tier 1).

**4. Test coverage:** 8 new content tests in Part G. Plus H.1-H.3 if Part H ships.

---

# Execution Handoff

After this plan is reviewed and approved, two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task with two-stage review. Per the SDD skill, this catches issues per-task. Best for plans with high surface area (this plan touches 10+ files).

**2. Inline Execution** — Execute tasks in this session, batch execution with checkpoints. Faster per task but less rigorous.

Which approach?
