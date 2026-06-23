# pi-extensions

Custom pi (https://pi.dev) extensions, skills, agents, and commands for the
**AI-Driven Development Life Cycle (AIDLC)** — a state-tracked, feedback-loop
workflow that goes **spec → plan → implement → test → review → ship** with
GitHub (branches + PRs + comments) as the source of truth.

## What's in here

| Folder | Symlinked to | Purpose |
|---|---|---|
| `extensions/aidlc-workflow/` | `~/.pi/agent/extensions/aidlc-workflow/` | Main extension: registers the `aidlc` tool + slash commands |
| `extensions/aidlc-workflow/agents/*.md` | `~/.pi/agent/agents/` | Specialized agents (spec-writer, planner, implementer, reviewer, etc.) |
| `extensions/aidlc-workflow/skills/*/SKILL.md` | `~/.pi/agent/skills/` | Phase-specific skills (specify, plan, implement, test, review, ship) |
| `extensions/aidlc-workflow/commands/*.md` | `~/.pi/agent/commands/` | Slash commands (`/specify`, `/plan`, `/implement`, etc.) |

## The workflow

```
   spec  →  plan  →  implement  →  test  →  review  →  ship
     │        │         │            │         │         │
   spec.md   plan.md   code       tests     PR       merge
                                     pass    comments    to
                                                            main
```

Each phase:
1. Reads the current state from `.aidlc/state.md` (local) + the PR/branch (GitHub)
2. Invokes the phase-specific skill (which has the detailed instructions)
3. Optionally dispatches a sub-agent to do the heavy lifting
4. Updates state (local + pushes to PR)
5. Returns control to the user

The **feedback loop** closes the cycle: when a PR gets review comments
or a CI failure, the next session's `/review` command reads them, classifies
them (test failure, style nit, real bug, scope creep, etc.), and routes to
the right phase (e.g. "fix the test" → re-run `/test`).

## Install

```bash
# 1. Register the extension
mkdir -p ~/.pi/agent/extensions
ln -sf "$(pwd)/extensions/aidlc-workflow" ~/.pi/agent/extensions/aidlc-workflow

# 2. Register all agents
for f in extensions/aidlc-workflow/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/agents/$(basename "$f")
done

# 3. Register all skills
for skill in extensions/aidlc-workflow/skills/*/; do
  name=$(basename "$skill")
  mkdir -p ~/.pi/agent/skills/$name
  ln -sf "$(pwd)/$skill/SKILL.md" ~/.pi/agent/skills/$name/SKILL.md
done

# 4. Register all commands
for f in extensions/aidlc-workflow/commands/*.md; do
  mkdir -p ~/.pi/agent/commands
  ln -sf "$(pwd)/$f" ~/.pi/agent/commands/$(basename "$f")
done
```

## Usage

```bash
# Start a new feature (creates branch + draft PR)
> /aidlc start "Add rate limiting to API"

# Run individual phases
> /specify
> /plan
> /implement T-001
> /test
> /review
> /ship

# Check status
> /aidlc-status
```

## State

- **Local**: `.aidlc/state.md` in the project root
- **Remote**: branch + PR (title, description, comments) on GitHub
- **Specs/plans**: `.aidlc/spec.md`, `.aidlc/plan.md` in the project root

## Source

Inspired by:
- [AWS Labs AI-DLC Workflows](https://github.com/awslabs/aidlc-workflows) — the canonical spec
- [`choguun/agent-skills`](https://github.com/choguun/agent-skills) — 23 AIDLC skills
- The [pi extension example](https://github.com/earendil-works/pi-coding-agent/tree/main/examples/extensions) — the API
- Real-world experience shipping the Omi Desktop "Make Omi Fast" track (see
  `/Users/choguun/Documents/Obsidian Vault/Projects/Omi/`)
