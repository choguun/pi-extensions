# pi-extensions

Custom [pi](https://pi.dev) extensions, skills, agents, and commands for the
**AI-Driven Development Life Cycle (AIDLC)** — a state-tracked, feedback-loop
workflow that goes **spec → plan → implement → test → review → ship** with
GitHub (branches + PRs + comments) as the source of truth, plus a
**loop-engineer knowledge-base substrate** (signals, docs, domains, LOG.md)
that compounds learnings across projects.

## What's in here

```
pi-extensions/
├── install.sh                                       # symlink everything into ~/.pi/agent/
├── extensions/aidlc-workflow/                      # THE main extension
│   ├── index.ts                                     #   entry point (registers aidlc tool + 7 commands)
│   ├── classifier.ts                                #   PR-comment → phase + priority routing
│   ├── substrate.ts                                 #   signals/ + LOG.md I/O
│   ├── worktree.ts                                  #   worktree bootstrap + APFS-clone node_modules
│   ├── ARCHITECTURE.md                              #   the model (knowledge-base + 6-phase loop)
│   ├── LOG.md                                       #   global activity feed (one entry per ship/ingest)
│   ├── agents/                                      #   6 specialized agents
│   ├── skills/                                      #  12 skills (8 phase + 4 meta)
│   ├── signals/, docs/, domains/                    #   knowledge-base folders
│   ├── commands.md                                  #   standalone skill (works without TS extension)
│   ├── package.json                                 #   deps + npm test scripts
│   └── test/                                        #  67 tests, all passing
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
| `extensions/aidlc-workflow/agents/*.md` | `~/.pi/agent/agents/` | 6 specialized agents |
| `extensions/aidlc-workflow/skills/*/SKILL.md` | `~/.pi/agent/skills/` | 12 phase + meta skills |
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
3. Optionally dispatches a sub-agent to do the heavy lifting
4. Updates state (atomic write to state.md; commits + PR comments are the GitHub half)
5. Returns control to the user

## The 7 actions on the `aidlc` tool

| Action | What it does |
|---|---|
| `status` | Read `.aidlc/state.md`, print current phase + branch + PR + next action |
| `start` | Create a worktree + branch off the default branch + open a draft PR |
| `classify-comments` | Route each PR comment to phase + priority (read-only) |
| `triage` | Persist classified comments to `signals/` (deduped, frequency-counted) |
| `next` | Print the next action for the current phase |
| `sync` | Reconcile `.aidlc/state.md` with the actual branch/PR state |
| `verify` | Verify-before-PR gate: typecheck + test + lint |

## The 7 slash commands

```
> /aidlc start "<feature>"   # worktree + branch + draft PR
> /specify                   # write .aidlc/spec.md
> /plan                      # break spec into .aidlc/plan.md tasks
> /implement T-001           # one task at a time, TDD
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
├── docs/                durable knowledge: specs, decisions, learnings
│   ├── state-management.md
│   ├── classifier-rules.md
│   └── ...
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

## Skills (12 total)

**Phase skills** (one per pipeline stage):
- `specify` — write `.aidlc/spec.md` from a brief
- `plan` — break spec into testable tasks
- `implement` — one task at a time, TDD
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

## Develop

```bash
cd extensions/aidlc-workflow
npm install --no-save typebox     # one-time, only test dep
npm test                          # typecheck + 66 tests (6 files)
```

The extension runs TypeScript directly via Node 24's
`--experimental-strip-types` — no build step. Edits to `.ts` files
are picked up on the next restart.

## Test coverage

| File | Tests | What |
|---|---|---|
| `smoke.test.ts` | 9 | extension loads, registers tool + commands, start/status/verify/triage actions work |
| `parser.test.ts` | 2 | state.md parser handles all 6 fields |
| `classifier.test.ts` | 20 | PR comment classifier routes to phase + priority (incl. review-bot digests) |
| `branch.test.ts` | 5 | `detectDefaultBranch` handles main/master/trunk/develop/gh-pages |
| `substrate.test.ts` | 18 | signal I/O, dedup, priority upgrade-only, LOG.md append |
| `worktree.test.ts` | 11 | `shellQuote` safety (injection vectors), worktree bootstrap, env carryover |

Total: **66 tests, 0 failures, typecheck clean**.

## State

- **Local**: `.aidlc/state.md` in the project root
- **Remote**: branch + PR (title, description, comments) on GitHub
- **Specs/plans**: `.aidlc/spec.md`, `.aidlc/plan.md` in the project root

## Source

Inspired by:
- [AWS Labs AI-DLC Workflows](https://github.com/awslabs/aidlc-workflows) — the canonical spec
- [`choguun/agent-skills`](https://github.com/choguun/agent-skills) — 23 AIDLC skills
- [`jasonzhou1993/loop-engineer-template`](https://github.com/jasonzhou1993/loop-engineer-template) — the knowledge-base substrate (signals/docs/domains/LOG.md), worktree discipline, `new-loop` + `setup-codebase-harness` skills
- The [pi extension example](https://github.com/earendil-works/pi-coding-agent/tree/main/examples/extensions) — the API
