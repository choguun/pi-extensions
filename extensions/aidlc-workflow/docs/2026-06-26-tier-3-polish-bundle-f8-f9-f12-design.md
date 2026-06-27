---
title: Tier 3 superpowers fusion: polish bundle (F8 + F9 + F12)
type: spec
status: draft
domain: [aidlc-workflow]
---

# Tier 3 superpowers fusion: polish bundle — design

Tier 3 release from the [superpowers fusion audit](./superpowers-fusion-audit.md).
Three small, low-risk fusions that close out the "skill + agent discipline" cluster:
F8 anti-performative review, F9 4-option finishing, F12 durable progress ledger.

## Goal

Three surgical improvements to AIDLC's agent discipline and infrastructure:

1. **F8 (anti-performative review):** ban sycophantic phrases ("You're absolutely right!", "Great catch!", "Thanks!") in `pr-feedback-handler.md`. Adopt the 5-step discipline (read → understand → verify → evaluate → respond → implement) from superpowers' `receiving-code-review` skill.
2. **F9 (4-option finishing):** rewrite `shipper.md` to present 4 options (merge locally / push+PR / keep as-is / discard) with verify-tests gate, environment detection, and worktree cleanup. Adopt superpowers' `finishing-a-development-branch` skill with AIDLC-specific worktree paths.
3. **F12 (durable progress ledger):** add `.aidlc-progress.md` (gitignored) that records one line per task (`T-NNN: complete (commits abc..def, review clean)`). The `aidlc` tool writes to it automatically; `read-progress` action enables compaction recovery. Replaces the SDD `.superpowers/sdd/progress.md` stand-in used in Tier 1+2.

## Scope

**In scope (this spec):**
- F8: new `skills/receiving-code-review/SKILL.md` (verbatim port from superpowers) + `agents/pr-feedback-handler.md` reference
- F9: new `skills/finishing-a-development-branch/SKILL.md` (adapted for AIDLC worktree paths) + `agents/shipper.md` rewrite
- F12: 2 new `aidlc` tool actions (`append-progress`, `read-progress`) + `.gitignore` entry
- ~26 new tests across 2 test files
- Frontmatter `## Timeline` entries on this spec

**Out of scope (deferred to future specs):**
- F5: TDD-as-iron-law (already shipped in Tier 2)
- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption
- F10: Multi-harness adapters
- F11: Behavioral evals via drill
- F12 polish deferred: concurrent-session safety for `.aidlc-progress.md` (known limitation, future enhancement)
- F8 deferred: behavioral evals for discipline compliance
- F9 deferred: behavioral evals for option presentation

## Decisions (from brainstorming Q&A)

| # | Question | Answer |
|---|---|---|
| 1 | Implementation approach | **C. Mix** — F8 and F9 add new skill files; F12 just adds the ledger file. Disciplines rich enough to warrant standalone skills; ledger is mechanical. |
| 2 | F12 ledger relationship | **A. Replace** `.superpowers/sdd/progress.md` with `.aidlc-progress.md`. Make the ledger AIDLC-native. Single source. |
| 3 | F8 scope | **C. `pr-feedback-handler.md` + new skill.** Discipline lives in the skill; agent gets brief reference. |
| 4 | F9 scope | **B. Full lifecycle** — verify tests → detect env → present 4 options → execute → cleanup. Matches superpowers' `finishing-a-development-branch`. |
| 5 | Bundling | **A. One PR** for all 3 fusions (F8 + F9 + F12). Atomic polish release. |
| 6 | F8 + F9 adaptation | **B. F8 verbatim, F9 adapted.** F8 is universal; F9 needs AIDLC worktree paths. |
| 7 | F12 — who writes | **A. `aidlc` tool writes automatically.** Programmatic, testable. Add `read-progress` action for compaction recovery. |
| 8 | F12 file location + format | **A. `.aidlc-progress.md` at worktree root + rich format** (commit ranges, review status). Single file; `.gitignore` adds the filename. |

## Architecture

### Create

| Path | Fusion | Purpose | Est. lines |
|---|---|---|---|
| `extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md` | F8 | Verbatim port | ~250 |
| `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md` | F9 | Adapted port | ~250 |
| `extensions/aidlc-workflow/test/skills-polish.test.ts` | F8+F9 | Content tests for both skills | ~150 |
| `extensions/aidlc-workflow/test/progress.test.ts` | F12 | Tests for append-progress + read-progress | ~120 |

### Modify

| Path | Fusion | Change |
|---|---|---|
| `extensions/aidlc-workflow/agents/pr-feedback-handler.md` | F8 | Add HARD-GATE referencing receiving-code-review skill |
| `extensions/aidlc-workflow/agents/shipper.md` | F9 | Rewrite to full lifecycle (verify + detect + present + execute + cleanup) |
| `extensions/aidlc-workflow/index.ts` | F12 | Add `append-progress` + `read-progress` actions to `AidlcParams` + execute function |
| `.gitignore` | F12 | Add `.aidlc-progress.md` |

### No changes

- `bootstrap.ts`, `agents/implementer.md`, `agents/spec-writer.md`, `agents/planner.md`, `agents/reviewer.md`, `agents/tester.md`
- Other skill files (entropy-control, signal-triage, etc.)
- `commands.md` (already verified no F8/F9/F12 mentions in Tier 2)

### Commit structure (3 commits within 1 PR)

```
Commit 1: F8 — receiving-code-review skill + pr-feedback-handler reference
Commit 2: F9 — finishing-a-development-branch skill (adapted) + shipper.md rewrite
Commit 3: F12 — .aidlc-progress.md ledger via aidlc tool actions + gitignore
```

## Components

### F8: `skills/receiving-code-review/SKILL.md` (verbatim)

Structure mirrors superpowers' skill:

```markdown
---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
---

# Code Review Reception

## Overview
## The Response Pattern (READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT)
## Forbidden Responses (ban-list: "You're absolutely right!", "Great point!", "Thanks!", etc.)
## Handling Unclear Feedback (STOP, ask)
## Source-Specific Handling (human partner vs external)
## YAGNI Check for "Professional" Features
## Implementation Order (clarify first, implement one at a time)
## When To Push Back
## Acknowledging Correct Feedback
## Common Mistakes
## Real Examples
## GitHub Thread Replies
## The Bottom Line
```

**Adaptations:** NONE (verbatim). Voice: "your human partner".

### F9: `skills/finishing-a-development-branch/SKILL.md` (adapted)

Mirrors superpowers' skill with AIDLC worktree detection:

```markdown
---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch (AIDLC-adapted)

## Overview
## The Process
  ### Step 1: Verify Tests [verbatim]
  ### Step 2: Detect Environment [adapted: AIDLC worktree paths]
  ### Step 3: Determine Base Branch [verbatim]
  ### Step 4: Present Options [adapted: 4 options]
  ### Step 5: Execute Choice [adapted: AIDLC commands]
  ### Step 6: Cleanup Workspace [adapted: AIDLC worktree removal]
## Quick Reference
## Common Mistakes
## Red Flags
```

**Step 2 adaptation** — replace superpowers' generic `.worktrees/`/`worktrees/` check with AIDLC-specific detection:

```bash
WORKTREE_PATH=$(git rev-parse --show-toplevel)
IS_AIDLC_WORKTREE=false
if [[ "$WORKTREE_PATH" == *"pi-extensions-worktrees/feat/"* ]]; then
  IS_AIDLC_WORKTREE=true
fi
```

**Step 6 adaptation** — AIDLC-specific cleanup:

```bash
if [ "$IS_AIDLC_WORKTREE" = true ]; then
  MAIN_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
  cd "$MAIN_ROOT"
  git worktree remove "$WORKTREE_PATH"
  git worktree prune
fi
```

### F12: `.aidlc-progress.md` format

```markdown
# AIDLC Progress Ledger

Last updated: 2026-06-27T10:00:00Z

- T-001: complete (commits abc1234..def5678, review clean)
- T-002: complete (commits def5678..ghi9012, review clean)
- T-003: BLOCKED (waiting for human input on schema decision)
```

States: `complete` (commits + review status) | `BLOCKED` (reason) | `IN_PROGRESS`.

### F8 agent reference (added to `pr-feedback-handler.md`)

```markdown
<HARD-GATE>
When handling PR review feedback, invoke the `receiving-code-review` skill and follow its discipline. Iron rule: NO PERFORMATIVE AGREEMENT. Never write "You're absolutely right!", "Great catch!", or "Thanks!" — verify, evaluate, then act.
</HARD-GATE>
```

### F9 agent rewrite (shipper.md)

Replaces existing shipper.md with full lifecycle:

```markdown
# Shipper (full finishing lifecycle)

## Responsibilities

1. **Verify tests** — invoke `test` skill, confirm `npm test` passes
2. **Detect environment** — check if currently in worktree, determine base branch
3. **Present 4 options** to user
4. **Execute chosen option** (git/gh commands)
5. **Cleanup workspace** if option 1 or 4 (remove worktree per AIDLC convention)

## Reference

- **`finishing-a-development-branch`** — full discipline + edge cases
- **`test`** — test verification step
```

### F12 aidlc tool actions

**`append-progress`:**

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

  const progressPath = join(cwd, ".aidlc-progress.md");
  const line = status === "BLOCKED"
    ? `- ${taskId}: BLOCKED (${reason ?? "no reason given"})\n`
    : `- ${taskId}: ${status} (commits ${commitRange ?? "unknown"}, ${reviewStatus ?? "review pending"})\n`;

  appendFileSync(progressPath, line);
  return { details: { valid: true, appended: line } };
}
```

**`read-progress`:**

```typescript
if (action === "read-progress") {
  const progressPath = join(cwd, ".aidlc-progress.md");
  if (!existsSync(progressPath)) {
    return { details: { tasks: [], message: "No progress ledger yet" } };
  }
  const content = readFileSync(progressPath, "utf8");
  const tasks = content
    .split("\n")
    .filter((line) => line.match(/^- T-\d+: /))
    .map((line) => line.slice(2));
  return { details: { tasks, count: tasks.length } };
}
```

### `.gitignore` addition

```
.aidlc-progress.md
```

## Data flow

### F8 — receiving-code-review

```
PR has new review comment
  └─→ /aidlc classify-comments routes to /implement
      └─→ pr-feedback-handler.md agent invoked
          └─→ agent reads its HARD-GATE
              └─→ invokes `receiving-code-review` skill
                  └─→ follows 5-step discipline:
                      1. READ full comment
                      2. UNDERSTAND (restate or ask)
                      3. VERIFY against codebase
                      4. EVALUATE technical soundness
                      5. RESPOND with technical ack or pushback
                      6. IMPLEMENT one item at a time, test each
                  └─→ if pushback: explain with technical evidence
                  └─→ if unclear: STOP, ask BEFORE implementing
                  └─→ if YAGNI applies: "Endpoint isn't called. Remove?"
```

### F9 — finishing-a-development-branch

```
/ship (or "ship it")
  └─→ shipper.md agent invoked
      └─→ STEP 1: Verify tests
          └─→ if fail: "Tests failing (N). Must fix."
      └─→ STEP 2: Detect environment
          └─→ checks `pi-extensions-worktrees/feat/` path
      └─→ STEP 3: Present 4 options
      └─→ STEP 4: Execute chosen option
          ├─→ 1: `git checkout main && git merge feat/... --no-ff && bash install.sh`
          ├─→ 2: `git push -u origin feat/... && gh pr create ...`
          ├─→ 3: report branch + worktree, no cleanup
          └─→ 4: require typed "discard", then delete
      └─→ STEP 5: Cleanup (option 1 or 4 only)
          └─→ if AIDLC worktree: `git worktree remove <path>` from main
```

### F12 — progress ledger

**Write flow (per task completion):**

```
/implement T-NNN completes
  └─→ implementer agent commits code + tests
      └─→ agent calls `aidlc append-progress`:
          - task_id, status, commit_range, review_status
      └─→ tool appends line to .aidlc-progress.md (atomic append)
```

**Read flow (compaction recovery):**

```
/implement T-NNN starts (or session resumes)
  └─→ agent calls `aidlc read-progress`
      └─→ tool returns array of completed tasks
      └─→ agent cross-references with `git log`
      └─→ finds first incomplete task and resumes
```

## Error handling

| Condition | Detection | Behavior |
|---|---|---|
| `receiving-code-review` skill fails to load | `install.sh` check | Manual smoke check; fallback in agent markdown |
| Reviewer feedback unclear | agent's understand step | STOP, ask for clarification BEFORE implementing |
| Reviewer feedback wrong | agent's verify step | Pushback with technical evidence (no sycophancy) |
| Tests fail at /ship | `npm test` exit non-zero | shipper.md refuses; returns to /implement or /test |
| User picks option 4 without typed confirmation | shipper.md reads input | Require exact "discard" text. No silent discards. |
| Worktree cleanup fails | `git worktree remove` non-zero | Report error; abort cleanup. Do NOT proceed to branch deletion. |
| Branch deletion fails | `git branch -D` non-zero | Report error; user must resolve manually. |
| `.aidlc-progress.md` corrupted | `read-progress` parses | Return empty tasks array + warning. Next `/implement` overwrites. |
| Concurrent sessions append to ledger | (no Node fs lock) | Append (not full rewrite); last-write-wins for individual lines. Document as single-session. |
| `commit_range` missing in append-progress | Tool validates params | Returns `{ valid: false, errors: [...] }` |
| `append-progress` outside AIDLC context | Tool checks `.aidlc/` | Returns `{ valid: false, errors: [...] }` |
| `read-progress` before any task | File doesn't exist | Returns `{ tasks: [], message: "..." }`. Not an error. |

**Defensive coding rules:**
1. All file I/O in try/catch.
2. Tool actions validate required params; explicit error messages.
3. F9 option 4 requires typed confirmation — never silent.
4. F8 pushback must be technical, not defensive.

**Known limitations:**
- Concurrent sessions: appendFileSync is atomic per-write but not transactional. Document single-session.
- Pushback accuracy: agent might push back incorrectly; skill has "Gracefully Correcting" section.
- F12 + compaction: line could be lost mid-write. Mitigation: include task_id as primary identifier.

## Testing

**Three layers, ~26 new tests:**

| Layer | What | Count | Tool |
|---|---|---|---|
| Content tests | F8 skill: file exists, valid frontmatter, description ≤1024, all 5-step discipline sections, ban-list, push-back rules | ~8 | `node --test` |
| Content tests | F9 skill: file exists, valid frontmatter, AIDLC worktree adaptation, 4 options, AIDLC cleanup commands | ~8 | `node --test` |
| Tool tests | `append-progress` action: writes line, BLOCKED variant, validation errors, no `.aidlc/` directory | ~6 | `node --test` |
| Tool tests | `read-progress` action: reads ledger, empty state, malformed file recovery | ~4 | `node --test` |

**Coverage target:** ≥85% on new TypeScript code.

**Manual smoke test:**

```bash
# 1. Run all tests
cd extensions/aidlc-workflow && npm test
# Expected: 154 + 26 = 180 tests pass

# 2. Verify F8 symlink
ls -la ~/.pi/agent/skills/receiving-code-review
# Expected: symlink → .../skills/receiving-code-review/SKILL.md

# 3. Verify F9 symlink
ls -la ~/.pi/agent/skills/finishing-a-development-branch
# Expected: symlink → .../skills/finishing-a-development-branch/SKILL.md

# 4. Test append-progress
# Use aidlc with action=append-progress, task_id=T-001, status=complete, commit_range=abc..def, review_status=review clean
# Expected: line appended to .aidlc-progress.md

# 5. Test read-progress
# Use aidlc with action=read-progress
# Expected: returns array including T-001

# 6. Test /ship option 1
/ship → verify tests → detect env → present 4 options → execute option 1
# Expected: branch merged to main, worktree cleaned up

# 7. Verify .aidlc-progress.md is gitignored
git check-ignore .aidlc-progress.md
# Expected: exit 0
```

**What's NOT in scope:**
- ❌ Behavioral evals for F8/F9 (F11 territory)
- ❌ Concurrent-session safety for F12 (future enhancement)
- ❌ E2E test of full /ship lifecycle (manual smoke only)

## Test list (detailed)

```
test/skills-polish.test.ts
  ├─ receiving-code-review/SKILL.md exists                    ✓
  ├─ has valid frontmatter (name + description ≤1024)           ✓
  ├─ description matches superpowers verbatim                   ✓
  ├─ contains "The Response Pattern" with 5-step discipline     ✓
  ├─ contains ban-list phrases ("You're absolutely right!")     ✓
  ├─ contains "Handling Unclear Feedback" section              ✓
  ├─ contains "When To Push Back" section                       ✓
  ├─ install.sh symlink points to right path                    ✓
  │
  ├─ finishing-a-development-branch/SKILL.md exists            ✓
  ├─ has valid frontmatter (name + description ≤1024)           ✓
  ├─ contains "pi-extensions-worktrees/feat/" worktree path    ✓
  ├─ contains "4 options" presentation logic                   ✓
  ├─ contains AIDLC cleanup commands (`git worktree remove`)   ✓
  └─ install.sh symlink points to right path                    ✓

test/progress.test.ts
  ├─ append-progress: writes complete-status line             ✓
  ├─ append-progress: writes BLOCKED-status line with reason    ✓
  ├─ append-progress: validates required params (task_id, status) ✓
  ├─ append-progress: rejects when .aidlc/ missing             ✓
  ├─ append-progress: rejects when commit_range missing        ✓
  ├─ append-progress: appends (not overwrites) on repeat       ✓
  │
  ├─ read-progress: returns array of task lines                ✓
  ├─ read-progress: returns empty when file missing            ✓
  ├─ read-progress: handles malformed file gracefully          ✓
  └─ read-progress: filters non-task lines correctly           ✓
```

## Open questions

1. **F8 — does `/aidlc classify-comments` route to `pr-feedback-handler.md`?** Per Tier 1's classifier design, comments are routed to phases (implement/specify/etc.), not to specific agents. Confirm whether `pr-feedback-handler.md` is invoked correctly during /implement or whether routing logic needs adjustment.

2. **F9 option 1 — should it delete the feature branch after merging?** Currently `git branch -d` after `git merge`. Confirm with user during implementation.

3. **F12 — `append-progress` action params schema.** The brief sketches the params but the exact TypeBox schema needs to match the existing `AidlcParams` style. Confirm during implementation.

4. **Concurrent-session safety for F12** — documented as known limitation. Future enhancement (F12-polish or F13). Accept for Tier 3.

5. **F8 skill description length.** Superpowers' description may need slight trim to fit ≤1024 chars after AIDLC verification. Confirm during implementation.

## Out of scope (deferred to future specs)

- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption
- F10: Multi-harness adapters
- F11: Behavioral evals via drill
- F12 polish: concurrent-session safety, lock file
- F13+: anything beyond the 12 fusion candidates in the audit

## Refs

- [superpowers fusion audit](./superpowers-fusion-audit.md) — F1-F12 candidates
- [Tier 1 spec: bootstrap extension](./2026-06-26-aidlc-bootstrap-design.md) — already shipped
- [Tier 2 spec: TDD-as-iron-law](./2026-06-26-tier-2-tdd-as-iron-law-design.md) — already shipped
- [superpowers `receiving-code-review` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/receiving-code-review/SKILL.md) — F8 source
- [superpowers `finishing-a-development-branch` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/finishing-a-development-branch/SKILL.md) — F9 source
- [AIDLC ARCHITECTURE.md](./ARCHITECTURE.md) — the system being extended

## Timeline

2026-06-26 | spec drafted — 8-question brainstorming session resolved all major design decisions (approach=C mix, F12=A replace SDD, F8 scope=C agent+skill, F9 scope=B full lifecycle, bundling=A one PR, F8/F9=B verbatim+adapted, F12 writer=A tool writes, F12 location+format=A root+rich). Five design sections approved (architecture, components, data flow, error handling, testing). Spec written and awaiting user review.
