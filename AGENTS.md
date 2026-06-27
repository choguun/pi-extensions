<!--
  This is AGENTS.md — the context any AI agent reads on EVERY session in this
  repo. Keep it tight. Detail belongs in ARCHITECTURE.md, the per-skill
  SKILL.md files, or docs/. Cut anything that doesn't apply.
-->

# pi-extensions — Agent operating context

You are working in the **pi-extensions** repo. It builds pi extensions,
agents, skills, and commands that implement the **AI-Driven Development
Life Cycle (AIDLC)** — a 6-phase pipeline (spec → plan → implement →
test → review → ship) with a loop-engineer-style knowledge-base substrate.

AIDLC was hardened by a **6-tier superpowers fusion** (PRs #2–#7) that
adopted 10 of the 12 patterns from [`obra/superpowers`](https://github.com/obra/superpowers)
into AIDLC: HARD-GATEs, TDD-as-iron-law, fresh-subagent-per-task,
verification gates, anti-performative review, 4-option finishing, full
superpowers writing-plans format, and a self-contained behavioral drill
harness. Tier 7 is the polish release (7 deferred fixes). See
`docs/superpowers-fusion-audit.md` for the audit and `docs/2026-06-26-tier-*-design.md`
per tier.

The authoritative model lives in
[`extensions/aidlc-workflow/ARCHITECTURE.md`](extensions/aidlc-workflow/ARCHITECTURE.md).
Read it first if you haven't this session.

## What it is

- **Main extension:** `extensions/aidlc-workflow/` — TypeScript extension
  that registers the `aidlc` tool (13 actions) and 7 slash commands.
- **Multi-session extension:** `extensions/multi-session/` — lets multiple
  pi processes on the same machine discover each other and exchange
  messages. Process registry + per-session mailboxes in
  `${agentDir}/runtime/`. Exposes `pi_sessions`, `pi_send`, `pi_who`
  tools + `/who`, `/sessions`, `/send` commands.
- **Plan-mode extension:** `extensions/plan-mode/` — Claude Code-style
  plan mode (read-only exploration + 5-phase system prompt + plan file
  + explicit `plan_enter` / `plan_exit` tools).
- **Knowledge base:** `extensions/aidlc-workflow/{signals,docs,domains,LOG.md}`
  — the loop-engineer fusion that makes work compound across projects.
- **Skills:** `extensions/aidlc-workflow/skills/*/SKILL.md` — 17 skills
  (6 phase + 5 loop-engineer meta + 6 superpowers-fusion meta). `extensions/multi-session/commands.md`
  is exposed as a fallback skill at install.
- **Agents:** `extensions/aidlc-workflow/agents/*.md` — 8 specialized
  agents (implementer, spec-writer, planner, tester, reviewer, shipper,
  pr-feedback-handler, code-reviewer).
- **Tests:** `extensions/aidlc-workflow/test/` — 216 tests on main, 230
  with [PR #7](https://github.com/choguun/pi-extensions/pull/7) merged.
  Run with `cd extensions/aidlc-workflow && npm test`. `extensions/multi-session/test/`
  — 62 tests. `extensions/plan-mode/test/` — 65 tests.

## Repo map (1 line per directory)

| Path | What |
|---|---|
| `extensions/aidlc-workflow/` | The AIDLC workflow extension (everything lives here) |
| `extensions/aidlc-workflow/skills/` | 17 SKILL.md files (6 phase + 11 meta) |
| `extensions/aidlc-workflow/agents/` | 8 agent files |
| `extensions/aidlc-workflow/plan-format.ts` | Superpowers writing-plans format validator (Tier 7) |
| `extensions/aidlc-workflow/signals/` | Evidence pool (PR comments, deduped) |
| `extensions/aidlc-workflow/docs/` | Durable knowledge (decisions, learnings, fusion specs) |
| `extensions/aidlc-workflow/docs/superpowers-fusion-audit.md` | The 12-pattern fusion lineage |
| `extensions/aidlc-workflow/docs/2026-06-26-tier-*-design.md` | One spec doc per fusion tier |
| `extensions/aidlc-workflow/docs/plans/` | Per-tier implementation plans |
| `extensions/aidlc-workflow/domains/` | One folder per project (loop) |
| `extensions/aidlc-workflow/test/` | 216 tests on main (230 with PR #7) |
| `extensions/multi-session/` | Cross-session IPC extension (registry + mailboxes) |
| `extensions/multi-session/protocol.ts` | Message types, identity, addressing helpers |
| `extensions/multi-session/registry.ts` | Process registry (heartbeat, stale prune) |
| `extensions/multi-session/mailbox.ts` | Per-session message log (append, poll, mark) |
| `extensions/multi-session/test/` | 4 test files, 62 tests |
| `extensions/plan-mode/` | Claude Code-style plan mode |
| `extensions/plan-mode/test/` | Plan-mode tests, 65 tests |
| `install.sh` | Symlinks every extension under `extensions/*` into `~/.pi/agent/` |

## Build & run

```bash
# Install (one-time, after clone) — handles every extension in extensions/*/
bash install.sh

# Run all tests (AIDLC)
cd extensions/aidlc-workflow
npm install --no-save typebox    # one-time, only test dep
npm test                         # typecheck + 216 tests on main, takes ~1s

# Run all tests (multi-session)
cd ../multi-session
npm install --no-save typebox @earendil-works/pi-coding-agent @types/node typescript   # one-time
npm test                         # typecheck + 62 tests, takes ~21s (uses 100ms inbox poll)

# Run all tests (plan-mode)
cd ../plan-mode
npm install --no-save typebox @earendil-works/pi-coding-agent @types/node typescript   # one-time
npm test                         # typecheck + 65 tests
```

The extensions run TypeScript directly via Node 24's
`--experimental-strip-types` — **no build step**. Edit `.ts` files,
restart pi, the new code loads.

## The 13 actions on the `aidlc` tool

| Action | Tier | Purpose |
|---|---|---|
| `start` | 1 | Worktree + branch + draft PR |
| `status` | 1 | Read `.aidlc/state.md` |
| `sync` | 1 | Reconcile state.md with branch/PR |
| `classify-comments` / `classify` | 1 | Route PR comments to phase + priority |
| `triage` | 1 | Persist classified comments to `signals/` |
| `next` | 1 | Print the next action for the current phase |
| `verify` | 1 | Verify-before-PR gate (typecheck + test + lint) |
| `validate-spec` | 2 | HARD-GATE: spec format validation |
| `validate-plan` | 2 / 7 | HARD-GATE: superpowers writing-plans format (calls `plan-format.ts`) |
| `validate-tdd` | 2 | HARD-GATE: TDD-as-iron-law (test must exist + fail first) |
| `append-progress` | 3 | Append to `.aidlc-progress.md` durable ledger |
| `read-progress` | 3 | Read the durable ledger across sessions |
| `execute-task` | 4 | 3-phase state machine: brief → review → finalize (Tier 4 subagent-driven-development) |

## Code conventions

### TypeScript (extensions/*/*.ts)

- **No in-function imports.** All imports at module top level.
- **Module split:** keep `index.ts` thin. Logic goes in
  `<name>.ts` modules. For multi-session: `protocol.ts` (types),
  `registry.ts` (process registry), `mailbox.ts` (message I/O).
  For AIDLC: `classifier.ts` (PR routing), `substrate.ts` (signal I/O),
  `worktree.ts` (worktree bootstrap), `plan-format.ts` (plan validation).
- **Atomic writes.** Use the `.tmp + rename` pattern (see AIDLC
  `substrate.ts` `writeSignal` and multi-session `registry.ts`
  `writeRegistry`). A crash mid-write must not leave a half-written file.
- **POSIX shell escaping.** When embedding LLM-supplied strings in shell
  commands, use `shellQuote()` from AIDLC `worktree.ts`. Never `exec`
  raw input.
- **APFS detection.** AIDLC `worktree.ts` `detectApfs()` uses
  `stat -f%Ht /` — APFS magic = 0x4827. Fall back to `pnpm/npm install`
  on non-APFS or when lockfiles differ.
- **TypeBox enums.** Use `Type.String({ description: "..." })` with
  a description listing valid values. Don't import `StringEnum` from
  `@earendil-works/pi-ai` (transitive dep only).
- **Tool return shape.** TypeScript can't infer union types for
  `registerTool().execute()` return values when error vs success
  branches have different `details` shapes. Either: (a) declare a
  single union-friendly details type and use a helper, or (b) cast
  the return. Both AIDLC and multi-session use the helper pattern.
- **Validate-plan wiring (Tier 7).** `validate-plan` action calls
  `validatePlanFormat()` from `plan-format.ts` — the single source of
  truth for plan validation. Both the action and the unit tests
  (`test/plan-format.test.ts`) import from this module, so there's
  no drift between "what the tool checks" and "what the tests check".

### Markdown (skills, docs, ARCHITECTURE, LOG)

- **Two-layer pages.** Each artifact = body + optional `## Timeline`
  (append-only, dated: `YYYY-MM-DD | source — what happened`).
- **One concept = one home.** By kind (`signal`, `doc`), not by domain.
  Cross-cutting = multi-tag + multi-link. `domain:` is a frontmatter field
  (a list), never a folder.
- **Frontmatter = anything you'd query.** Prose for everything else.
- **LOG.md grammar.** Strict: `## YYYY-MM-DD · Title · #tag1 #tag2`
  + `What:` + optional `Refs:`. One entry per ship/ingest.
- **Anti-rationalization tables (Tier 1).** Each phase skill that
  enforces a HARD-GATE MUST include a "Common rationalizations" section
  with every way an agent will try to skip the gate + the rebuttal.
  See `skills/specify/SKILL.md` for the pattern.

### Local artifacts (not committed)

The following artifacts are per-developer / per-session / per-clone local
state — they belong in `.git/info/exclude` (local-only, never tracked,
doesn't ship in PRs), **not** in `.gitignore` (which ships with every
PR and imposes the developer's local tooling on every contributor).

| Pattern | Why |
|---|---|
| `.aidlc/` | AIDLC workflow per-loop state (created when running `aidlc start` etc. in any repo) |
| `.aidlc-progress.md` | AIDLC durable progress ledger |
| `.plan.md`, `.plan-mode-review.md` | plan-mode extension's per-session artifacts |
| `.superpowers/` | superpowers sdd workspace |
| `.opencode/` | opencode plans |

If you use AIDLC (or plan-mode or superpowers) in any repo, add these
patterns to **that repo's** `.git/info/exclude` (NOT to its `.gitignore`).
The pattern syntax is identical to `.gitignore`.

Quick setup:

```bash
# Inside the repo where you run AIDLC:
EXCLUDE="$(git rev-parse --git-path info/exclude)"
mkdir -p "$(dirname "$EXCLUDE")"
cat >> "$EXCLUDE" <<'EOF'
# AIDLC + plan-mode + superpowers local artifacts (per-session, never committed)
.aidlc/
.aidlc-progress.md
.plan.md
.plan-mode-review.md
.superpowers/
.opencode/
EOF
```

This is the standard git mechanism for per-clone local exclusions
(same syntax as `.gitignore`, but git never tracks it, so other
contributors don't see it).

### Tests (extensions/aidlc-workflow/test/)

- **Use Node 24's built-in test runner** (`node --test`). No `ts-node`,
  no `jest`, no `vitest`. The `--experimental-strip-types` flag strips
  TypeScript at load.
- **One test file per module.** `classifier.test.ts` imports
  `../classifier.ts`. Tests and runtime share the same function — no
  drift possible.
- **Edge cases matter.** The classifier's `\b` boundaries don't match
  between `fail` and `i` in `failing`; the worktree code preserves `/`
  in branch names; LOG.md counts entries by `## YYYY-MM-DD` headers, not
  by file existence. Each gotcha has a regression test.
- **Behavioral scenarios (Tier 5).** The drill harness
  (`test/evals/harness.ts`) is a self-contained LLM-as-judge runner.
  Scenarios live in `test/evals/scenario-fixtures/*.md` with frontmatter
  (`name`, `setup`, `expected_behavior`, `judge_prompt`). `parseFrontmatter`
  returns `Scenario | { error: string }` and validates required fields +
  rejects unknown keys (Tier 7 schema validation).

## Safety rules

- **Never modify production files outside this repo.** `/Applications/Omi.app`,
  `/Applications/Omi Beta.app`, anything outside this repo, anything in
  `/Users/choguun/` that's not a workspace — leave alone.
- **Never push to `main` directly.** All work goes on feature branches
  + PR. The repo uses regular merge (no squash).
- **Never push or open PRs unless asked.** Commit locally by default.
  The user's standing rule.
- **Always run `npm test` before committing.** 216 AIDLC tests (or 230
  with PR #7 merged) + 62 multi-session + 65 plan-mode must pass.
  Typecheck must be clean.
- **Always preserve the loop-engineer invariants.** Don't add folders
  for things that should be kinds (`signal`, `doc`). Don't make
  `domain:` a folder. Don't skip the `## Timeline` append-only rule.
- **Don't re-clone `obra/superpowers`.** AIDLC now ships all the
  superpowers skills it uses as first-class adaptations. If the user
  has `"git:github.com/obra/superpowers"` in `~/.pi/agent/settings.json`
  `packages`, it auto-clones and conflicts on skill names — recommend
  removing it instead.

## Adding a new skill

1. Create `extensions/aidlc-workflow/skills/<name>/SKILL.md`.
2. Write the SKILL.md with frontmatter (`name`, `description`,
   optional `user_invocable`). Description MUST be ≤ 1024 chars.
3. **If the skill enforces a HARD-GATE, include a "Common
   rationalizations" section** with the anti-rationalization table
   pattern (see `skills/specify/SKILL.md`).
4. Add the directory to `extensions/aidlc-workflow/skills/`.
5. Run `bash install.sh` to symlink it.
6. Reference it from `commands.md` or the relevant phase skill if it's
   a phase skill.
7. If it has logic worth testing, add `test/<name>.test.ts` and update
   `package.json` `test` script.

## Adding a new agent

1. Create `extensions/aidlc-workflow/agents/<name>.md`.
2. Write the agent's role + when-to-use + output contract.
3. **If the agent implements a task, include `tools: read, write, edit,
   bash, aidlc` in frontmatter** (Tier 7 polish fix).
4. `bash install.sh` symlinks it automatically.

## Adding a new action to the `aidlc` tool

1. Add the case in `index.ts` `execute()` (search for `if (action ===`).
2. **Add the action to `AidlcParams.action.description`** TypeBox schema
   string (Tier 7 polish — without this, the action description won't
   appear in the LLM-callable description).
3. **If the action takes structured params, declare them in the
   TypeBox schema as `Type.Optional(Type.String(...))`** (Tier 7 polish
   removed the `params as Record<string, unknown>` cast — new params
   must be declared properly).
4. Add tests in `test/<feature>.test.ts` (use the existing `MockExtensionAPI`).
5. Document in `commands.md` so the slash-command reference stays current.

## Multi-session extension conventions

- **Three modules, one orchestrator.** Don't put I/O in `protocol.ts`
  (pure types/helpers only) or in `index.ts` (extension entry only).
  New behavior goes in `registry.ts` or `mailbox.ts`.
- **Addressing is by id prefix, name, or case-insensitive name.**
  `resolveSessionRef()` does this — never write a custom resolver in a
  tool/command.
- **Heartbeat interval is 10s, stale threshold is 30s.** Changing these
  changes the time it takes for dead sessions to be reaped; both numbers
  are constants in `protocol.ts`. Document any change in `README.md`.
- **Mailbox poll interval is 2s, override with `PI_MULTI_SESSION_POLL_MS`.**
  Tests set the env var to 100ms so the watcher is fast.
- **Self-send is forbidden.** `pi_send` rejects it; don't bypass this in
  a tool just because it's "useful" — it creates infinite loops.
- **Inbox is JSONL append-only.** Mark processed in place; don't delete
  the line. The `seenIds` set in `index.ts` prevents re-injection across
  polls. The TTL filter on `readMessages()` prevents old processed
  messages from being re-injected after a restart.

## Adding a new multi-session tool/command

1. Add the tool in `extensions/multi-session/index.ts` (use the
   `sendError`/`sendOk` helpers for pi_send-style tools, or a
   dedicated details-type interface for new tools).
2. If it needs a new message type, add it to `MessageType` in
   `protocol.ts` and route it in `deliverMessage()` in `index.ts`.
3. Add tests in `test/smoke.test.ts` (the MockExtensionAPI is reusable).
4. Document in `commands.md` (slash command) and in the tool's
   `description` (LLM-callable).

## Knowledge-base I/O

Read/write the knowledge base via `substrate.ts`, never directly:

```typescript
import { upsertSignal, readSignal, appendLogEntry, formatLogEntry } from "./substrate.ts";

// Create or update a signal (dedup by slug, atomic write)
const { signal, created } = upsertSignal(cwd, slug, {
  category: "bug",
  sources: [prUrl],
  domain: [projectName],
  classification: { phase: "implement", priority: "P1", reason: "..." },
  body: commentBody,
});

// Append to LOG.md
appendLogEntry(path.join(cwd, "LOG.md"), formatLogEntry({
  date: new Date().toISOString().slice(0, 10),
  title: "Triaged N signals",
  tags: ["signal", "aidlc"],
  what: "...",
}));
```

## Subagent-driven execution (Tier 4)

For implementation tasks, prefer `aidlc execute-task T-XXX` over inline
work. It runs a 3-phase state machine:

1. **Brief**: dispatches the `implementer` agent with a focused brief
   file (saved to `.superpowers/sdd/task-T-XXX-brief.md`).
2. **Review**: dispatches the `code-reviewer` agent against the brief
   + the diff (spec compliance + code quality).
3. **Finalize**: records the outcome in `.aidlc-progress.md`.

See `extensions/aidlc-workflow/skills/subagent-driven-development/SKILL.md`
for the full protocol. The Tier 5 drill harness
(`test/evals/harness.ts`) has 4 behavioral scenarios that verify the
protocol holds under LLM-as-judge review.

## Related

- [choguun/agent-skills](https://github.com/choguun/agent-skills) — 23
  standalone skills for the same workflow (the inspiration for many of
  the skills here)
- [obra/superpowers](https://github.com/obra/superpowers) — the
  methodology behind the 6-tier fusion (10 of 12 patterns adopted)
- [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows) —
  the canonical AIDLC spec
- [jasonzhou1993/loop-engineer-template](https://github.com/jasonzhou1993/loop-engineer-template) —
  the knowledge-base substrate model
- [pi docs](https://pi.dev/docs/latest/extensions) — extension SDK
- Real-world case study: `/Users/choguun/Documents/Obsidian Vault/Projects/Omi/`
  (the "Make Omi Fast" hackathon track that drove the design)