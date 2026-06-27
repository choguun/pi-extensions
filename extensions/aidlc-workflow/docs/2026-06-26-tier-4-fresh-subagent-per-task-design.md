---
title: Tier 4 superpowers fusion: fresh subagent per task with two-stage review (F6)
type: spec
status: draft
domain: [aidlc-workflow]
---

# Tier 4 superpowers fusion: F6 fresh subagent per task — design

F6 from the [superpowers fusion audit](./superpowers-fusion-audit.md).
Adds the **orchestration layer** to AIDLC: a new `execute-task` action
that formalizes the subagent-per-task + two-stage-review protocol we've
been using manually, plus an adapted `subagent-driven-development` skill
documenting the protocol for AIDLC agents.

## Goal

Make AIDLC's `/implement T-XXX` dispatch a fresh subagent per task with
focused brief + reviewer subagent + fix loop — instead of relying on
the LLM to do the work in the main session.

**Today:** `/implement T-XXX` runs in the main session. The LLM reads
`.aidlc/plan.md`, implements T-XXX, tests, commits. No isolation, no
per-task review, no automatic fix loop.

**After F6:** `/implement T-XXX` invokes `aidlc execute-task T-XXX`.
AIDLC:
1. Extracts the task brief from `.aidlc/plan.md`
2. Writes the brief to `.aidlc/sdd/T-NNN-brief.md`
3. Returns a dispatch hint telling the LLM how to invoke the `subagent` tool
4. The LLM dispatches the implementer subagent (fresh context, focused brief)
5. After the implementer reports back, AIDLC prepares a reviewer brief
6. The LLM dispatches the reviewer subagent (independent verdict)
7. If reviewer says "approved" → AIDLC updates `.aidlc-progress.md`, task complete
8. If reviewer says "needs_fix" → AIDLC prepares a fix brief (max 1 iteration)
9. If reviewer says "blocked" or max iterations exceeded → AIDLC marks BLOCKED in progress ledger

The protocol we used manually 3 times in this session (Tier 1+2+3), now
encoded in AIDLC itself.

## Scope

**In scope (this spec):**
- F6.1: New `aidlc execute-task` action (stateful, 3-phase state machine)
- F6.2: New `skills/subagent-driven-development/SKILL.md` (adapted port from superpowers with AIDLC-specific examples)
- F6.3: Update `agents/implementer.md` to invoke `execute-task` instead of implementing inline
- F6.4: Update `agents/spec-writer.md` + `agents/planner.md` to reference the new skill
- F6.5: ~22 new tests in `test/execute-task.test.ts`
- F6.6: Timeline entry on this spec

**Out of scope (deferred to future specs):**
- F7: writing-plans format adoption (F6 plans use existing format; F7 upgrades it)
- F11: Behavioral evals via drill (would test the SDD protocol itself)
- Concurrent-call stress testing (documented limitation; future enhancement)
- End-to-end test of full cycle with real subagent dispatch (manual smoke only)

## Decisions (from brainstorming Q&A)

| # | Question | Answer |
|---|---|---|
| 1 | Granularity of new actions | **B. 1 combined `execute-task` action** — AIDLC orchestrates the full cycle. Caller invokes once per phase. |
| 2 | Caller interface | **A. Minimal** — caller passes only `task_id: "T-001"`. AIDLC reads `.aidlc/plan.md`, extracts brief. |
| 3 | Subagent dispatch | **A. LLM-driven** — AIDLC prepares artifacts (briefs, reports, reviews); the LLM invokes pi's `subagent` tool. Two-phase stateful action. |
| 4 | Scope | **C. Action + skill + agent updates** — full set: `execute-task` action + adapted skill + `implementer.md` rewrite + spec-writer/planner references. |
| 5 | Max fix iterations | **A. Single fix loop (max 1)** — strict cap. After 1 fix iteration, BLOCKED. Prevents infinite loops; keeps human in control. |
| 6 | Skill adaptation | **B. Adapted** — AIDLC-specific examples (using `aidlc execute-task` action, `.aidlc-progress.md`, worktree paths). |

## Architecture

### Create

| Path | Purpose | Est. lines |
|---|---|---|
| `extensions/aidlc-workflow/skills/subagent-driven-development/SKILL.md` | Adapted port | ~450 |
| `extensions/aidlc-workflow/test/execute-task.test.ts` | Unit tests for action + helpers | ~250 |

### Modify

| Path | Change |
|---|---|
| `extensions/aidlc-workflow/index.ts` | Add `execute-task` action (stateful, 3-phase state machine) |
| `extensions/aidlc-workflow/agents/implementer.md` | Replace inline-implement guidance with invoke-`execute-task` workflow |
| `extensions/aidlc-workflow/agents/spec-writer.md` | Reference subagent-driven-development skill (when scoping tasks) |
| `extensions/aidlc-workflow/agents/planner.md` | Reference subagent-driven-development skill (when writing plans) |

### No changes

- `bootstrap.ts` (Tier 1)
- `agents/reviewer.md`, `agents/shipper.md`, `agents/pr-feedback-handler.md`, `agents/tester.md` (Tier 1+3 already address these)
- Other skill files (entropy-control, signal-triage, etc.)

### Commit structure (3 commits within 1 PR)

```
Commit 1: F6 — execute-task action + tests (state machine)
Commit 2: F6 — subagent-driven-development skill (adapted port)
Commit 3: F6 — agent updates (implementer/spec-writer/planner reference the new skill)
```

## Components

### `execute-task` action — state machine

```
.no artifacts → PHASE A: prepare implementer brief
.brief only    → PHASE A: prepare implementer brief
.brief + .report → PHASE B: prepare reviewer brief
.brief + .report + .review (approved) → COMPLETE
.brief + .report + .review (needs_fix) + iteration<1 → PHASE C: prepare fix brief
.brief + .report + .review (needs_fix) + iteration>=1 → BLOCKED
.brief + .report + .review (blocked) → BLOCKED
```

**Action signature (added to `index.ts`):**

```typescript
if (action === "execute-task") {
  const taskId = params.task_id?.trim();
  const previousReport = params.previous_report?.trim();
  const previousReview = params.previous_review?.trim();
  // ... validation, state detection, brief generation, return
}
```

**Returns:**
```typescript
{
  details: {
    phase: "implementer" | "reviewer" | "fix" | "complete" | "blocked",
    task_id: string,
    brief_path?: string,        // for implementer/fix phases
    report_path?: string,       // tells LLM where implementer should write
    reviewer_brief_path?: string, // for reviewer phase
    fix_brief_path?: string,    // for fix phase
    fix_report_path?: string,   // tells LLM where fix should write
    dispatch_hint: string,      // "Use the subagent tool with agent='X' and brief_path=Y"
    verdict?: "approved" | "needs_fix" | "blocked",
    reason?: string,            // for blocked phase
  }
}
```

**Helper functions** (in `index.ts` or extracted to `execute-task.ts`):

- `extractTaskBrief(planPath, taskId)` — reads plan.md, finds the `### Task T-NNN: ...` section, returns full text or null
- `buildImplementerBrief(taskId, taskBrief, briefPath, reportPath)` — generates the implementer's brief (includes task description + report contract)
- `buildReviewerBrief(taskId, taskBrief, reportPath, reviewPath)` — generates the reviewer's brief (includes task + report path + review schema)
- `buildFixBrief(taskId, taskBrief, reviewPath, fixReportPath)` — generates the fix brief (includes review findings + fix scope)
- `parseReviewVerdict(review)` — scans for `## Verdict` heading, reads next line, returns `approved` | `needs_fix` | `blocked` (default: `blocked`)
- `countFixReports(taskId, sddDir)` — counts `*-fix-report.md` files for this task
- `getCommitRange(taskId)` — runs `git log --oneline | grep T-NNN` to derive commit range for progress ledger
- `appendProgress(cwd, taskId, status, commitRange?, reviewStatus?)` — reuses F12's logic

### New `skills/subagent-driven-development/SKILL.md`

Adapted from superpowers' skill (already in user's global skills) with AIDLC-specific adaptations:

```markdown
---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development (AIDLC-adapted)

## Overview
## When to Use
## The Process (adapted — uses aidlc execute-task)
## Pre-Flight Plan Review
## Model Selection
## Handling Implementer Status
## Handling Reviewer ⚠️ Items
## Constructing Reviewer Prompts
## File Handoffs (uses .aidlc/sdd/ not .superpowers/sdd/)
## Durable Progress (uses .aidlc-progress.md from F12)
## Prompt Templates
## AIDLC-Specific Notes
  - Use `aidlc execute-task T-NNN` to start each task cycle
  - Action returns `dispatch_hint` — use it with the `subagent` tool
  - Artifacts at `.aidlc/sdd/T-NNN-{brief,report,review,fix-report}.md`
  - After approval, action updates `.aidlc-progress.md` automatically
  - Max 1 fix iteration per task; BLOCKED after that
```

### Agent updates

**`agents/implementer.md`** — rewrite to use `execute-task`:

```markdown
# Implementer Agent

<HARD-GATE>
For each T-XXX task, invoke `aidlc execute-task T-XXX` to dispatch a fresh
implementer subagent via the two-stage review protocol. Do NOT implement
tasks inline — the execute-task action handles brief generation, subagent
dispatch, reviewer dispatch, and fix loops.
</HARD-GATE>

## Workflow

1. Read `.aidlc/plan.md` for the next T-XXX task
2. Invoke `aidlc execute-task T-XXX`
3. Follow the returned `dispatch_hint` using the `subagent` tool
4. When implementer reports back, call `aidlc execute-task T-XXX previous_report=<path>`
5. Follow the reviewer dispatch hint, get reviewer back
6. Call `aidlc execute-task T-NNN previous_report=<impl_report> previous_review=<review>`
7. If verdict=approved → task complete
8. If verdict=needs_fix → follow fix hint, dispatch fix subagent, re-review
9. If verdict=blocked → escalate to human
```

**`agents/spec-writer.md`** — add reference:

```markdown
## When Scoping Tasks

If a spec's plan involves multiple independent T-XXX tasks, invoke the
`subagent-driven-development` skill to understand the dispatch protocol.
Each task should be independently executable in a fresh subagent context.
```

**`agents/planner.md`** — add reference:

```markdown
## When Writing Plans

For plans with multiple tasks, ensure each T-XXX is:
- Independently executable (no shared state with other tasks)
- Self-contained (full file paths + complete code per step)
- Verifiable (clear test acceptance criteria)

Reference the `subagent-driven-development` skill for the dispatch protocol.
```

**Voice:** all updates use "your human partner" (consistent with Tier 1+2+3).

## Data flow

**The full `execute-task` cycle as called by the implementer agent:**

```
/implement T-001
  └─→ implementer agent reads .aidlc/plan.md
      └─→ invoke: aidlc execute-task T-001
          └─→ extractTaskBrief + buildImplementerBrief
          └─→ writes .aidlc/sdd/T-001-brief.md
          └─→ returns { phase: "implementer", brief_path, report_path, dispatch_hint }

LLM invokes subagent tool with the dispatch_hint:
  └─→ subagent(agent="implementer", task="Read brief at .aidlc/sdd/T-001-brief.md...")
      └─→ implementer writes code + tests, commits, writes report at .aidlc/sdd/T-001-report.md
      └─→ subagent returns report_path

LLM invokes execute-task again:
  └─→ aidlc execute-task T-001 previous_report=".aidlc/sdd/T-001-report.md"
      └─→ detects brief + report exist, no review yet
      └─→ writes .aidlc/sdd/T-001-reviewer-brief.md
      └─→ returns { phase: "reviewer", reviewer_brief_path, dispatch_hint }

LLM invokes reviewer subagent:
  └─→ subagent(agent="code-reviewer", task="Read reviewer brief, write verdict to .aidlc/sdd/T-001-review.md")
      └─→ reviewer evaluates spec compliance + code quality
      └─→ writes verdict (## Verdict: approved | needs_fix | blocked)

LLM invokes execute-task with both report and review:
  └─→ aidlc execute-task T-001 previous_report=... previous_review=...
      ├─→ "approved" → appendProgress("complete", commits, "review clean")
      │             → returns { phase: "complete", verdict: "approved" }
      ├─→ "needs_fix" → countFixReports() → 0
      │             → buildFixBrief(reviewPath)
      │             → writes .aidlc/sdd/T-001-fix-brief.md
      │             → returns { phase: "fix", fix_brief_path, dispatch_hint }
      │  LLM invokes fix subagent → fix report → invoke execute-task again
      │  countFixReports() → 1 → BLOCKED → returns { phase: "blocked", reason: "Max fix iterations (1) exceeded" }
      └─→ "blocked" → appendProgress("BLOCKED", undefined, review[:200])
                    → returns { phase: "blocked", verdict: "blocked" }
```

**Integration with F12's `.aidlc-progress.md`:**

```
execute-task phase=complete → appendProgress() writes:
  - T-001: complete (commits abc..def, review clean)

execute-task phase=blocked → appendProgress() writes:
  - T-001: BLOCKED (1 fix attempt failed; needs human review)
```

**Compaction recovery (FREE):** if the LLM compacts mid-cycle, it can re-invoke `aidlc execute-task T-NNN` (no params); AIDLC determines current phase from file existence and returns the next dispatch hint. The artifacts at `.aidlc/sdd/T-NNN-*` are the source of truth.

## Error handling

| Condition | Detection | Behavior |
|---|---|---|
| `.aidlc/` missing | existsSync | Return `{ valid: false, errors: ["No .aidlc/ in cwd"] }` |
| `.aidlc/plan.md` missing | existsSync | Return `{ valid: false, errors: [".aidlc/plan.md not found"] }` |
| Task ID not in plan.md | extractTaskBrief returns null | Return `{ valid: false, errors: [`Task ${taskId} not found in plan.md`] }` |
| `.aidlc/sdd/` not writable | mkdirSync throws | Return `{ valid: false, errors: [`Cannot create .aidlc/sdd/: ${err}`] }` |
| Implementer subagent fails | LLM observes no report | LLM re-invokes execute-task to re-trigger Phase A |
| Reviewer output unparseable | parseReviewVerdict defaults to "blocked" | Return `{ phase: "blocked", verdict: "blocked", reason: "Review unparseable: <first 200 chars>" }` |
| Max fix iterations (1) exceeded | countFixReports() >= 1 + verdict=needs_fix | Return `{ phase: "blocked", verdict: "needs_fix", reason: "Max fix iterations (1) exceeded" }` |
| `.aidlc-progress.md` not writable | appendFileSync throws | Catch + log + continue. Verdict returned; ledger not updated. |
| Concurrent calls on same T-NNN | No lock | Last-write-wins. Documented limitation; users should serialize per task. |
| Compact mid-cycle | LLM re-invokes execute-task (no params) | AIDLC determines phase from files; returns next dispatch hint |

**Defensive coding rules:**
1. All file I/O wrapped in try/catch.
2. `parseReviewVerdict` defaults to "blocked" on no match (safer than "approved").
3. Idempotent writes (overwrite same path = same result).
4. Review file schema documented in skill: `## Verdict` heading + approved/needs_fix/blocked keyword.

**Review file format contract:**

```markdown
# T-001 Review

## Verdict
approved | needs_fix | blocked

## Spec Compliance
✅ / ❌ <findings>

## Code Quality
✅ / ❌ <findings>

## Findings (Critical / Important / Minor)
- <finding>

## Recommendation
Approve | Fix needed
```

## Testing

**Four layers:**

| Layer | What | Count |
|---|---|---|
| State routing | Each phase returns correct next step | ~6 |
| Helper functions | extractTaskBrief, parseReviewVerdict, countFixReports, buildImplementerBrief | ~8 |
| Validation | Missing task_id, missing .aidlc/, missing plan.md, task not in plan.md | ~5 |
| F12 integration | appendProgress called on approved, BLOCKED on max iterations | ~3 |

**Total:** ~22 new tests. Combined with existing 175: 197 total.

**Coverage target:** ≥85% on `index.ts` (new execute-task code).

**Test list:**

```
test/execute-task.test.ts
  ├─ execute-task returns "implementer" phase when no artifacts
  ├─ execute-task returns "implementer" phase when only brief exists
  ├─ execute-task returns "reviewer" phase when brief + report exist
  ├─ execute-task returns "complete" phase when review is "approved"
  ├─ execute-task returns "fix" phase when review is "needs_fix" (iter 0)
  ├─ execute-task returns "blocked" when review "needs_fix" + fix exists (iter 1)
  ├─ execute-task returns "blocked" when review is "blocked"

  ├─ extractTaskBrief parses plan.md and finds T-001
  ├─ extractTaskBrief returns null for non-existent task
  ├─ parseReviewVerdict returns "approved" for "## Verdict\napproved"
  ├─ parseReviewVerdict returns "needs_fix" for "## Verdict\nneeds_fix"
  ├─ parseReviewVerdict defaults to "blocked" for malformed
  ├─ countFixReports returns 0 when no fix reports
  ├─ countFixReports returns 1+ when fix reports exist
  ├─ buildImplementerBrief includes task description + report contract

  ├─ execute-task rejects missing task_id
  ├─ execute-task rejects missing .aidlc/
  ├─ execute-task rejects missing plan.md
  ├─ execute-task rejects non-existent task_id
  ├─ execute-task rejects malformed plan.md

  ├─ execute-task calls appendProgress on "approved"
  ├─ execute-task calls appendProgress with BLOCKED on max iterations
  ├─ execute-task gracefully handles .aidlc-progress.md write failure
```

**Manual smoke test:**

```bash
# 1. Run all tests
cd extensions/aidlc-workflow && npm test
# Expected: 175 + 22 = 197 tests pass

# 2. Verify skill symlinked
ls -la ~/.pi/agent/skills/subagent-driven-development
# Expected: symlink

# 3. Test execute-task end-to-end
aidlc execute-task T-001
# Expected: returns { phase: "implementer", brief_path, dispatch_hint }

# 4. Test review phase
aidlc execute-task T-001 previous_report=".aidlc/sdd/T-001-report.md"
# Expected: returns { phase: "reviewer", reviewer_brief_path, dispatch_hint }

# 5. Test complete phase
aidlc execute-task T-001 previous_report="..." previous_review="..."
# Expected: returns { phase: "complete", verdict: "approved" }
# .aidlc-progress.md contains T-001 line
```

## Open questions

1. **`subagent` tool signature** — currently my available tool takes `(agent, task)` params. The dispatch_hint should reference these. Confirm during implementation.

2. **Existing skill paths in `.aidlc/sdd/`** — when run in a worktree, does the path resolution work correctly? Verify during implementation.

3. **`getCommitRange` git command** — what exact git invocation derives the commit range for a given task? Options: `git log --oneline | grep T-XXX`, `git log --grep="T-XXX"` (if commit messages include the ID), or scan `.aidlc/sdd/T-NNN-*.md` mtimes. Decide during implementation.

4. **`extractTaskBrief` regex robustness** — what if a task description spans multiple subsections (e.g., "Files:", "Steps:" as sub-bullets)? Test with real plan.md.

## Out of scope (deferred to future specs)

- F7: writing-plans format adoption (F6 plans use existing format)
- F11: Behavioral evals via drill
- Concurrent-call stress testing
- End-to-end test of full cycle with real subagent (manual smoke only)

## Refs

- [superpowers fusion audit](./superpowers-fusion-audit.md) — F1-F12 candidates
- [Tier 1 spec: bootstrap extension](./2026-06-26-aidlc-bootstrap-design.md) — already shipped
- [Tier 2 spec: TDD-as-iron-law](./2026-06-26-tier-2-tdd-as-iron-law-design.md) — already shipped
- [Tier 3 spec: polish bundle](./2026-06-26-tier-3-polish-bundle-f8-f9-f12-design.md) — already shipped
- [superpowers `subagent-driven-development` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/subagent-driven-development/SKILL.md) — F6 source
- [AIDLC ARCHITECTURE.md](./ARCHITECTURE.md) — the system being extended

## Timeline

2026-06-26 | spec drafted — 6-question brainstorming session resolved all major design decisions (granularity=B single action, caller=A minimal, dispatch=A LLM-driven, scope=C full set, fix-iterations=A max 1, skill=B adapted). Five design sections approved (architecture, components, data flow, error handling, testing). Spec written and awaiting user review.
