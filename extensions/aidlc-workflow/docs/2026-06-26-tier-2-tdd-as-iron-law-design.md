---
title: Tier 2 superpowers fusion: TDD-as-iron-law (F5)
type: spec
status: approved
domain: [aidlc-workflow]
---

# Tier 2 superpowers fusion: TDD-as-iron-law — design

F5 from the [superpowers fusion audit](./superpowers-fusion-audit.md).
Adopts test-driven-development as an iron law throughout AIDLC: a new
TDD skill (adapted port from superpowers) + iron law in `implementer.md`
+ mandatory `## Test Plan` in every spec + TDD-ordered tasks in every
plan + TDD verification in `/test`.

## Goal

Make TDD non-negotiable in AIDLC. Every spec must include a `## Test
Plan`. Every plan task must reference a spec scenario + follow
RED-GREEN-REFACTOR. Every implementation must write the failing test
FIRST and verify it fails. The `/test` phase catches TDD violations.

Without this, even with F3/F4 (verification + debugging skills) shipped,
AIDLC agents can still produce code that lacks test coverage because
tests-after-the-fact pass immediately and prove nothing.

## Scope

**In scope (this spec):**
- F5 part A: new `skills/test-driven-development/SKILL.md` (adapted port from superpowers, ~400 lines)
- F5 part B: iron law + RED-GREEN-REFACTOR + anti-rationalization table prepended to `agents/implementer.md`
- F5 part C: mandatory `## Test Plan` enforced by spec-writer
- F5 part D: TDD-ordered tasks with spec scenario references in plan.md
- F5 part E: TDD verification in `/test` phase (commit history + scenario coverage)
- F5 part F: integration with existing skills (specify, plan, implement, test) — references to new TDD skill
- F5 part G: content tests for the new skill (~8 tests) + validation tests (~13 tests if aidlc tool extended) + coverage tests (~3 tests)
- F5 part H: Timeline entries on this spec + the spec Timeline section

**Out of scope (deferred to future specs):**
- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption for AIDLC's planner
- F8: Anti-performative review discipline
- F9: 4-option finishing
- F10: Multi-harness adapters
- F11: Behavioral evals via drill (LLM-judged TDD compliance)
- F12: Durable progress ledger
- F5 deferred: TDD-as-iron-law for multi-session subagents (handled by F6)
- F5 deferred: TDD-as-iron-law for spec-writer's spec output validation (out of scope — spec.md is markdown, not code)

## Decisions (from brainstorming Q&A)

| # | Question | Answer |
|---|---|---|
| 1 | F5 scope | **C. Full TDD system** — skill + implementer rewrite + spec Test Plan + plan TDD-ordered + test verification + cross-cutting integration |
| 2 | implementer.md rewrite scope | **A. Surgical additions** — prepend iron law + RED-GREEN-REFACTOR + table; replace existing scattered TDD mentions with references to the new skill |
| 3 | TDD skill port strategy | **C. Adapt for AIDLC** — port superpowers' TDD skill but rewrite examples to reference AIDLC commands (worktrees, .aidlc/state, multi-session). Mixes Tier 1 voice decision with AIDLC specifics. |
| 4 | Spec format change | **A. Mandatory `## Test Plan` section** — every new spec includes test scenarios. Forces testability thinking at design time. |
| 5 | Plan format integration | **D. Both A and B** — each task references which spec scenarios it implements AND has TDD-ordered steps (RED-GREEN-REFACTOR). |
| 6 | Phase integration scope | **C. All four phases** — /specify (enforce Test Plan), /plan (TDD-ordered tasks), /implement (follow TDD), /test (verify TDD + coverage). TDD woven through the whole pipeline. |
| 7 | Merging existing TDD content + voice | **D. Replace existing mentions; voice "your human partner" for new skill only** — one source of truth (the TDD skill); agent files keep existing mixed voice. |

## Architecture

### Create

| Path | Purpose | Est. lines |
|---|---|---|
| `extensions/aidlc-workflow/skills/test-driven-development/SKILL.md` | Adapted port of superpowers' TDD skill | ~400 |
| `extensions/aidlc-workflow/test/skills-tdd.test.ts` | Content tests for the new TDD skill | ~150 |

### Modify

| Path | Change |
|---|---|
| `agents/implementer.md` | Prepend iron law + RED-GREEN-REFACTOR + anti-rationalization table; replace scattered TDD mentions with references to the new skill |
| `agents/spec-writer.md` | Enforce mandatory `## Test Plan` section in every spec |
| `agents/planner.md` | Each task references spec `## Test Plan` scenarios (ST-NNN IDs) + TDD-ordered steps |
| `agents/tester.md` | **Verify exists; create if needed.** Validates TDD compliance + scenario coverage. |
| `skills/specify/SKILL.md` | Add mandatory `## Test Plan` requirement |
| `skills/plan/SKILL.md` | Add TDD-ordered task format (references scenarios + RED-GREEN-REFACTOR steps) |
| `skills/implement/SKILL.md` | Add iron law reference; replace existing TDD mentions with TDD skill reference |
| `skills/test/SKILL.md` | Add TDD verification (already has F4 systematic-debugging reference) |
| `skills/aidlc-workflow/SKILL.md` | Reference new TDD skill in the orchestrator's overview |
| `commands.md` | Update if any TDD command references exist |

### Optionally extend (aidlc tool)

| Path | Change |
|---|---|
| `index.ts` + `AidlcParams` schema | Add 3 new actions: `validate-spec`, `validate-plan`, `validate-tdd` — programmatic gates for spec/plan validity + TDD compliance |

### No changes

- `bootstrap.ts`, `agents/reviewer.md`, `agents/shipper.md` — no TDD-specific changes for F5; reviewers/shippers verify TDD was followed via existing tools (`/test` report)
- Other skill files (entropy-control, signal-triage, state-management, etc.) — no TDD relevance

## Components

### New `skills/test-driven-development/SKILL.md` structure

```markdown
---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

## Overview
[adapted: Core principle + AIDLC's TDD-as-iron-law commitment]

## When to Use
[Adapted: AIDLC-specific triggers — T-XXX task in plan.md,
spec Test Plan scenarios, bug found during /test phase]

## The Iron Law
[verbatim from superpowers]
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST

## Red-Green-Refactor
[Adapted: RED-GREEN-REFACTOR cycle + AIDLC test patterns:
node:test, MockExtensionAPI, test/ directory layout]

## Good Tests
[verbatim]

## Why Order Matters
[verbatim]

## Common Rationalizations
[Adapted: add AIDLC-specific excuses like
"Spec didn't have Test Plan", "I'll test next task",
"Multi-session subagent will handle it"]

## Red Flags - STOP and Start Over
[verbatim]

## Example: Bug Fix
[Adapted: AIDLC-specific example — bug in bootstrap.ts,
test in test/bootstrap.test.ts, fix in bootstrap.ts]

## Verification Checklist
[Adapted: includes "All Test Plan scenarios in spec.md are covered by tests"]

## When Stuck
[verbatim]

## Debugging Integration
[verbatim — references the systematic-debugging skill (F4)]

## Testing Anti-Patterns
[Reference to superpowers' testing-anti-patterns.md if available]

## AIDLC-Specific Notes
[NEW section — tests in extensions/<extension>/test/*.test.ts,
worktree context, multi-session subagents also follow TDD]

## Final Rule
[verbatim]
```

### Adaptations from source

| Section | Adaptation |
|---|---|
| Frontmatter | description verbatim |
| Overview | +1 sentence about AIDLC commitment |
| When to Use | + AIDLC-specific triggers |
| Iron Law | verbatim |
| RED-GREEN-REFACTOR | + AIDLC test patterns + Verify RED expected output |
| Good Tests / Why Order / Refactor / Verify GREEN | verbatim (universal) |
| Common Rationalizations | + 3 AIDLC-specific excuses |
| Red Flags | verbatim |
| Example: Bug Fix | + AIDLC-specific example |
| Verification Checklist | + "Test Plan scenarios covered" |
| When Stuck | verbatim |
| Debugging Integration | references F4 systematic-debugging skill |
| Testing Anti-Patterns | reference to superpowers' file |
| AIDLC-Specific Notes | NEW (only fully-new section) |
| Final Rule | verbatim |

**Voice:** matches superpowers ("your human partner"). Per Q7+D.

**Iron law phrasing:** verbatim "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST" — universal, no adaptation needed.

## Data flow

```
/specify <feature>
  └─→ spec-writer agent reads brief
      └─→ writes .aidlc/spec.md
          ├─ Goal, Architecture, Components, ...
          └─ ## Test Plan (MANDATORY)
              ├─ Acceptance criteria as test scenarios (Given/When/Then)
              ├─ Edge cases (null, empty, boundary values)
              └─ Error cases (what happens when X fails)
      └─→ VALIDATION: spec-writer checks own output before commit
          └─→ if "## Test Plan" missing → refuse to commit; ask user

/plan
  └─→ planner agent reads .aidlc/spec.md
      └─→ extracts ## Test Plan scenarios (numbered ST-001, ST-002, ...)
      └─→ writes .aidlc/plan.md with tasks that:
          ├─ T-001: implement ST-001, ST-002 — RED-GREEN-REFACTOR
          │   ├─ Step 1: Write failing test (full code shown)
          │   ├─ Step 2: Run test, verify FAIL
          │   ├─ Step 3: Write minimal implementation (full code shown)
          │   ├─ Step 4: Run test, verify PASS
          │   └─ Step 5: Commit (test + impl in same commit OK)
          ├─ T-002: implement ST-003 — RED-GREEN-REFACTOR
          └─ ...
      └─→ VALIDATION: every task references ≥1 spec scenario
          └─→ if orphan tasks (no scenario ref) → flag for review

/implement T-001
  └─→ implementer agent reads:
      ├─ .aidlc/spec.md (Goal + Test Plan)
      ├─ .aidlc/plan.md (T-001 description + steps)
      └─ SKILL: test-driven-development (loads via skill tool)
  └─→ follows TDD discipline:
      ├─ MUST write failing test FIRST
      ├─ MUST run test, paste output showing FAIL
      ├─ THEN write minimal implementation
      ├─ THEN run test, paste output showing PASS
      └─ THEN refactor + commit
  └─→ if implementer skips RED → /test catches it

/test
  └─→ runs test suite → reports pass/fail
  └─→ VALIDATES TDD compliance:
      ├─ For each Test Plan scenario in spec.md, find ≥1 test
      │   covering it (grep test descriptions for ST-NNN)
      ├─ For each production code commit, check that a test
      │   commit precedes it (git log)
      └─ Report: "X scenarios covered, Y missing; Z commits
          without preceding test commits"
  └─→ if scenarios missing or TDD skipped → flag for /implement
```

**Test Plan scenarios get IDs (ST-NNN) so they're traceable:**
- `ST-001`: "Given valid state.md, when bootstrap fires, then message is injected"
- `ST-002`: "Given state.md is malformed, when bootstrap fires, then no-loop template is used"
- etc.

These IDs flow through plan tasks (T-NNN references ST-NNN) and tests (test names reference ST-NNN).

**Error handling at each phase:**
- `/specify` without Test Plan → spec-writer refuses to commit; explicit error message
- `/plan` with orphan tasks → planner flags them, asks for confirmation before committing
- `/implement` skipping RED → implementer agent must explicitly call out "I am about to skip RED because..." (iron law)
- `/test` with missing scenarios or TDD violations → returns structured failure report

## Error handling

**Failure modes with explicit handling:**

| Condition | Detection | Behavior |
|---|---|---|
| `## Test Plan` missing in spec.md | spec-writer scans own output before commit | Refuse to commit; explicit error: "spec.md missing required `## Test Plan` section. Add test scenarios (acceptance criteria as test cases, edge cases, error cases) before /plan can run." |
| Orphan tasks (no ST-NNN ref) in plan.md | planner scans own output | Flag orphans: "T-005 has no spec scenario reference. Either add a scenario to spec.md or remove T-005." Refuse to commit until resolved. |
| Implementer writes production code before failing test | git diff of implementer's working changes | /test detects: production files changed without test files also changed. Return: "TDD violation: file `X.ts` modified without corresponding test in `test/X.test.ts`. Run `git diff --stat` to see the imbalance." |
| Test Plan scenario has no test coverage | /test grep `ST-NNN` against test file descriptions | Return: "X scenarios without test coverage: ST-007, ST-012. Add tests covering these scenarios before /ship." |
| TDD skill fails to load (symlink missing) | `install.sh` runs before session | Manual smoke check: `ls -la ~/.pi/agent/skills/test-driven-development`. If missing, run `bash install.sh`. The TDD skill content is critical — implementer has fallback guidance in implementer.md but full discipline requires the skill. |
| Implementer skips RED step explicitly | implementer agent self-reports | Per iron law: NO. Implementer must either (a) write the test first or (b) explicitly invoke `systematic-debugging` if the implementation exists from prior work. No "I'll skip RED just this once." |
| Test fails after GREEN step | implementer observes | Stop. Invoke `systematic-debugging` skill (F4) to find root cause before patching. Don't add "just make it pass" code. |
| TDD skill conflicts with existing implementer.md guidance | manual review of diff | F5 replaces scattered TDD mentions with references to the TDD skill (Q7+D). If contradictions exist, TDD skill wins; implementer.md is updated. |

**Defensive coding rules:**

1. The aidlc tool's `/specify` action must validate spec.md has `## Test Plan` before transitioning to plan phase. Hard gate.
2. The aidlc tool's `/plan` action must validate every task references ≥1 ST-NNN scenario (or is explicitly tagged "non-test refactor").
3. The aidlc tool's `/test` action must run scenario coverage check. Reports missing scenarios as a structured failure.
4. No silent failures. Every caught error logs to pi console with `[aidlc]` prefix.
5. The TDD skill content is critical — `install.sh` failure is logged loudly.

**Known limitation — TDD validation is partly LLM-judged:**

The TDD discipline enforcement (e.g., "implementer wrote production code before failing test") requires either:
- (a) git commit history analysis (mechanical, reliable)
- (b) LLM judge reading the implementer's reasoning (subjective)

F5 implements (a) as the primary check. (b) is out of scope for F5 (could be F11 — behavioral evals via drill).

## Testing

**Three layers:**

| Layer | What | Count | Tool |
|---|---|---|---|
| Content tests | New TDD skill: file exists, valid frontmatter, description ≤1024, iron law, RED-GREEN-REFACTOR sections, AIDLC-Specific Notes section, install.sh symlink | ~8 | `node --test` |
| Validation tests | spec.md validation logic (if added to aidlc tool): `## Test Plan` presence, scenario count, schema | ~5 | `node --test` |
| Validation tests | plan.md validation logic (if added): every task references ST-NNN, orphan detection | ~5 | `node --test` |
| Coverage tests | /test scenario coverage: ST-NNN grep against test file descriptions | ~3 | `node --test` |

**Total new tests:** ~21.

**Where validation lives — design decision:**

The aidlc tool currently has actions like `start`, `status`, `sync`, `classify-comments`. F5 could add new actions:

- `validate-spec` — checks spec.md has `## Test Plan` with ≥1 scenario
- `validate-plan` — checks every task references ≥1 ST-NNN scenario
- `validate-tdd` — checks current diff: tests changed ≥ as much as production

These would be programmatic, unit-testable, and could be invoked by `/specify`, `/plan`, `/test` skills to gate phase transitions.

OR validation could live entirely in agent markdown (less reliable, harder to test).

**My recommendation:** Add the three validation actions to the aidlc tool. Programmatic gates are more reliable than LLM-judged gates. ~10-15 hours of additional implementation work but reduces the surface for "agent skipped validation."

**Coverage target:** ≥85% on new TypeScript code (`validate-spec`, `validate-plan`, `validate-tdd` if added).

**Behavioral evals (out of scope for F5):**

Just like Tier 1 deferred drill evals to F11, F5's LLM-judged behaviors (does implementer actually follow TDD?) are out of scope. F11 (behavioral evals) would add:
- "Given a fresh T-001 task, does the implementer write the failing test before the implementation?"
- "Given a spec without Test Plan, does the spec-writer refuse to commit?"

## Test list (detailed)

```
test/skills-tdd.test.ts
  ├─ test-driven-development/SKILL.md exists                    ✓
  ├─ has valid frontmatter (name + description ≤1024)           ✓
  ├─ contains iron law (NO PRODUCTION CODE WITHOUT...)          ✓
  ├─ contains all 3 RED/GREEN/REFACTOR sections                ✓
  ├─ contains "AIDLC-Specific Notes" section                   ✓
  ├─ references systematic-debugging skill (F4 cross-link)     ✓
  ├─ install.sh symlink points to right path                    ✓
  └─ (additional content checks per brief)

test/aidlc-validation.test.ts (if validation actions added)
  ├─ validate-spec: detects missing ## Test Plan               ✓
  ├─ validate-spec: counts scenarios (≥1 required)              ✓
  ├─ validate-spec: rejects malformed scenario IDs              ✓
  ├─ validate-plan: detects orphan tasks (no ST-NNN ref)        ✓
  ├─ validate-plan: detects multi-ref tasks (counts ≥1 ST-NNN)   ✓
  ├─ validate-plan: accepts explicit "non-test refactor" tag    ✓
  ├─ validate-tdd: detects production w/o test in diff          ✓
  ├─ validate-tdd: accepts "test-only" commits                  ✓
  └─ (additional validation logic tests)

test/scenario-coverage.test.ts (if validation added)
  ├─ finds ST-NNN mentions in test descriptions                 ✓
  ├─ reports missing scenarios (not in any test)                ✓
  ├─ reports orphan tests (no ST-NNN in description)            ✓
  └─ (additional coverage logic)
```

## Open questions

1. **Should the 3 validation actions (validate-spec, validate-plan, validate-tdd) be added to the aidlc tool, or live in agent markdown?** Recommendation: add to the tool (programmatic gates). Confirm during implementation; this adds ~10-15 hours of work.

2. **Where does `agents/tester.md` live if it doesn't exist?** If not found in `agents/`, we create it as a new file. Verify during implementation.

3. **What is the exact content of the AIDLC-adapted TDD skill examples?** The plan suggests using `bootstrap.ts` as the example, but Tier 1 may want a different example (more recent or more relevant). Decision deferred to implementation.

4. **How does F5 interact with F6 (fresh subagent per task)?** If F6 ships first, subagents follow TDD too. If F5 ships first, subagents may not (existing subagent invocation doesn't load skills). Decision deferred to F6.

5. **ST-NNN scenario ID scheme** — helpful for traceability or over-engineered? Lean toward helpful (gives /test something concrete to grep). Confirm during implementation.

## Out of scope (deferred to future specs)

- F6: Fresh subagent per task with two-stage review
- F7: writing-plans format adoption for AIDLC's planner (F5 partially adopts this for task structure)
- F8: Anti-performative review discipline
- F9: 4-option finishing
- F10: Multi-harness adapters
- F11: Behavioral evals via drill
- F12: Durable progress ledger

## Refs

- [superpowers fusion audit](./superpowers-fusion-audit.md) — the broader roadmap (F1-F12)
- [Tier 1 spec: bootstrap extension](./2026-06-26-aidlc-bootstrap-design.md) — F1-F4 already shipped
- [superpowers `test-driven-development` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/test-driven-development/SKILL.md) — the source being adapted
- [superpowers `using-git-worktrees` skill](file:///Users/choguun/.pi/agent/git/github.com/obra/superpowers/skills/using-git-worktrees/SKILL.md) — referenced in AIDLC-Specific Notes
- [AIDLC ARCHITECTURE.md](./ARCHITECTURE.md) — the system being extended

## Timeline

2026-06-26 | spec drafted — 7-question brainstorming session resolved all major design decisions (scope=C Full TDD, implementer=A surgical, skill=C adapt, spec=A mandatory Test Plan, plan=D both, integration=C all 4 phases, merging=D replace existing). Five design sections approved (architecture, components, data flow, error handling, testing). Spec written and awaiting user review.
2026-06-26 | spec approved — user approved all 7 brainstorming decisions + 5 design sections. Status updated from draft to approved. Spec is ready for writing-plans.
