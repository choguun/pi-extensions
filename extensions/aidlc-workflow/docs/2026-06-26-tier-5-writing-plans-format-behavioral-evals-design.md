---
title: Tier 5 superpowers fusion: writing-plans format + behavioral evals via drill (F7 + F11)
type: spec
status: draft
domain: [aidlc-workflow]
---

# Tier 5 superpowers fusion: F7 + F11 — design

F7 + F11 from the [superpowers fusion audit](./superpowers-fusion-audit.md).
F7 adopts the full superpowers writing-plans format (exact file paths +
complete code per step + exact commands). F11 adds a self-contained
behavioral eval harness (drill) that tests whether LLMs actually follow
AIDLC's discipline.

## Goal

**Two complementary improvements:**

1. **F7 (writing-plans format)** — AIDLC plans currently use T-NNN IDs +
   short summaries. F7 adopts the full superpowers writing-plans format:
   `**Files:**` (exact paths), `**Interfaces:**` (cross-task contracts),
   `**Steps:**` (full code + exact commands + expected output). Plans
   become directly executable. The implementer subagent (F6's
   execute-task) gets exact instructions, not summaries.

2. **F11 (behavioral evals)** — AIDLC has 198 unit tests for code paths
   but no verification that LLMs actually follow the discipline shipped
   in Tiers 1-4. F11 ships a self-contained drill harness + 4 scenarios
   that test LLM behavior in real sessions (does the implementer invoke
   execute-task? does pr-feedback-handler avoid sycophancy? does shipper
   present 4 options?).

**Together:** F7 defines the contract; F11 verifies the contract is honored.

## Scope

**In scope (this spec):**
- F7.1: `agents/planner.md` rewritten (full-format producer) + `test/plan-format.test.ts` (10 tests)
- F7.2: `skills/plan/SKILL.md` + `skills/specify/SKILL.md` updated + `docs/plans/_template.md` shipped
- F11.1: `test/evals/harness.ts` (self-contained drill harness) + `test/evals/harness.test.ts` (8 tests)
- F11.2: 4 drill scenarios in `test/evals/scenarios/*.yaml`:
  - execute-task-discipline
  - verification-before-completion
  - anti-performative-review
  - shipper-4-options
- Spec Timeline entry

**Out of scope (deferred):**
- F10: Multi-harness adapters (pi-extensions → Claude Code, OpenCode, etc.)
- Drill result persistence / reporting dashboard
- Concurrent drill runs
- LLM-as-judge for plan format validation (drill does this via scenarios)
- Existing tier plans (Tier 1-4) — historical records, no migration

## Decisions (from brainstorming Q&A)

| # | Question | Answer |
|---|---|---|
| 1 | F7 format scope | **A. Full superpowers format** — `**Files:**`, `**Interfaces:**`, `**Steps:**` with code blocks per task |
| 2 | F11 scenario count | **B. Top 4 scenarios** — execute-task discipline, verification, anti-performative review, shipper 4 options |
| 3 | F11 drill integration | **B. Self-contained** — ship harness in AIDLC, no external superpowers-evals dependency |
| 4 | Commit structure | **B. 4 commits within 1 PR** — F7.1, F7.2, F11.1, F11.2 |
| 5 | F11 scenario format | **A. YAML frontmatter + markdown body** — human-readable + structured |
| 6 | F7 compat + planner.md scope | **A+D. Forward-only + replace planner.md** — no migration; old plans remain valid historical records |

## Architecture

### Create

| Path | Fusion | Purpose | Est. lines |
|---|---|---|---|
| `extensions/aidlc-workflow/test/plan-format.test.ts` | F7 | Static checks for plan compliance | ~250 |
| `extensions/aidlc-workflow/docs/plans/_template.md` | F7 | Canonical plan template | ~80 |
| `extensions/aidlc-workflow/test/evals/harness.ts` | F11 | Self-contained drill harness | ~250 |
| `extensions/aidlc-workflow/test/evals/harness.test.ts` | F11 | Unit tests for harness | ~150 |
| `extensions/aidlc-workflow/test/evals/scenarios/execute-task-discipline.yaml` | F11 | Scenario 1 | ~30 |
| `extensions/aidlc-workflow/test/evals/scenarios/verification-before-completion.yaml` | F11 | Scenario 2 | ~30 |
| `extensions/aidlc-workflow/test/evals/scenarios/anti-performative-review.yaml` | F11 | Scenario 3 | ~30 |
| `extensions/aidlc-workflow/test/evals/scenarios/shipper-4-options.yaml` | F11 | Scenario 4 | ~30 |

### Modify

| Path | Fusion | Change |
|---|---|---|
| `extensions/aidlc-workflow/agents/planner.md` | F7 | REPLACE with full-format producer |
| `extensions/aidlc-workflow/skills/plan/SKILL.md` | F7 | Update HARD-GATE: full format required |
| `extensions/aidlc-workflow/skills/specify/SKILL.md` | F7 | Cross-reference full plan format |

### No changes

- `bootstrap.ts`, `index.ts` (Tier 1+4), other agents, other skills
- Existing tier plans (Tier 1-4) — historical records, no migration

### Commit structure (4 commits within 1 PR)

```
Commit 1: F7.1 — planner.md rewrite + plan-format tests (full format)
Commit 2: F7.2 — skills/plan + skills/specify updates + _template.md
Commit 3: F11.1 — drill harness (test/evals/harness.ts + tests)
Commit 4: F11.2 — 4 drill scenarios (YAML + markdown)
```

## Components

### F7.1 — `agents/planner.md` (full rewrite)

```markdown
# Planner (full-format plan producer)

<HARD-GATE>
Every plan task in `.aidlc/plan.md` MUST follow the full superpowers writing-plans format. Refuse to commit a plan that uses the old "task ID + summary" style.
</HARD-GATE>

## Task Format (full superpowers writing-plans format)

Every T-XXX task MUST have:

### Task T-001: <Component Name>

**Implements:** ST-001, ST-002

**Files:**
- Create: `extensions/<ext>/test/<file>.test.ts` (test first)
- Create: `extensions/<ext>/src/<file>.ts` (after test fails)
- Test: `npm test test/<file>.test.ts`

**Interfaces:**
- Consumes: [earlier-task signatures]
- Produces: [function names + signatures]

**Steps:**
- [ ] **Step 1: Write failing test (RED)** [full test code]
- [ ] **Step 2: Run test, verify FAIL**
      Run: `npm test test/<file>.test.ts`
      Expected: FAIL with "<expected error>"
- [ ] **Step 3: Write minimal implementation (GREEN)** [full code]
- [ ] **Step 4: Run test, verify PASS**
      Run: `npm test test/<file>.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**
      Run: `git add <files> && git commit -m "feat(<scope>): T-001 <description>"`
```

## Hard Rules

1. Every task has `**Files:**` — exact file paths. No vague summaries.
2. Every task has `**Steps:**` — each step shows complete code.
3. Step 1 is always RED — write the failing test FIRST.
4. Each step has an exact command + expected output.
5. Each task is independently committable — RED + GREEN + commit in one cycle.
6. Use ST-NNN references — link tasks to spec scenarios (Tier 2 F5).
```

### F7.2 — `docs/plans/_template.md`

Ships the canonical plan template (copy this when starting a new plan).

### F11.1 — `test/evals/harness.ts` (drill core)

```typescript
// Minimal drill harness — LLM-as-judge runner, self-contained, no external deps

interface Scenario {
  name: string;
  setup: string;
  expected_behavior: string;
  judge_prompt: string;
}

export async function runScenario(scenarioPath: string, llmInvoke: (prompt: string) => Promise<string>): Promise<{ name: string; passed: boolean; reasoning: string }> {
  // 1. Read scenario YAML
  // 2. Send setup to LLM, record response
  // 3. Send judge_prompt + LLM response to LLM judge
  // 4. Parse verdict (pass | fail | ambiguous)
  // 5. Return result
}

export async function runAllScenarios(scenariosDir: string, llmInvoke: (p: string) => Promise<string>): Promise<{ passed: number; failed: number; results: any[] }> {
  // Load all .yaml from dir, run each, summarize
}

function parseFrontmatter(content: string): Scenario { /* regex-based, no YAML lib */ }
function parseVerdict(judgeResponse: string): 'pass' | 'fail' | 'ambiguous' { /* default to fail on ambiguous */ }
```

### F11.2 — 4 scenarios (YAML + markdown)

| Scenario | Tests |
|---|---|
| `execute-task-discipline.yaml` | Does implementer invoke `aidlc execute-task T-NNN` before any other action? |
| `verification-before-completion.yaml` | Does implementer invoke `verification-before-completion` skill before claiming done? |
| `anti-performative-review.yaml` | Does pr-feedback-handler avoid "Great catch!" and push back with technical reasoning? |
| `shipper-4-options.yaml` | Does shipper present all 4 options and refuse to auto-execute? |

Each scenario format (YAML frontmatter + optional markdown body):
```yaml
---
name: <scenario-name>
setup: |
  You are the <agent>. <situation>.
expected_behavior: |
  You should <correct behavior>.
judge_prompt: |
  Did the LLM <specific question>? Reply PASS/FAIL.
---
[optional markdown body with details]
```

## Data flow

### F7 — planner produces full-format plans

```
/plan
  └─→ planner reads .aidlc/spec.md (especially ## Test Plan + ST-NNN)
      └─→ copies _template.md structure
      └─→ fills per-task:
          ├─ **Implements:** ST-NNN refs
          ├─ **Files:** exact paths
          ├─ **Interfaces:** cross-task signatures
          ├─ **Steps:** full code per step
          └─→ writes .aidlc/plan.md
      └─→ validates plan format (per `test/plan-format.test.ts`)
          ├─ if invalid: refuse to commit, list missing fields
          └─ if valid: commit
```

### F7 — implementer follows plan (via F6's execute-task)

```
/implement T-001
  └─→ implementer invokes aidlc execute-task T-001
      └─→ action extracts T-001 from .aidlc/plan.md (full format)
      └─→ writes brief with full Steps verbatim
      └─→ implementer subagent follows Steps mechanically
      └─→ reviewer subagent evaluates against plan (spec compliance)
```

### F11 — drill scenario runs

```
npm run evals
  └─→ harness loads test/evals/scenarios/*.yaml
  └─→ for each scenario:
      ├─→ Step 1: invoke LLM with scenario.setup
      ├─→ Step 2: invoke LLM judge with scenario.judge_prompt + response
      └─→ record result
  └─→ summary: { passed: N, failed: M, results: [...] }
```

### F7 + F11 interaction

F7 produces full-format plans. F11's scenarios test whether LLMs follow them correctly. Together: F7 defines the contract; F11 verifies the contract is honored.

### Test integration

```
npm test           # fast unit tests (existing 198 + new 18 = 216)
npm run evals      # slow LLM-driven drill scenarios (manual/CI)
```

## Error handling

| Condition | Detection | Behavior |
|---|---|---|
| Plan missing `**Files:**` per task | plan-format.test.ts | Refuse to commit; list missing fields |
| Plan has `**Steps:**` but steps lack code blocks | plan-format.test.ts | Mark plan invalid; require code per step |
| Plan references ST-NNN not in spec.md | planner validation | Warn: "ST-NNN referenced but not found in spec.md ## Test Plan" |
| Plan has orphan task (no ST-NNN ref) | planner validation | Warn: "T-005 has no spec scenario reference" |
| `_template.md` modified out of sync | plan-format.test.ts snapshot test | Catch drift; manual update required |
| Drill harness can't find scenario file | readdirSync filter | Skip missing file; report in summary |
| Scenario YAML malformed (no `---` frontmatter) | parseFrontmatter regex fails | Report "scenario X has no frontmatter" + skip |
| LLM judge returns ambiguous verdict (says "maybe") | parseVerdict | Default to FAIL. Safer to fail-loud than pass-silent. |
| LLM API timeout/error during scenario | try/catch around llmInvoke | Report scenario as ERROR; continue with other scenarios |
| LLM judge hallucinates (refers to actions LLM didn't take) | judge prompt asks for citations | If no citation match, mark as ambiguous → FAIL |
| `parseFrontmatter` returns partial | schema check before run | Skip scenario with warning: "missing required fields" |
| Plan validation finds errors AFTER commit | test runner | Test fails. CI blocks merge. |
| Drill runs on CI but LLM API unavailable | try/catch around all scenarios | Return summary with all "ERROR" results; exit 0 (don't block CI) |

**Defensive rules:**
1. All file I/O in try/catch.
2. Drill defaults to FAIL on ambiguous (not PASS).
3. LLM API errors don't crash harness.
4. Plan validation is committed-blocking in CI.
5. Drill never modifies user files (read-only).

## Testing

**Four layers, ~18 new tests:**

| Layer | What | Count |
|---|---|---|
| Plan format | `test/plan-format.test.ts` | ~10 |
| Drill harness | `test/evals/harness.test.ts` (parseFrontmatter, parseVerdict, scenario loading) | ~8 |
| Scenario fixtures | 4 YAML files in `test/evals/scenarios/` | (manual via drill) |

**Drill scenarios are NOT unit tests** — they're LLM-driven behavioral evals. Run via `npm run evals`, not `npm test`.

**Coverage target:** ≥85% on `test/evals/harness.ts`.

**Test list:**

```
test/plan-format.test.ts
  ├─ plan with all required sections per task is valid
  ├─ plan missing **Files:** is invalid
  ├─ plan missing **Steps:** is invalid
  ├─ plan with Steps lacking code blocks is invalid
  ├─ plan referencing ST-NNN (Tier 2 integration) is valid
  ├─ plan with **Interfaces:** is valid (superpowers full format)
  ├─ _template.md matches canonical structure
  ├─ old-style plan (T-NNN + summary only) is detected as legacy
  ├─ plan with Self-Review section is valid
  └─ plan header (Goal/Architecture/Tech Stack) is required

test/evals/harness.test.ts
  ├─ parseFrontmatter extracts name, setup, expected_behavior, judge_prompt
  ├─ parseFrontmatter returns empty object on malformed YAML
  ├─ parseVerdict returns 'pass' when only pass signals present
  ├─ parseVerdict returns 'fail' when only fail signals present
  ├─ parseVerdict returns 'ambiguous' when both signals present
  ├─ parseVerdict returns 'ambiguous' when neither signal present
  ├─ loadScenarios reads all .yaml files from directory
  └─ loadScenarios skips malformed files with warning
```

**Manual smoke test:**

```bash
# 1. Run unit tests
cd extensions/aidlc-workflow && npm test
# Expected: 198 + 18 = 216 tests pass

# 2. Run drill scenarios (requires LLM API key)
npm run evals
# Expected: 4 scenarios run; report shows pass/fail per scenario

# 3. Verify plan format enforcement
# In a worktree with .aidlc/plan.md containing a simple-format task:
# Expected: plan-format.test.ts fails; user must update plan

# 4. Verify planner.md produces full format
# With updated planner.md, ask an LLM to /plan a spec:
# Expected: generated plan has **Files:**, **Steps:** with code blocks
```

**What's NOT in scope:**
- ❌ LLM-as-judge for plan format validation (drill does this via scenarios; static checks are faster)
- ❌ Concurrent drill runs
- ❌ Drill result persistence / reporting dashboard
- ❌ Eval reporting beyond CLI summary

## Open questions

1. **Drill harness LLM invocation** — uses pi's subagent tool (consistent with F6), direct LLM API call (faster), or a hybrid? Decide during implementation.

2. **Drill scenario execution order** — sequential (simpler) or parallel (faster but state-leaky)? Recommend sequential.

3. **`_template.md` location** — `docs/plans/_template.md` (per the plan) or somewhere else? Recommend `docs/plans/_template.md`.

4. **Plan validation in planner agent** — synchronous check before commit, or async warning? Recommend synchronous (refuse invalid plans).

5. **Drill scenarios content** — the 4 scenarios above are sketches. Real content needs more detail in setup + judge_prompt. Decide during implementation.

## Out of scope (deferred to future specs)

- F10: Multi-harness adapters
- Drill result persistence / reporting dashboard
- Concurrent drill runs
- LLM-as-judge for plan format validation
- Existing tier plans migration

## Refs

- [superpowers fusion audit](./superpowers-fusion-audit.md) — F1-F12 candidates
- [Tier 1 spec: bootstrap extension](./2026-06-26-aidlc-bootstrap-design.md) — already shipped
- [Tier 2 spec: TDD-as-iron-law](./2026-06-26-tier-2-tdd-as-iron-law-design.md) — already shipped
- [Tier 3 spec: polish bundle](./2026-06-26-tier-3-polish-bundle-f8-f9-f12-design.md) — already shipped
- [Tier 4 spec: F6 fresh-subagent-per-task](./2026-06-26-tier-4-fresh-subagent-per-task-design.md) — already shipped
- superpowers' writing-plans skill — F7 source format
- superpowers' drill harness (in superpowers-evals repo) — F11 reference design
- [AIDLC ARCHITECTURE.md](./ARCHITECTURE.md) — the system being extended

## Timeline

2026-06-26 | spec drafted — 6-question brainstorming session resolved all major design decisions (F7=A full format, F11:B 4 scenarios, F11.1:B self-contained drill, commits:B 4 commits, scenarios:A YAML+markdown, F7+planner:A+D forward-only+rewrite). Five design sections approved (architecture, components, data flow, error handling, testing). Spec written and awaiting user review.
