---
title: Superpowers fusion audit
type: decision
status: draft
domain: [aidlc-workflow]
---

# Superpowers fusion audit

A 2026-06-26 audit of [obra/superpowers](https://github.com/obra/superpowers)
for patterns AIDLC could borrow. The repo was already partially installed
locally at `~/.pi/agent/git/github.com/obra/superpowers/` (the source of
the 14 superpowers skills that bootstrap every Pi session), so this audit
was done by reading its skills + the Pi adapter + the multi-harness
plugin manifests directly.

## TL;DR — where AIDLC is weakest vs superpowers

1. **No bootstrap mechanism.** AIDLC skills only fire if the user knows
   the slash command. Superpowers injects `using-superpowers` at
   `session_start` and `session_compact`, so skills auto-trigger.
2. **Soft phase transitions.** AIDLC's 6 phases are a state machine, not
   iron laws. Superpowers uses **HARD-GATEs** ("do NOT write any code
   until design is approved") + **iron laws** ("NO PRODUCTION CODE
   WITHOUT FAILING TEST FIRST", "NO FIXES WITHOUT ROOT CAUSE", "NO
   COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE").
3. **No anti-rationalization tables.** AIDLC skills tell agents to do
   things; superpowers skills list every way an agent will try to talk
   itself out of doing them, with rebuttals.
4. **Single-session implementation.** AIDLC's `/implement` runs in the
   main session with whatever context it has. Superpowers dispatches a
   **fresh subagent per task** with a focused brief file, then runs
   **two-stage review** (spec compliance + code quality) per task.
5. **TDD is advice, not iron law.** AIDLC's `implementer.md` mentions
   TDD; superpowers' `test-driven-development` is rigid and loaded by
   default whenever any implementation work starts.
6. **No verification gate.** AIDLC's `/ship` has a "verify-before-PR"
   mention but no skill enforces it. Superpowers has
   `verification-before-completion` with a hard gate.
7. **No systematic debugging.** AIDLC has no skill for "test failed →
   don't just patch → find root cause." Superpowers has
   `systematic-debugging` with 4 phases and a "3+ fixes failed =
   question the architecture" rule.
8. **No anti-performative-review discipline.** AIDLC's
   `pr-feedback-handler` is unspecified on tone. Superpowers'
   `receiving-code-review` forbids "You're absolutely right!" and
   requires verification before implementation.
9. **Plans are too high-level.** AIDLC plans are task IDs + summaries.
   Superpowers plans have exact file paths, complete code per step,
   exact commands, expected output, and a "no placeholders" rule.
10. **Pi-only.** AIDLC ships as a pi extension. Superpowers has the
    same skills plus per-harness adapters (`.claude-plugin/`,
    `.opencode/`, `.codex-plugin/`, `.cursor-plugin/`,
    `.kimi-plugin/`, `.gemini-extension.json`).

## What superpowers is

A "complete software development methodology for coding agents" built on
14 skills + 1 Pi extension (and parallel adapters for Claude Code,
OpenCode, Codex, Cursor, Gemini CLI, Kimi Code, GitHub Copilot CLI,
Antigravity, Factory Droid).

**Core skills** (all exist locally):

| Skill | Type | Trigger |
|---|---|---|
| `using-superpowers` | bootstrap | every session (injected via `session_start` + `session_compact` hooks) |
| `brainstorming` | process (rigid, HARD-GATE) | before any creative work |
| `writing-plans` | process (rigid) | after spec, before implementation |
| `subagent-driven-development` | process | executing a plan in current session |
| `executing-plans` | process | executing a plan in a parallel session |
| `dispatching-parallel-agents` | pattern | 2+ independent tasks |
| `test-driven-development` | process (rigid, iron law) | any implementation |
| `systematic-debugging` | process (rigid) | any bug / failure |
| `verification-before-completion` | process (rigid, iron law) | before any completion claim |
| `receiving-code-review` | process | feedback received |
| `requesting-code-review` | process | before merge |
| `using-git-worktrees` | pattern | before any feature work |
| `finishing-a-development-branch` | process | tasks complete |
| `writing-skills` | meta | create/edit skills |

**Three iron laws:**

- `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST` (TDD)
- `NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST` (debugging)
- `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE` (verification)

**One HARD-GATE:**

- Brainstorming: "do NOT invoke any implementation skill, write any
  code, scaffold any project, or take any implementation action until
  you have presented a design and the user has approved it. This
  applies to EVERY project regardless of perceived simplicity."

**Multi-harness model:**

```
skills/                     <-- ONE set of skills, harness-agnostic
.pi/extensions/superpowers.ts   <-- Pi adapter (session_start + session_compact + context hooks)
.claude-plugin/plugin.json     <-- Claude Code adapter
.opencode/plugins/superpowers.js   <-- OpenCode adapter (message transform)
.codex-plugin/                  <-- Codex CLI adapter
.cursor-plugin/                 <-- Cursor adapter
.kimi-plugin/                   <-- Kimi adapter
gemini-extension.json           <-- Gemini CLI adapter
hooks/session-start             <-- Bash hook emitting harness-appropriate JSON
```

The OpenCode adapter is worth reading — it's the most different from
Pi's. It uses a message-transform plugin (not a hook) that injects the
bootstrap into every message that doesn't already contain it. Pi's
extension uses the `context` event for the same purpose.

**Eval harness:**

`drill` (in the `superpowers-evals` repo, cloned into `evals/`)
drives real tmux sessions of Claude Code / Codex / Gemini CLI and
judges skill compliance with an LLM verifier. The acceptance test
for a new harness is:

> "Open a clean session in the new harness and send exactly this user
> message: 'Let's make a react todo list'. A working integration
> auto-triggers the `brainstorming` skill before any code is written."

That test is what `using-superpowers` is designed to pass.

## What AIDLC is

(Recap from [`ARCHITECTURE.md`](../ARCHITECTURE.md) for context.)

A pi extension that:

- Runs a 6-phase pipeline (specify → plan → implement → test → review
  → ship) with state in `.aidlc/state.md` + GitHub PR.
- Maintains a knowledge base of `signals/` (deduped PR comments),
  `docs/` (durable knowledge), and `domains/` (one per project).
- Classifies PR comments via a keyword-rule router (`classifier.ts`)
  into one of 9 phase × priority buckets.
- Has a `multi-session` extension for IPC between concurrent pi
  sessions.

12 skills, 6 agents, 66 tests.

## Novel patterns in superpowers AIDLC doesn't have

### 1. The Pi extension + bootstrap injection

`/Users/choguun/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts`
implements:

```typescript
pi.on("resources_discover", async () => ({ skillPaths: [skillsDir] }));
pi.on("session_start", async () => { injectBootstrap = true; });
pi.on("session_compact", async () => { injectBootstrap = true; });
pi.on("agent_end", async () => { injectBootstrap = false; });
pi.on("context", async (event) => {
  // insert the using-superpowers skill as a user message at the
  // first non-compaction position, if not already present
});
```

The bootstrap is wrapped in `<EXTREMELY_IMPORTANT>` markers so the LLM
treats it as higher-priority than surrounding context. The
`session_compact` re-injection is critical — without it, the
bootstrap is lost after the first compaction, and skills stop firing.

**AIDLC has nothing equivalent.** Skills fire only if the user knows
to invoke the slash command. After compaction the LLM has no memory
that AIDLC is the workflow.

### 2. Iron laws + HARD-GATEs

Superpowers skills use:

- **Iron laws** in caps inside a fenced block — LLM-parseable,
  unmissable.
- **HARD-GATE** as an explicit XML tag in `brainstorming/SKILL.md`.
- **Red Flags tables** ("STOP and Start Over") — exhaustive lists of
  rationalizations the LLM will use to skip the discipline.
- **Common Rationalizations tables** — excuse → reality, like a FAQ
  for the discipline.
- **Real Examples** — bad/good pairs for every major decision.

AIDLC skills are written more like READMEs. They tell the agent what
to do but don't enumerate the ways the agent will try to skip it.

### 3. Subagent-driven-development

Each plan task is executed by a **fresh subagent** with a focused brief
extracted to a file (`scripts/task-brief PLAN_FILE N`). The
implementer writes its report to a sibling file and returns only status
+ commits + test summary. The controller then dispatches a **task
reviewer** subagent with three files (brief + report + diff package).
The reviewer gives two verdicts: **spec compliance** and **code
quality**. If either fails, the controller dispatches a **fix
subagent** with all findings, then re-reviews.

**Artifacts are passed as files, never pasted text.** This keeps the
controller's context clean — the implementer sees only its task, not
the whole plan.

**The progress ledger** (`.superpowers/sdd/progress.md`, gitignored)
records one line per completed task. After compaction, the controller
checks the ledger + `git log` to resume from the first incomplete task
— never re-dispatching a completed task. The ledger is the durable
state; conversation memory is not.

AIDLC's `/implement` runs in the main session and walks tasks
in-process. No per-task isolation, no per-task review.

### 4. writing-plans format

```markdown
### Task N: [Component Name]

**Files:**
- Create: exact/path/to/file.py
- Modify: exact/path/to/existing.py:123-145
- Test: tests/exact/path/to/test.py

**Interfaces:**
- Consumes: [earlier-task signatures]
- Produces: [later-task signatures]

- [ ] Step 1: Write the failing test (full code shown)
- [ ] Step 2: Run test to verify it fails (full command + expected output)
- [ ] Step 3: Write minimal implementation (full code shown)
- [ ] Step 4: Run test to verify it passes (full command + expected output)
- [ ] Step 5: Commit (full command)
```

"No placeholders" rule is enforced:

- ❌ "TBD", "TODO", "implement later"
- ❌ "Add appropriate error handling"
- ❌ "Similar to Task N" (repeat the code; the implementer may read out
  of order)
- ❌ Steps without code blocks for code steps

Plus a self-review pass: spec coverage scan, placeholder scan, type
consistency check across tasks.

AIDLC's `plan` skill produces `.aidlc/plan.md` with task IDs (T-001,
T-002, ...) and one-paragraph descriptions. Useful as a roadmap but
not directly executable.

### 5. Anti-performative code review

`receiving-code-review/SKILL.md` forbids:

> "You're absolutely right!" (explicit instruction-file violation)
> "Great point!" / "Excellent feedback!" (performative)
> "Let me implement that now" (before verification)

And requires:

1. READ — complete feedback without reacting
2. UNDERSTAND — restate requirement or ask
3. VERIFY — check against codebase reality
4. EVALUATE — technically sound for THIS codebase?
5. RESPOND — technical acknowledgment or reasoned pushback
6. IMPLEMENT — one item at a time, test each

Plus a hard rule: **if any item is unclear, STOP — do not implement
anything yet.** AIDLC's `pr-feedback-handler` agent has no such
discipline — agents often perform agreement ("Great catch!") before
verifying.

### 6. verification-before-completion

The gate function, run before any completion claim:

```
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim
```

Examples of forbidden claims:

- "Should work now" → run it
- "I'm confident" → confidence ≠ evidence
- "Linter passed" → linter ≠ compiler
- "Agent said success" → verify independently
- "Tests after achieve the same purpose" → no, test-first only

AIDLC has "verify-before-PR" mentioned in `ARCHITECTURE.md` but no
skill enforces it as a gate.

### 7. systematic-debugging (4 phases)

```
Phase 1: Root Cause Investigation
  - Read errors carefully
  - Reproduce consistently
  - Check recent changes
  - Gather evidence in multi-component systems
Phase 2: Pattern Analysis
  - Find working examples
  - Compare against references
  - Identify differences
  - Understand dependencies
Phase 3: Hypothesis and Testing
  - Form single hypothesis
  - Test minimally (one variable)
  - Verify before continuing
Phase 4: Implementation
  - Create failing test (TDD)
  - Implement single fix
  - Verify fix
  - If fix doesn't work: STOP, count fixes
```

Critical rule:

> If 3+ fixes failed: STOP and question the architecture.

Pattern indicating architectural problem:

- Each fix reveals new shared state/coupling
- Fixes require "massive refactoring"
- Each fix creates new symptoms elsewhere

AIDLC's `/test` runs tests but doesn't enforce root-cause
investigation. A test failure today goes straight to a patch.

### 8. finishing-a-development-branch (structured options)

After tasks complete, verify tests pass, then present exactly 4
options (3 for detached HEAD):

```
1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work
```

AIDLC's `/ship` always creates a PR. There's no "keep as-is" or
"discard" path — if you realize halfway through that the approach was
wrong, you have to write the discard logic yourself.

### 9. Multi-harness skill portability

Same skill content; per-harness adapter. Each adapter does the same
thing — inject the bootstrap at session start — using whatever
mechanism the harness exposes:

- Pi: extension `session_start` + `context` event
- Claude Code: `SessionStart` hook returning `hookSpecificOutput`
- OpenCode: message-transform plugin (no hook system)
- Codex CLI: hook + manifest
- Cursor: `additional_context` (snake_case) instead of `hookSpecificOutput`
- Kimi: manifest
- Gemini: extension entry that loads `GEMINI.md`

The hook script (`hooks/session-start`) is polyglot — same `.cmd`
file works on bash + Windows Git Bash.

AIDLC ships as a pi extension only. The skills are markdown and would
work anywhere; the `aidlc` TypeScript tool is pi-specific.

### 10. Eval harness (drill)

Behavioral tests for skills, not code paths. From `docs/testing.md`:

> Skill-behavior evals live in `evals/`. Drill is the harness;
> scenarios live at `evals/scenarios/*.yaml`. Drill scenarios are slow
> (3-30+ minutes each) and run real LLM sessions.

Acceptance test for new skill adoption:

> Run scenario `triggering-test-driven-development` on a real
> Claude Code session. Verifier LLM judges whether the TDD skill
> triggered at the right moment.

AIDLC's 66 tests are unit/integration tests of code paths. They don't
test "did the LLM invoke /aidlc next when expected?" — which is the
real question.

## Where AIDLC is stronger (preserve)

| AIDLC feature | Why superpowers doesn't have it |
|---|---|
| **Knowledge base substrate** (`signals/` + `docs/` + `domains/` + `LOG.md`) | Superpowers has `docs/superpowers/specs/` + `docs/superpowers/plans/` but no cross-project signal pool, no frequency counting, no domain-as-first-class-object. |
| **PR-comment classifier** (`classifier.ts`) | Superpowers has `requesting-code-review` (for AI-generated reviews) but no keyword-rule router for human reviewer comments. AIDLC routes to phases; superpowers just lists comments. |
| **State in two places, reconciled** (`.aidlc/state.md` + GitHub PR) | Superpowers uses `.superpowers/sdd/progress.md` only. Single source. AIDLC's two-place model is more robust but has drift issues (`/aidlc sync` resolves). |
| **Domain (loop) concept** | One `domains/<project>/` per long-lived thread of work, with its own README + state. Superpowers has no equivalent — each project is fresh state. |
| **Multi-session IPC** (`pi_sessions` / `pi_send` / `pi_who`) | Superpowers has no cross-session messaging. The multi-session extension enables orchestration patterns superpowers can't express (e.g., one session dispatches work to another). |
| **APFS clone worktree acceleration** | Implementation detail; superpowers doesn't optimize worktree creation. |
| **Classifier shared between runtime and tests** | `classifier.ts` is imported by both `index.ts` and `test/classifier.test.ts` — they can't drift. Superpowers has no equivalent shared-implementation-disciplined module. |

## Fusion candidates — prioritized

### Tier 1 — Quick wins, no architecture change (1-2 days each)

#### F1. Bootstrap mechanism + HARD-GATE
**Effort:** M. **Impact:** H.

Add `extensions/aidlc-workflow/bootstrap.ts` that:

1. On `session_start`: read `.aidlc/state.md` (or note "no active
   loop"), construct a bootstrap message reminding the agent of:
   - The current phase, branch, PR
   - "If mid-feature, run `/aidlc next` to see next action"
   - "Before any creative work on a new feature, invoke `/specify`
     (HARD-GATE — do not skip)"
2. Inject via the `context` event with `<EXTREMELY_IMPORTANT>` markers
   (copy superpowers' pattern).
3. Re-inject on `session_compact`.
4. Skip injection on `agent_end` (subagents).

Reference: `.pi/extensions/superpowers.ts` in the superpowers repo.

#### F2. Anti-rationalization tables in existing skills
**Effort:** S. **Impact:** H.

For each AIDLC skill (`specify`, `plan`, `implement`, `test`, `review`,
`ship`), add a "Red Flags" + "Common Rationalizations" section.

Reference: any superpowers skill — they're consistent.

#### F3. verification-before-completion as a required skill
**Effort:** S. **Impact:** H.

Add `extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md`
— port directly from superpowers. Reference from `/ship` and `/review`
agents: "Before claiming completion, invoke
`verification-before-completion` and follow its gate function."

#### F4. systematic-debugging as a required skill
**Effort:** S. **Impact:** H.

Add `extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md` —
port directly. Reference from `/test` (when failures) and `/implement`
(when bugs found).

### Tier 2 — Discipline upgrades (3-5 days each)

#### F5. TDD as iron law in `/implement`
**Effort:** M. **Impact:** H.

Rewrite `implementer.md` to:

1. Begin with: "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
   If you didn't watch the test fail, you don't know if it tests the
   right thing."
2. Add the anti-rationalization table from superpowers' TDD skill.
3. Add the RED-GREEN-REFACTOR flowchart.
4. Require the agent to run `npm test <file>` and paste the output
   showing the test fail before any implementation.

#### F6. Fresh subagent per task with two-stage review
**Effort:** L. **Impact:** H.

Rewrite `/implement T-XXX` to:

1. Extract the task brief to `.aidlc/tasks/T-XXX-brief.md`.
2. Dispatch a subagent (`general-purpose` or similar) with the brief
   + the report file path.
3. Subagent writes its report to `.aidlc/tasks/T-XXX-report.md` and
   returns DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
4. Controller dispatches task-reviewer subagent with brief + report +
   `git diff BASE..HEAD` (extracted to a file).
5. Reviewer returns spec ✅/❌ + quality approved / not approved.
6. If spec ❌ or quality not approved → dispatch fix subagent → re-review.
7. Append progress to `.aidlc/progress.md` (gitignored).

Requires Pi to have a subagent tool — likely `pi-subagents` companion.

#### F7. writing-plans format adoption
**Effort:** M. **Impact:** M.

Rewrite `planner.md` to emit plans in the superpowers format:

- Exact file paths
- Complete code per step (no "TBD")
- Exact commands + expected output
- TDD steps
- Self-review pass (spec coverage, placeholders, type consistency)

AIDLC's `.aidlc/plan.md` stays the file (humans read it), but the
content density goes up.

#### F8. Anti-performative review discipline in pr-feedback-handler
**Effort:** S. **Impact:** M.

Rewrite `pr-feedback-handler.md` to:

1. Forbid "You're absolutely right!", "Great catch!", "Thanks!" —
   explicit instruction-file violation.
2. Require: restate → verify → evaluate → respond → implement.
3. "If any item is unclear, STOP — do not implement anything yet."

#### F9. finishing-a-development-branch options in /ship
**Effort:** S. **Impact:** M.

Rewrite `shipper.md` to:

1. Verify tests pass (using `verification-before-completion`).
2. Detect environment (worktree vs main repo).
3. Present exactly 4 options (merge / PR / keep / discard) — same
   pattern as superpowers.

### Tier 3 — Architecture changes (1-2 weeks each)

#### F10. Multi-harness adapters
**Effort:** L. **Impact:** H (but only if the user wants AIDLC
beyond pi).

Refactor AIDLC into:

- `skills/` (harness-agnostic markdown)
- `aidlc-core/` (the TypeScript tools, pi-specific)
- `adapters/pi/` (extension entry — current `index.ts`)
- `adapters/claude-code/`, `adapters/opencode/`, etc. (future)

Reference: superpowers' `.pi/`, `.claude-plugin/`, `.opencode/`
structure.

#### F11. Eval harness
**Effort:** L. **Impact:** H (long-term).

Add behavioral evals for AIDLC:

- "Does the agent invoke `/aidlc next` when state.md shows phase
  `implementing` and last action is `plan complete`?"
- "Does the classifier route a 'race condition' comment to phase
  `implement` priority `P1`?"
- "Does the implementer follow TDD on a fresh task?"

Reference: superpowers' drill scenarios. Could adopt the drill harness
directly.

#### F12. Durable progress ledger
**Effort:** S. **Impact:** L.

Add `.aidlc/progress.md` (gitignored) with one line per completed
task: `T-001: complete (commits abc..def, review clean)`. After
compaction, the orchestrator checks the ledger + `git log` to resume
from the first incomplete task — never re-dispatch a completed task.

## Open questions

1. **Should AIDLC become multi-harness?** Currently pi-only. The
   knowledge base is portable; the `aidlc` tool is pi-specific.
   Decision likely depends on whether the user wants AIDLC in their
   Claude Code / OpenCode sessions too.

2. **Should we replace `/specify` with superpowers' `brainstorming`?**
   Or keep `/specify` and have it invoke `brainstorming` internally?
   The HARD-GATE pattern is the key. AIDLC's `/specify` currently
   writes the spec from a brief; brainstorming asks clarifying
   questions first.

3. **Do we need the eval harness before Tier 1 ships?** Tier 1
   changes (bootstrap, anti-rationalization, verification, debugging)
   are easy to write wrong. An eval would catch "the agent still
   skips verification even when the skill says to." But evals are
   slow and expensive.

4. **What's the relationship between the multi-session extension
   and subagent-driven-development?** SDD dispatches subagents in
   the same session (or maybe a sibling session via `pi_send`?).
   Worth exploring whether SDD should use `pi_send` to dispatch into
   sibling sessions that each have their own clean context.

## Recommended next step

Run `/aidlc start "Tier-1 superpowers fusion"` with an initial spec
covering F1–F4. They are the highest leverage per hour of work and
don't require architecture changes. F5–F9 (Tier 2) can become a
follow-up loop after Tier 1 ships and the eval harness (or just
real-world use) confirms the foundation works.

## Refs

- [obra/superpowers](https://github.com/obra/superpowers) — the audited repo
- [superpowers-evals](https://github.com/prime-radiant-inc/superpowers-evals) — drill eval harness
- [AIDLC ARCHITECTURE.md](../ARCHITECTURE.md) — the system being audited
- [superpowers extension `.pi/extensions/superpowers.ts`](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts) — the Pi adapter pattern

## Timeline

2026-06-26 | initial audit — read 14 superpowers skills + Pi adapter + multi-harness plugins + CLAUDE.md. Drafted fusion candidates F1–F12 with effort/impact estimates.
