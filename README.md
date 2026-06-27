# pi-extensions

Custom [pi](https://pi.dev) extensions, skills, agents, and commands for the
**AI-Driven Development Life Cycle (AIDLC)** — a state-tracked, feedback-loop
workflow that goes **spec → plan → implement → test → review → ship** with
GitHub (branches + PRs + comments) as the source of truth, plus a
**loop-engineer knowledge-base substrate** (signals, docs, domains, LOG.md)
that compounds learnings across projects.

AIDLC has been hardened by a 6-tier [superpowers fusion](#the-superpowers-fusion)
that adopted 10 of the 12 patterns from [`obra/superpowers`](https://github.com/obra/superpowers)
— the most rigorous "complete software development methodology for coding
agents" available — turning AIDLC from a soft phase-machine into a
HARD-GATE-driven workflow with TDD-as-iron-law, subagent-driven execution,
verification gates, and anti-rationalization discipline.

## What's in here

```
pi-extensions/
├── install.sh                                       # symlink everything into ~/.pi/agent/
├── extensions/aidlc-workflow/                      # THE main extension
│   ├── index.ts                                     #   entry point (registers aidlc tool + 7 commands)
│   ├── classifier.ts                                #   PR-comment → phase + priority routing
│   ├── substrate.ts                                 #   signals/ + LOG.md I/O
│   ├── worktree.ts                                  #   worktree bootstrap + APFS-clone node_modules
│   ├── plan-format.ts                               #   superpowers writing-plans format validator (single source of truth)
│   ├── ARCHITECTURE.md                              #   the model (knowledge-base + 6-phase loop)
│   ├── LOG.md                                       #   global activity feed (one entry per ship/ingest)
│   ├── agents/                                      #   8 specialized agents
│   ├── skills/                                      #  17 skills (6 phase + 11 meta)
│   ├── signals/, docs/, domains/                    #   knowledge-base folders
│   ├── commands.md                                  #   standalone skill (works without TS extension)
│   ├── package.json                                 #   deps + npm test scripts
│   └── test/                                        #  216 tests on main (PR #7 pending: 230)
├── extensions/multi-session/                       # cross-session IPC
│   ├── index.ts                                     #   entry point (registers 3 tools + 3 commands)
│   ├── protocol.ts                                  #   message types, identity, addressing helpers
│   ├── registry.ts                                  #   process registry (heartbeat + stale prune)
│   ├── mailbox.ts                                   #   per-session JSONL message log (append + poll)
│   ├── package.json                                 #   deps + npm test scripts
│   └── test/                                        #  62 tests, all passing
├── extensions/plan-mode/                           # Claude Code-style plan mode
│   ├── index.ts                                     #   entry point (registers plan_enter/plan_exit + 3 commands)
│   ├── permissions.ts                               #   pattern-based ruleset engine (mirrors OpenCode)
│   ├── utils.ts                                     #   plan-path resolution + slug helpers
│   ├── agents/explore.md                            #   read-only recon subagent
│   ├── package.json                                 #   deps + npm test scripts
│   └── test/                                        #  65 tests, all passing
└── README.md                                        # this file
```

### Symlinks (created by `install.sh`)

| Folder | Symlinked to | Purpose |
|---|---|---|
| `extensions/aidlc-workflow/` | `~/.pi/agent/extensions/aidlc-workflow/` | Main extension (TypeScript) |
| `extensions/aidlc-workflow/agents/*.md` | `~/.pi/agent/agents/` | 8 specialized agents |
| `extensions/aidlc-workflow/skills/*/SKILL.md` | `~/.pi/agent/skills/` | 17 phase + meta skills |
| `extensions/aidlc-workflow/commands.md` | `~/.pi/agent/skills/aidlc-commands/SKILL.md` | Standalone skill (TS-free) |
| `extensions/multi-session/` | `~/.pi/agent/extensions/multi-session/` | Cross-session IPC extension |
| `extensions/plan-mode/` | `~/.pi/agent/extensions/plan-mode/` | Claude Code-style plan mode |
| `extensions/plan-mode/agents/explore.md` | `~/.pi/agent/agents/explore.md` | Read-only recon subagent |

## The 6-phase pipeline

```
   spec  →  plan  →  implement  →  test  →  review  →  ship
     │        │         │            │         │         │
   spec.md   plan.md   code       tests     PR       merge
                                     pass    comments    to
                                                            main
```

Each phase:
1. Reads state from `.aidlc/state.md` (local) + the PR/branch (GitHub)
2. Loads the phase-specific skill (`skills/specify/SKILL.md` etc.)
3. **HARD-GATEs** prevent skipping phases (added in Tier 2) — a test must
   fail before code can be written, design must be approved before
   implementation, etc.
4. Optionally dispatches a fresh sub-agent per task (Tier 4) — see
   `aidlc execute-task T-XXX`
5. Updates state (atomic write to state.md; commits + PR comments are the GitHub half)
6. Returns control to the user

## The 13 actions on the `aidlc` tool

| Action | What it does | Tier |
|---|---|---|
| `status` | Read `.aidlc/state.md`, print current phase + branch + PR + next action | 1 |
| `start` | Create a worktree + branch off the default branch + open a draft PR | 1 |
| `classify-comments` | Route each PR comment to phase + priority (read-only) | 1 |
| `triage` | Persist classified comments to `signals/` (deduped, frequency-counted) | 1 |
| `next` | Print the next action for the current phase | 1 |
| `sync` | Reconcile `.aidlc/state.md` with the actual branch/PR state | 1 |
| `verify` | Verify-before-PR gate: typecheck + test + lint | 1 |
| `validate-spec` | Enforce spec format (anti-rationalization discipline) | 2 |
| `validate-plan` | Enforce superpowers writing-plans format (single source of truth) | 2/7 |
| `validate-tdd` | Enforce TDD-as-iron-law (test must exist + fail before implementation) | 2 |
| `append-progress` | Append a task line to `.aidlc-progress.md` durable ledger | 3 |
| `read-progress` | Read the `.aidlc-progress.md` ledger across sessions | 3 |
| `execute-task` | 3-phase state machine (brief → review → finalize) for fresh-subagent-per-task | 4 |

## The 7 slash commands

```
> /aidlc start "<feature>"   # worktree + branch + draft PR
> /specify                   # write .aidlc/spec.md (HARD-GATE: validates spec format)
> /plan                      # break spec into .aidlc/plan.md tasks (HARD-GATE: validates plan format)
> /implement T-001           # one task at a time, TDD-as-iron-law (HARD-GATE: validates test-first)
> /test                      # run the test suite
> /review                    # five-axis review + read PR comments
> /ship                      # merge the PR (verify-before-PR gated)
> /aidlc-status              # print current state
```

The slash commands invoke the matching skill via `pi.sendUserMessage(directive)`
— the handler return value is discarded by pi's extension runtime, so the
directive must be sent explicitly.

## Other extensions

Two more extensions ship in this repo and install via the same `install.sh`.
They're independent of the AIDLC workflow and work in any pi project.

### Multi-session (`extensions/multi-session/`)

Lets multiple pi processes on the same machine discover each other and
exchange messages. Process registry (heartbeat + stale prune) and per-session
JSONL mailboxes live under `${agentDir}/runtime/`.

| Tool | What it does |
|---|---|
| `pi_sessions` | List other live pi sessions on this machine (id, name, cwd, model, status) |
| `pi_send` | Send a message to another session — `task` (inject as user prompt), `request` (expect reply), `notify` (just show), `steer` (interrupt mid-stream) |
| `pi_who` | Show this session's identity (id, name, cwd, model) |

Plus three slash commands: `/who`, `/sessions`, `/send`. See
`extensions/multi-session/commands.md` (auto-installed as a fallback skill).

### Plan mode (`extensions/plan-mode/`)

Claude Code / OpenCode-style plan mode: read-only exploration + a 5-phase
system prompt + a single plan file + explicit `plan_enter` / `plan_exit`
tools. Activated three ways:

- `--plan-mode` CLI flag (start in plan mode)
- `/plan-mode` slash command (toggle)
- `plan_enter` tool call (agent-initiated)

In plan mode, bash is restricted to safe read-only commands; `edit`/`write`
are only allowed on the resolved plan file. The plan file path is
`<cwd>/.opencode/plans/<timestamp>-<slug>.md` by default, overridable via
`--plan-file`, or auto-detected as `.aidlc/plan.md` when an AIDLC loop is
in the spec/planning phase.

The plan agent gets an `explore` subagent (`agents/explore.md`, read-only
recon) for parallel scouting before designing.

## The knowledge-base substrate (loop-engineer fusion)

The 6-phase pipeline is the *loop*, but the *memory* is a knowledge base
that compounds across projects:

```
extensions/aidlc-workflow/
├── ARCHITECTURE.md      the model: kinds (signal, doc), domains as loops,
│                        two-layer pages (body + ## Timeline), PR comments → signals
├── LOG.md               one-line entry per ship/ingest, all projects
├── signals/             evidence: PR comments, deduped + frequency-counted
│   ├── cache-race-condition.md     # seen in N projects, frequency: M
│   └── ...
├── docs/                durable knowledge: specs, decisions, learnings, fusion audits
│   ├── state-management.md
│   ├── classifier-rules.md
│   ├── superpowers-fusion-audit.md         # 6-tier fusion lineage
│   ├── 2026-06-26-aidlc-bootstrap-design.md
│   ├── 2026-06-26-tier-2-tdd-as-iron-law-design.md
│   ├── 2026-06-26-tier-3-polish-bundle-f8-f9-f12-design.md
│   ├── 2026-06-26-tier-4-fresh-subagent-per-task-design.md
│   ├── 2026-06-26-tier-5-writing-plans-format-behavioral-evals-design.md
│   └── plans/                                     # per-tier implementation plans
└── domains/             one folder per project (loop)
    ├── pi-extensions/
    │   ├── README.md    charter + backlog + Timeline
    │   └── .aidlc/state.md   phase machine
    └── ...
```

**Why this matters:** PR comments don't just get routed to a phase — they
become **signals** (deduped by slug, frequency-counted, cross-project).
When the same friction shows up in two projects, both surfaces share
one signal file. The agent's work compounds across runs.

See `extensions/aidlc-workflow/ARCHITECTURE.md` for the full model.

## Skills (17 total)

**Phase skills** (one per pipeline stage):
- `specify` — write `.aidlc/spec.md` from a brief (with HARD-GATE validation)
- `plan` — break spec into testable tasks (with HARD-GATE validation)
- `implement` — one task at a time, TDD-as-iron-law
- `test` — run the test suite, fix failures
- `review` — five-axis review + read PR comments
- `ship` — merge the PR (verify-before-PR gated)

**Meta skills** (loop-engineer-style):
- `aidlc-workflow` — orchestrator (the big picture)
- `state-management` — `.aidlc/state.md` schema + transitions
- `aidlc-commands` — standalone reference for all 7 slash commands (TS-free)
- `new-loop` — scaffold a new domain (`domains/<project>/`)
- `setup-codebase-harness` — make any repo agent-ready (legible / executable / verifiable)
- `signal-triage` — bridge classifier → signals/ (manual or scripted)
- `entropy-control` — periodic cleanup of stale branches/worktrees/signals

**Superpowers-fusion skills** (adopted from `obra/superpowers`):
- `test-driven-development` — TDD-as-iron-law discipline (rigid, loaded by default for any implementation)
- `verification-before-completion` — verification gate before any completion claim
- `systematic-debugging` — root-cause investigation (4 phases, "3+ fixes failed = question the architecture")
- `receiving-code-review` — anti-performative-review discipline ("no 'You're absolutely right!'")
- `finishing-a-development-branch` — 4-option finishing (merge / PR / cleanup / defer)
- `subagent-driven-development` — fresh-subagent-per-task with brief file + two-stage review

## Agents (8 total)

- `implementer` — implements one task at a time using TDD + subagent-driven-development
- `spec-writer` — drafts `.aidlc/spec.md`
- `planner` — drafts `.aidlc/plan.md` in superpowers writing-plans format
- `tester` — runs tests + systematic-debugging on failures
- `reviewer` — five-axis PR review (correctness / readability / architecture / security / performance)
- `shipper` — four-option branch finishing (merge / PR / cleanup / defer)
- `pr-feedback-handler` — processes PR comments via signals/
- `code-reviewer` — generalist reviewer (used by `aidlc execute-task` for two-stage review)

## The superpowers fusion

AIDLC was built on a soft phase-machine: the 6 phases were guidance, not
gates. **The 6-tier superpowers fusion** hardened every phase into a
discipline by adopting 10 of the 12 patterns from
[`obra/superpowers`](https://github.com/obra/superpowers) — the most
rigorous methodology for coding agents available.

| Tier | PR | Fusions | What changed |
|---|---|---|---|
| 1 | [#2](https://github.com/choguun/pi-extensions/pull/2) | F1, F2, F3, F4 | Bootstrap extension (AIDLC-mode reminders), anti-rationalization tables, `verification-before-completion` + `systematic-debugging` skills |
| 2 | [#3](https://github.com/choguun/pi-extensions/pull/3) | F5 | TDD-as-iron-law (`test-driven-development` skill + HARD-GATEs across 4 phases + 3 validation actions: `validate-spec` / `validate-plan` / `validate-tdd`) |
| 3 | [#4](https://github.com/choguun/pi-extensions/pull/4) | F8, F9, F12 | `receiving-code-review` skill (anti-performative), `finishing-a-development-branch` (4-option), `.aidlc-progress.md` durable ledger (`append-progress` / `read-progress`) |
| 4 | [#5](https://github.com/choguun/pi-extensions/pull/5) | F6 | Orchestration layer — `aidlc execute-task T-XXX` (3-phase state machine: brief → review → finalize), `subagent-driven-development` skill, `code-reviewer` agent (two-stage review) |
| 5 | [#6](https://github.com/choguun/pi-extensions/pull/6) | F7, F11 | Full superpowers `writing-plans` format (planner rewrite + `_template.md`), self-contained drill harness + 4 behavioral scenarios (execute-task-discipline, verification-before-completion, anti-performative-review, shipper-4-options) |
| 7 | [#7](https://github.com/choguun/pi-extensions/pull/7) | F12-polish | 7 deferred fixes (TypeBox schema for new params, `validate-plan` action wired + `plan-format.ts` module, `parseFrontmatter` strips `\|` + schema validation, `implementer.md` `tools:` list adds `aidlc`) |

**Deferred:** F10 (multi-harness adapters — Claude Code / OpenCode / Codex /
Cursor / Kimi) — no testable workflow in this repo. Will ship when there are
cross-harness users.

**Net effect:**
- **+5 skills** adopted (test-driven-development, verification-before-completion,
  systematic-debugging, receiving-code-review, finishing-a-development-branch,
  subagent-driven-development) — AIDLC now exposes 17 skills total
- **+2 agents** (code-reviewer for two-stage review, plus pr-feedback-handler
  was added mid-fusion for signal routing)
- **+6 aidlc tool actions** (validate-spec, validate-plan, validate-tdd,
  append-progress, read-progress, execute-task)
- **+1 module** (`plan-format.ts` — single source of truth for plan validation,
  used by both the tool and the tests)
- **+164 tests** (66 on main + 14 pending PR #7 → 230 when Tier 7 ships)
- **+1 spec doc** per tier (5 fusion tier specs + 1 polish tier spec)
- **0 regressions** — all pre-fusion tests still pass

The novelty is that AIDLC and superpowers were independently designed
methodologies that converged on the same problems. The fusion mapped
superpowers' process discipline onto AIDLC's GitHub-as-state-machine,
producing a workflow that is:

1. **State-tracked** (AIDLC's `.aidlc/state.md` + PR — survives across sessions)
2. **HARD-GATE enforced** (superpowers' iron laws — phase transitions are gated,
   not advised)
3. **Subagent-driven** (superpowers' fresh-subagent-per-task — each implementation
   task gets a focused brief and a two-stage review)
4. **Knowledge-compounding** (loop-engineer substrate — PR comments become
   frequency-counted signals across projects)

See `extensions/aidlc-workflow/docs/superpowers-fusion-audit.md` for the
full audit (12 candidates, 10 adopted, 1 deferred) and
`docs/2026-06-26-tier-N-...-design.md` per tier.

## Install

```bash
# One command, from the repo root:
bash install.sh
```

The install script:
1. Symlinks the extension directory → `~/.pi/agent/extensions/`
2. Symlinks each agent `.md` → `~/.pi/agent/agents/`
3. Symlinks each skill's `SKILL.md` → `~/.pi/agent/skills/<name>/`
4. Symlinks `commands.md` → `~/.pi/agent/skills/aidlc-commands/SKILL.md`

After install, **restart pi** to pick up the new extension.

> **Note:** If you also have `git:github.com/obra/superpowers` in your
> `~/.pi/agent/settings.json` `packages` array, remove it — AIDLC now ships
> all the superpowers skills it uses as first-class adaptations, so the
> upstream clone would conflict on skill names.

### Local artifacts in repos where you run AIDLC

AIDLC (and plan-mode, and superpowers) create per-session local
artifacts when you run them in a repo: `.aidlc/`, `.aidlc-progress.md`,
`.plan.md`, `.superpowers/`, etc. These should NEVER appear in the
repo's `.gitignore` (which ships with every PR and would impose
AIDLC's convention on every contributor). Instead, add them to the
repo's local-only `.git/info/exclude`:

```bash
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

Same syntax as `.gitignore`, but `.git/info/exclude` is git's own
data file — never tracked, never shipped, applies only to your clone.
See `AGENTS.md` "Local artifacts (not committed)" for the full
rationale.

## Develop

```bash
cd extensions/aidlc-workflow
npm install --no-save typebox     # one-time, only test dep
npm test                          # typecheck + 216 tests on main (~1s); +14 with PR #7 merged
```

```bash
cd ../multi-session
npm install --no-save typebox @earendil-works/pi-coding-agent @types/node typescript   # one-time
npm test                         # typecheck + 62 tests, ~21s
```

The extensions run TypeScript directly via Node 24's
`--experimental-strip-types` — no build step. Edits to `.ts` files
are picked up on the next restart.

## Test coverage

**AIDLC** (`extensions/aidlc-workflow/test/`) covers: extension lifecycle
(`smoke`), state parser, PR-comment classifier, branch detection, signal
substrate, worktree bootstrap + `shellQuote` injection safety, skill
symlinks, progress ledger (Tier 3), `execute-task` 3-phase machine (Tier 4),
aidlc action validation + TypeBox schema, superpowers writing-plans format
validation, behavioral drill harness + 4 scenarios (Tier 5), and the
Tier 7 polish tests.

| Suite | On main | With [PR #7](https://github.com/choguun/pi-extensions/pull/7) merged |
|---|---|---|
| AIDLC | **216** | **230** (+14 across the polish suites) |
| multi-session | 62 | 62 |
| plan-mode | 65 | 65 |
| **Total** | **343** | **357** |

Run `cd extensions/<name> && npm test` for the live count on your checkout.

## State

- **Local**: `.aidlc/state.md` in the project root
- **Remote**: branch + PR (title, description, comments) on GitHub
- **Specs/plans**: `.aidlc/spec.md`, `.aidlc/plan.md` in the project root
- **Progress ledger**: `.aidlc-progress.md` in the project root (durable across sessions)

## Source

Inspired by:
- [obra/superpowers](https://github.com/obra/superpowers) — the methodology
  behind the 6-tier fusion (10 of 12 patterns adopted)
- [AWS Labs AI-DLC Workflows](https://github.com/awslabs/aidlc-workflows) — the canonical AIDLC spec
- [`choguun/agent-skills`](https://github.com/choguun/agent-skills) — 23 AIDLC skills
- [`jasonzhou1993/loop-engineer-template`](https://github.com/jasonzhou1993/loop-engineer-template) — the knowledge-base substrate (signals/docs/domains/LOG.md), worktree discipline, `new-loop` + `setup-codebase-harness` skills
- The [pi extension example](https://github.com/earendil-works/pi-coding-agent/tree/main/examples/extensions) — the API