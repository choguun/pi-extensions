---
title: Tier 1 superpowers fusion (F1 + F2 + F3 + F4)
type: spec
status: approved
domain: [aidlc-workflow]
---

# Tier 1 superpowers fusion — design

The first release from the [superpowers fusion audit](./superpowers-fusion-audit.md).
Adopts four superpowers patterns that together form a discipline foundation
for AIDLC: bootstrap extension, anti-rationalization tables, and two new
skills (verification-before-completion + systematic-debugging).

## Goal

Make AIDLC skills auto-fire and stop being skipped by the LLM. Three layers:

1. **F1 (bootstrap):** inject a minimal AIDLC-mode reminder on every
   `session_start` and after every `session_compact` so AIDLC discipline
   survives context loss. The LLM sees the current phase + 3 core HARD-GATEs
   every session.
2. **F2 (rationalization tables):** add "Red Flags" + "Common Rationalizations"
   sections to all 12 AIDLC skills, listing every way an agent tries to skip
   the discipline with rebuttals.
3. **F3 (verification skill):** new `verification-before-completion` skill
   (ported from superpowers) that the LLM must invoke before any completion
   claim. Required by `/ship` and `/review`.
4. **F4 (debugging skill):** new `systematic-debugging` skill (ported from
   superpowers) that the LLM must invoke before patching a test failure or
   bug. Required by `/test` (on failure) and `/implement` (on bug).

Without F1, AIDLC skills only fire if the user remembers the slash command —
and the LLM forgets AIDLC entirely after context compaction. Without F2-F4,
even when skills fire, the LLM rationalizes skipping them.

## Scope

**In scope (this spec):**
- F1: the bootstrap extension (`bootstrap.ts` module + message templates + ~15 tests)
- F2: anti-rationalization tables added to all 12 existing AIDLC skills
- F3: new `verification-before-completion` skill (SKILL.md + integration)
- F4: new `systematic-debugging` skill (SKILL.md + integration)
- ~20-25 unit + handler tests across all 4 fusions
- 5-step manual smoke test for F1
- Timeline entries recording this spec's evolution

**Out of scope (deferred to future specs):**
- F5: TDD as iron law in `/implement`
- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption
- F8: Anti-performative review discipline
- F9: 4-option finishing
- F10: Multi-harness adapters
- F11: Behavioral evals via drill
- F12: Durable progress ledger

## Decisions (from brainstorming Q&A)

| # | Question | Answer |
|---|---|---|
| 1 | Scope of fusion design | **A. Tier 1 only (F1–F4, ~10-14 days)** |
| 2 | Sequencing | **A revised. All 4 fusions ship in one release. F1 is foundational (must commit first within the release); F2-F4 are content additions that can be in any order after.** |
| 3 | Bootstrap content model | **D. Hybrid — minimal reminder on session_start, full reminder per-skill** |
| 4 | Lazy trigger | **A. Skill-content lazy — each skill carries its own HARD-GATE; no tool interception** |
| 5 | Minimal reminder content | **C. Status + hard-gate reminders** |
| 6 | Which hard-gates | **A. Core 3 — creative → /specify; completion → verification-before-completion; test/bug → systematic-debugging** |
| 7 | Design philosophy | **A. Mirror superpowers closely (`<EXTREMELY_IMPORTANT>` markers, `session_start` + `session_compact` re-injection, content-based `<SUBAGENT-STOP>`, "your human partner" voice in new skills)** |
| 8 | Spec coverage depth | **C. Hybrid — F3 + F4 detailed (new skills with full content); F2 brief (mechanical: add tables to 12 existing files)** |

## Architecture

**One new module, no new extension entry:**

```
extensions/aidlc-workflow/
├── index.ts          # existing — registers aidlc tool + 7 commands
├── bootstrap.ts      # NEW — registers the 5 session lifecycle hooks
├── classifier.ts     # existing
├── substrate.ts      # existing
├── worktree.ts       # existing
└── ...
```

`bootstrap.ts` is imported by `index.ts` (per project module-split convention).
One extension entry, two files. No `install.sh` or `package.json` changes.

**4 event handlers** (mirror of superpowers' `superpowers.ts`, minus `resources_discover`):

| Event | Handler body | Why |
|---|---|---|
| `session_start` | `injectBootstrap = true` | Arm injection at the start of every session. |
| `session_compact` | `injectBootstrap = true` | Re-arm after compaction (bootstrap is otherwise lost). |
| `agent_end` | `injectBootstrap = false` | Disarm after each LLM turn — one-shot per session/compaction. |
| `context` | Inject bootstrap message if armed | The actual injection point. |

**Why not `resources_discover`?** AIDLC's skills are discoverable through
`install.sh` symlinks (see AGENTS.md: "Symlinks every extension under
`extensions/*` into `~/.pi/agent/`"). No need for the extension to
re-declare the skills path. If implementation reveals pi doesn't pick up
the symlinks, register `resources_discover` as a fallback.

## Components

**Module structure of `bootstrap.ts`** (~120-180 lines):

| Symbol | Purpose |
|---|---|
| `EXTREMELY_IMPORTANT_MARKER` | String constant: `"<EXTREMELY_IMPORTANT>"`. Wraps the message. |
| `BOOTSTRAP_MARKER` | String constant: `"aidlc bootstrap"`. Fingerprint for re-injection detection. |
| `SUBAGENT_STOP_TAG` | String constant: `"<SUBAGENT-STOP>"`. Tells subagents to skip the reminder. |
| `let injectBootstrap = true` | Module-level flag, flipped by event handlers. |
| `readAIDLCState(cwd)` | Reads `.aidlc/state.md` from cwd. Returns `{ phase, branch, pr, notes }` or `null`. Reuses the existing state.md parser so we don't introduce a second parser. |
| `buildBootstrapContent(state)` | Takes parsed state, returns the full bootstrap message string. Two templates: active-loop and no-loop. Pure function. |
| `messageContainsBootstrap(msg)` | Walks a message's content array; returns true if any text part contains `BOOTSTRAP_MARKER`. Prevents double-injection. |
| `firstNonCompactionSummaryIndex(messages)` | Finds the insertion point — skip over any `compactionSummary` messages. |
| `default export bootstrapExtension(pi)` | Registers the 4 handlers. Mirror of `superpowersPiExtension`. |

**Active-loop template:**

```
<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this reminder.
</SUBAGENT-STOP>

<EXTREMELY_IMPORTANT>
You are working in AIDLC mode (the AI-Driven Development Life Cycle).

Current state:
- Phase: <phase>
- Branch: <branch>
- PR: <pr>

Next action: run `/aidlc next`. Or read `.aidlc/state.md` directly.

HARD-GATEs (do not skip):
- Before any creative work (new feature, refactor, behavior change): invoke `/specify` first. Do NOT write code without an approved design.
- Before any completion claim: invoke `verification-before-completion` and run the verification command.
- Before patching a test failure or bug: invoke `systematic-debugging` and find the root cause first.

Each AIDLC skill carries its own HARD-GATE at the top of its SKILL.md. Read it before invoking.
</EXTREMELY_IMPORTANT>
```

**No-loop template:**

```
<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this reminder.
</SUBAGENT-STOP>

<EXTREMELY_IMPORTANT>
You are working in AIDLC mode (the AI-Driven Development Life Cycle).

No active loop in this directory. To start a feature, run `/aidlc start "<feature-name>"`.

If you are about to do creative work, run `/aidlc start "<feature>"` first to spawn the AIDLC pipeline. Do NOT skip the brainstorming/spec phase.
</EXTREMELY_IMPORTANT>
```

**Marker + voice conventions** (mirroring superpowers):

- Wrap the message in `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` so pi/LLM treats it as higher priority than surrounding context.
- Voice: "you" (second person), no "your human partner" or "the user" — keep it neutral. The hard-gates speak for themselves.
- `BOOTSTRAP_MARKER = "aidlc bootstrap"` is embedded in the message body so `messageContainsBootstrap()` can detect re-injection and avoid duplicates.
- `<SUBAGENT-STOP>` tag at the top — subagents see it and skip; main session ignores it. Content-based, no API-level branching.

## Data flow

**Normal session_start:**

```
session_start
  └─→ injectBootstrap = true
      (state.md not yet read)

[LLM starts first turn]

context event fires with messages[]
  └─→ injectBootstrap flag → true
      └─→ messageContainsBootstrap(messages) → false (first turn)
          └─→ readAIDLCState(cwd)
              ├─ state.md present → active-loop template
              └─ state.md absent → no-loop template
          └─→ construct user message { role: "user", content: [{type:"text", text: <bootstrap>}] }
          └─→ find firstNonCompactionSummaryIndex(messages)
          └─→ return { messages: [...before, bootstrapMsg, ...after] }

[LLM sees bootstrap, responds normally]

agent_end
  └─→ injectBootstrap = false
      (prevents re-injection on every subsequent turn)
```

**Compaction recovery:**

```
[mid-session, pi compacts history]

session_compact
  └─→ injectBootstrap = true (re-arm)

[compactionSummary messages may have been added]

context event fires with messages[]
  └─→ flag → true
      └─→ messageContainsBootstrap → false
          └─→ re-read state.md (may have changed since session_start)
          └─→ find firstNonCompactionSummaryIndex(messages)
              │  bootstrap goes BEFORE any compaction summary
              │  so the LLM sees fresh context first
          └─→ insert at that index
```

Without `firstNonCompactionSummaryIndex`, the bootstrap could end up after
the compaction summary and never get read.

**Subagent handling:** content-based via `<SUBAGENT-STOP>` tag. Main session
reads the reminder; subagent follows the SUBAGENT-STOP and ignores it.

**Why disarm on `agent_end` rather than leave armed forever?** Without
disarming, the bootstrap re-injects on every LLM turn (every `context`
event), spamming the conversation. One-shot per session/compaction is the
right cadence — the LLM sees the reminder once when it needs it (after a
fresh start or context reset), then works.

## Error handling

**Three failure modes with explicit handling:**

| Condition | Detection | Behavior |
|---|---|---|
| `.aidlc/` directory missing | `fs.existsSync(path.join(cwd, '.aidlc'))` returns false | **Skip injection entirely.** User hasn't opted in to AIDLC. No noise. |
| `.aidlc/state.md` missing or unreadable (EACCES, ENOENT) | `fs.readFileSync` throws or `existsSync` returns false | Inject no-loop template. |
| `state.md` exists but malformed (wrong format, truncated, missing fields) | Parser returns partial state or throws | Inject degraded active-loop template with the fields we could parse and `(unreadable)` for the rest. Don't silently invent values. |

**Defensive coding rules:**

1. All file I/O wrapped in try/catch.
2. All event handlers wrap their body in try/catch — a bug in the bootstrap must never break the rest of `aidlc-workflow` (the `aidlc` tool and slash commands).
3. Template construction is pure — no side effects, easy to unit-test.
4. No silent failures. Every caught error logs via `console.warn` with prefix `[aidlc-bootstrap]`.

**Known limitation:** module-level `injectBootstrap` is shared across all
sessions in the same pi process. Today pi is single-session per process so
this is fine; document the limitation in a code comment. If pi ever supports
concurrent sessions per process, switch to a per-session WeakMap keyed on
session id.

## Testing

**Three layers, most value per test:**

| Layer | What | Count | Tool |
|---|---|---|---|
| Unit | `readAIDLCState`, `buildBootstrapContent`, `messageContainsBootstrap`, `firstNonCompactionSummaryIndex` | ~8 | `node --test` |
| Handler | The 4 event handlers via `MockExtensionAPI` from `test/smoke.test.ts` | ~7 | `node --test` |
| Manual smoke | A real pi session in a real project with an active AIDLC loop | 5 steps | human in TTY |

**Coverage target:** ~85% line coverage on `bootstrap.ts`. Uncovered 15%
will be pi-internal error paths.

**Why no behavioral evals (drill) in this release:** F1 is mechanical
(parse + template + inject). Drill is for validating skill compliance over
real LLM sessions — better suited for F2/F3/F4 where new skills need
rigorous testing that the LLM actually follows them.

**Manual smoke test:**

```bash
# 1. Unit + handler tests pass
cd extensions/aidlc-workflow && npm test

# 2. From a project root with an active AIDLC loop:
pi -e .

# 3. Observe the message stream
#    Confirm: bootstrap appears as the first user message
#    Confirm: it contains the current phase + branch + PR + 3 hard-gates
#    Confirm: it's wrapped in <EXTREMELY_IMPORTANT>

# 4. Compact the session
#    Confirm: bootstrap re-injects after compaction
#    Confirm: it appears BEFORE any compactionSummary messages

# 5. From a directory without .aidlc/, start a pi session
#    Confirm: no bootstrap message is injected
```

---

## F2: Anti-rationalization tables (brief)

**Goal:** for each of AIDLC's 12 skills, add a "Red Flags" + "Common
Rationalizations" section listing the ways an agent will try to skip the
skill's discipline, with rebuttals. Mechanical work — no new logic.

**The 12 skills** (per the existing `extensions/aidlc-workflow/skills/`
directory):

| Skill | Domain |
|---|---|
| `aidlc-workflow/SKILL.md` | orchestrator |
| `entropy-control/SKILL.md` | repo hygiene |
| `implement/SKILL.md` | implement phase |
| `new-loop/SKILL.md` | loop bootstrap |
| `plan/SKILL.md` | plan phase |
| `review/SKILL.md` | review phase |
| `setup-codebase-harness/SKILL.md` | repo setup |
| `ship/SKILL.md` | ship phase |
| `signal-triage/SKILL.md` | signal handling |
| `specify/SKILL.md` | specify phase |
| `state-management/SKILL.md` | state I/O |
| `test/SKILL.md` | test phase |

**Format** (per skill, follows superpowers' convention):

```markdown
## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "This is just a simple [task]" | [Reality] |
| ... |
```

**Source material:** superpowers skills have these tables for each of
their 14 skills. Use them as a template, adapt the examples to AIDLC's
domain. Reference:
`~/.pi/agent/git/github.com/obra/superpowers/skills/*/SKILL.md`.

**Voice:** match the existing AIDLC skill voice (which is mixed —
"user"/"human"/"you" appear in different files). Don't change existing
prose; only add the new sections.

**Acceptance:**
- All 12 skills have a "Red Flags" section.
- Each section has 5-10 rationalization → reality rows.
- No existing prose is changed (purely additive).

**No new tests.** Content change only; verified by `install.sh` symlinks
working (already covered by existing tests) and by manual review of each
skill file.

**Open questions:**
- Should we add a "Common Rationalizations" section IN ADDITION to "Red
  Flags", or just one? Superpowers uses both — different framing but
  similar purpose. Lean toward both for completeness.
- How many rationalizations per skill? Aim for 5-10; fewer feels thin,
  more feels padded.

---

## F3: `verification-before-completion` skill (detailed)

**Goal:** add a new skill that enforces "no completion claims without fresh
verification evidence." The LLM must invoke this skill before claiming any
task is complete, fixed, or passing. Required by `/ship` (before merging)
and `/review` (before approving).

**Source material:** direct port from superpowers.
Read: `~/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md`
(I've already read it — 4,738 bytes, has frontmatter + 8 sections).

**Adaptations from source:**

| Section | Adaptation |
|---|---|
| Frontmatter | Keep `name` + `description` as-is. Description: "Use when about to claim work is complete, fixed, or passing, before committing or creating PRs — requires running verification commands and confirming output before making any success claims; evidence before assertions always" |
| Iron Law | Keep verbatim: "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" |
| Gate Function | Keep verbatim (the 5-step IDENTIFY/RUN/READ/VERIFY/claim process) |
| Common Failures table | Keep verbatim — universal across domains |
| Red Flags | Keep verbatim — universal |
| Rationalization Prevention | Keep verbatim |
| Key Patterns | Keep all 5 sections (Tests, Regression tests, Build, Requirements, Agent delegation). Universal. |
| Why This Matters | Keep verbatim |
| When To Apply | Keep verbatim |
| The Bottom Line | Keep verbatim |

**Why no AIDLC-specific adaptation?** The skill's content is universal —
"verify before claiming" applies to any domain. Adapting examples would
just add noise.

**File location:**

```
extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md
```

`install.sh` already symlinks every directory under `extensions/*` into
`~/.pi/agent/`. No install script changes needed.

**Voice:** match superpowers — "your human partner" terminology. This is
a deliberate departure from existing AIDLC voice (which mixes
"user"/"human"/"you") but aligns with the Q7 decision to mirror
superpowers closely.

**Integration points** (must update existing files):

1. `extensions/aidlc-workflow/agents/shipper.md` — add a line near the top:
   "Before claiming the PR is ready, invoke `verification-before-completion`
   and follow its gate function. Iron law: NO COMPLETION CLAIMS WITHOUT
   FRESH VERIFICATION EVIDENCE."
2. `extensions/aidlc-workflow/agents/reviewer.md` — same instruction near
   the top.
3. The F1 bootstrap's no-loop template — already mentions
   `verification-before-completion` as a HARD-GATE. No change needed.

**Acceptance:**
- File exists at the right path with valid frontmatter (name + description).
- File content matches superpowers source (can verify with `diff` after
  stripping any AIDLC-specific lines, which there shouldn't be any).
- `shipper.md` + `reviewer.md` reference the skill.
- `install.sh` creates the symlink (manual check: `ls -la ~/.pi/agent/skills/verification-before-completion`).

**Testing:**

```
test/skills.test.ts (new file)
  ├─ verification-before-completion/SKILL.md exists       ✓
  ├─ has valid frontmatter (name + description)           ✓
  ├─ description length <= 1024 chars                     ✓
  ├─ contains "NO COMPLETION CLAIMS" iron law             ✓
  ├─ contains all 5 Key Patterns (Tests/Regression/...)   ✓
  ├─ shipper.md references the skill                      ✓
  ├─ reviewer.md references the skill                     ✓
  └─ install.sh symlink points to the right path          ✓
```

8 tests, mostly file-content checks. Pattern: read SKILL.md as a string,
assert specific phrases appear.

**Open questions:**
- Should we add a section to the skill about AIDLC-specific verification
  commands (e.g., "before merging, run `npm test` in extensions/aidlc-workflow")?
  Lean toward no — keep the skill universal; AIDLC-specific commands
  belong in shipper.md / reviewer.md.

---

## F4: `systematic-debugging` skill (detailed)

**Goal:** add a new skill that enforces 4-phase root cause investigation
before any fix. The LLM must invoke this skill before patching a test
failure or bug. Required by `/test` (when failures occur) and `/implement`
(when bugs are found).

**Source material:** direct port from superpowers.
Read: `~/.pi/agent/git/github.com/obra/superpowers/skills/systematic-debugging/SKILL.md`
(I've already read it — has frontmatter + 11 sections including the 4
phases, red flags, rationalizations, real-world impact).

**Adaptations from source:**

| Section | Adaptation |
|---|---|
| Frontmatter | Keep `name` + `description` as-is. Description: "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes" |
| The Four Phases | Keep all 4 phases verbatim — universal |
| Phase 4.5 ("3+ Fixes Failed: Question Architecture") | Keep verbatim — universal |
| Red Flags | Keep verbatim |
| Common Rationalizations | Keep verbatim |
| Quick Reference table | Keep verbatim |
| Real-World Impact | Keep verbatim |
| Supporting Techniques (root-cause-tracing, defense-in-depth, condition-based-waiting) | Reference as supporting docs but don't port the full content in this release |

**Why no AIDLC-specific adaptation?** Same as F3 — debugging process is
universal; AIDLC-specific bugs belong in AIDLC skill files.

**File location:**

```
extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md
```

Same install.sh mechanism as F3.

**Voice:** match superpowers — "your human partner".

**Integration points** (must update existing files):

1. `extensions/aidlc-workflow/skills/test/SKILL.md` — add a line at the
   top: "When tests fail, invoke `systematic-debugging` before proposing
   fixes. Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST."
2. `extensions/aidlc-workflow/skills/implement/SKILL.md` — same
   instruction: "When a bug is found during implementation, invoke
   `systematic-debugging` before patching."
3. The F1 bootstrap's no-loop template — already mentions
   `systematic-debugging` as a HARD-GATE. No change needed.

**Acceptance:**
- File exists at the right path with valid frontmatter.
- File content matches superpowers source (modulo the supporting-techniques
  reference; full content of those is out of scope for this spec).
- `test/SKILL.md` + `implement/SKILL.md` reference the skill.
- `install.sh` creates the symlink.

**Testing:**

```
test/skills.test.ts (existing file, add to it)
  ├─ systematic-debugging/SKILL.md exists                 ✓
  ├─ has valid frontmatter (name + description)           ✓
  ├─ description length <= 1024 chars                     ✓
  ├─ contains "NO FIXES WITHOUT ROOT CAUSE" iron law      ✓
  ├─ contains all 4 phase headers                        ✓
  ├─ contains the "3+ Fixes Failed" rule                 ✓
  ├─ test/SKILL.md references the skill                  ✓
  └─ implement/SKILL.md references the skill              ✓
```

8 more tests in the same `test/skills.test.ts` file. Same content-check
pattern as F3.

**Open questions:**
- Should we port the full content of the supporting techniques
  (`root-cause-tracing.md`, `defense-in-depth.md`, `condition-based-waiting.md`)
  in this release? Lean toward no — they're reference material, can be a
  follow-up if agents actually need them.

---

## Cross-cutting sequencing (within this release)

The 4 fusions are committed in this order in the implementation:

```
Commit 1: F1 bootstrap extension + 15 tests
Commit 2: F2 anti-rationalization tables (12 files, additive only)
Commit 3: F3 verification-before-completion skill + integration + 8 tests
Commit 4: F4 systematic-debugging skill + integration + 8 tests
```

F1 first because it's foundational (the bootstrap references F3 and F4
by name in the HARD-GATEs). F2-F4 in any order after, but listed F2→F3→F4
because F2 is purely additive (lowest risk) and F3/F4 each touch multiple
files (slightly higher risk; reviewer attention is freshest at the end).

The PR is one PR, four commits. Regular merge (no squash) per project
convention.

---

## Test list (cross-cutting)

```
test/bootstrap.test.ts
  ├─ readAIDLCState() parses valid state.md           ✓
  ├─ readAIDLCState() returns null on missing file    ✓
  ├─ readAIDLCState() returns null on malformed file  ✓
  ├─ readAIDLCState() tolerates missing fields        ✓
  ├─ buildBootstrapContent() with state → active      ✓
  ├─ buildBootstrapContent() with null → no-loop      ✓
  ├─ messageContainsBootstrap() detects marker        ✓
  ├─ firstNonCompactionSummaryIndex() skips summaries ✓
  ├─ session_start handler arms flag                  ✓
  ├─ session_compact handler re-arms flag             ✓
  ├─ agent_end handler disarms flag                   ✓
  ├─ context handler injects when armed, no dup       ✓
  ├─ context handler skips when disarmed              ✓
  ├─ context handler skips when .aidlc/ missing       ✓
  └─ context handler survives malformed state.md      ✓
```

## Open questions

1. **Does pi's `context` event return shape exactly match superpowers'?**
   Superpowers' extension returns `{ messages: [...] }`. If pi's API
   differs, this is the one line that changes.

2. **Where exactly does the existing state.md parser live?** We need to
   reuse it (not duplicate). Likely in `state.md`-related code in
   `index.ts` or a dedicated `state.ts` module. Verify during
   implementation.

3. **F2 rationalization count per skill** — 5-10 is the target. Verify
   during implementation by counting rows in each new section.

4. **F3/F4 voice consistency** — we're adopting "your human partner"
   per Q7, but existing AIDLC skills mix voices. Acceptable inconsistency,
   or worth a pass to unify? Lean toward accepting (existing skills
   work; changing them is out of scope).

## Out of scope (deferred to future specs)

- F5: TDD as iron law in `/implement`
- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption
- F8: Anti-performative review discipline
- F9: 4-option finishing
- F10: Multi-harness adapters
- F11: Behavioral evals via drill
- F12: Durable progress ledger

Each of these will get its own spec when we get to it.

**This spec supersedes the original "F1 only" scope decision.** The
fusion-audit doc (F1-F12) remains the source of truth for the broader
fusion roadmap; this spec covers F1-F4 in detail.

## Refs

- [superpowers fusion audit](./superpowers-fusion-audit.md) — the broader context
- [superpowers extension `superpowers.ts`](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts) — the pattern being mirrored
- [superpowers `using-superpowers` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/using-superpowers/SKILL.md) — the bootstrap source
- [AIDLC ARCHITECTURE.md](./ARCHITECTURE.md) — the system being extended
- [AIDLC `classifier.ts`](../classifier.ts) — example of the module-split convention

## Timeline

2026-06-26 | spec drafted — 7-question brainstorming session resolved all major design decisions (scope=A Tier 1, sequencing=A F1 first, content=D hybrid, trigger=A skill-content lazy, reminder=C status+gates, gates=A core 3, philosophy=A mirror superpowers). Five design sections approved (architecture, components, data flow, error handling, testing). Self-review caught a handler-count contradiction (5 vs 4); resolved by dropping `resources_discover` (AIDLC uses install.sh symlinks).
2026-06-26 | scope expanded — user feedback changed scope from "F1 only, F2/F3/F4 deferred" to "all 4 fusions in one release". Q2 in Decisions table updated (sequencing changes to "all in one release, F1 first within"). Added F2 (brief), F3 (detailed), F4 (detailed) sections + cross-cutting sequencing. Added Q8 to Decisions (spec coverage depth = hybrid). Test list extended with F3/F4 content checks (~16 additional tests). Deferred list shrunk to F5-F12.
2026-06-26 | spec approved — user approved all 8 brainstorming decisions + scope-expansion. Status updated from draft to approved. Spec is ready for writing-plans.
2026-06-26 | F1 shipped — bootstrap extension + 30 tests + 98.23% coverage on bootstrap.ts. 8 subagent-driven tasks (F1.1-F1.8) with per-task review. Two real bugs caught by reviewers: (1) `ctx.cwd` not `event.cwd` (Critical, fixed in F1.5); (2) `BOOTSTRAP_MARKER` not in templates (Footgun, fixed in F1.5). 9 commits total on `feat/superpowers-fusion-tier-1`. Total tests: 167 (AIDLC: 105, multi-session: 62).
2026-06-26 | F2 shipped — `## Red Flags` + `## Common Rationalizations` tables added to all 12 AIDLC skills, with F4 HARD-GATEs prepended to test/ + implement/ skills. Batched F2.1-F2.5 into one implementer dispatch + one reviewer (mechanical content). One follow-up commit (09fc17e) resolved cross-table duplicates in 3 skills. 6 commits total for F2.
2026-06-26 | F3 shipped — verification-before-completion skill ported verbatim from superpowers (byte-for-byte match, SHA `4521d247…`). HARD-GATEs added to agents/shipper.md, agents/reviewer.md, skills/ship/SKILL.md. 8 tests in test/skills.test.ts. One follow-up commit (7963935) fixed ironic silent-pass bug (test used `return` instead of `t.skip()` when symlink missing — exactly the failure mode F3 exists to prevent). 2 commits total for F3.
2026-06-26 | F4 shipped — systematic-debugging skill ported verbatim from superpowers (byte-identical, md5 `22c76d4a…`). 8 tests added to test/skills.test.ts. Implementer demonstrably learned from F3's silent-pass review — F4 tests use `readSkill()` + `assert.match()` pattern that fails loud on missing content. 1 commit for F4. Tier 1 fusion release complete.
2026-06-26 | Tier 1 release complete — 4 fusions (F1 bootstrap, F2 rationalization tables, F3 verification skill, F4 debugging skill) shipped on `feat/superpowers-fusion-tier-1`. Final test count: 183 total (121 AIDLC + 62 multi-session). All 4 fusion reviews approved. Three follow-up commits resolved reviewer findings: F1.5 ctx.cwd fix, F2 cross-table duplicates, F3 silent-pass fix. Ready for final whole-branch review per SDD protocol.
