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
│   └── test/                                        #  66 tests, all passing
└── README.md                                        # this file
```

### Symlinks (created by `install.sh`)

| Folder | Symlinked to | Purpose |
|---|---|---|
| `extensions/aidlc-workflow/` | `~/.pi/agent/extensions/aidlc-workflow/` | Main extension (TypeScript) |
| `extensions/aidlc-workflow/agents/*.md` | `~/.pi/agent/agents/` | 6 specialized agents |
| `extensions/aidlc-workflow/skills/*/SKILL.md` | `~/.pi/agent/skills/` | 12 phase + meta skills |
| `extensions/aidlc-workflow/commands.md` | `~/.pi/agent/skills/aidlc-commands/SKILL.md` | Standalone skill (TS-free) |

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
- Real-world experience shipping the Omi Desktop "Make Omi Fast" track (see
  `/Users/choguun/Documents/Obsidian Vault/Projects/Omi/`)