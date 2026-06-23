# AIDLC Workflow Extension

The AI-Driven Development Life Cycle (AIDLC) as a pi extension. State-tracked, feedback-loop workflow that goes **spec → plan → implement → test → review → ship** with GitHub (branches + PRs + comments) as the source of truth.

## What's in this extension

| Path | What | Symlinked to |
|---|---|---|
| `index.ts` | The extension entry point. Registers the `aidlc` tool (status, start, classify-comments, sync, next) and 7 slash commands. | `~/.pi/agent/extensions/aidlc-workflow/index.ts` (and the parent symlink) |
| `agents/*.md` | 6 agents: `spec-writer`, `planner`, `implementer`, `reviewer`, `pr-feedback-handler`, `shipper`. | `~/.pi/agent/agents/` |
| `skills/*/SKILL.md` | 8 skills: the orchestrator + one per phase + state-management. | `~/.pi/agent/skills/` |
| `commands/*.md` | Slash command templates: `/specify`, `/plan`, `/implement`, `/test`, `/review`, `/ship`, `/aidlc-status`. | (registered via `index.ts` — see below) |

## How commands are registered

The `index.ts` calls `pi.registerCommand(name, { description, handler })` for each phase. The handler emits a directive message that hints the user to invoke the corresponding skill (which is auto-loaded based on its description). The actual phase logic lives in the skill + agent.

This split exists because:
- The skill is pure markdown — easy to read, edit, and share
- The TypeScript extension handles the imperative glue: read state, call `gh`, parse PR comments, dispatch agents

## Why state lives in two places

| Place | What's stored | Survives |
|---|---|---|
| `.aidlc/state.md` (local) | Phase, branch, PR, last/next action, notes | Across sessions in the same worktree |
| Branch + PR (GitHub) | Commits, diff, review comments, CI status | Across forks, machines, and humans |

They can drift. `/aidlc sync` reconciles them. The skill `state-management` documents the schema.

## The feedback loop

```
   ┌─────────────┐
   │ Human       │ ← review comments on the PR
   │ reviewer    │
   └──────┬──────┘
          │  /aidlc classify-comments
          ▼
   ┌─────────────┐
   │ aidlc tool  │  ← reads comments via gh, classifies
   │ (index.ts)  │     P0/P1/P2 + phase (test|implement|specify|...)
   └──────┬──────┘
          │  routes to phase
          ▼
   ┌─────────────┐
   │ <phase>     │  ← dispatches the matching agent
   │ skill       │     (e.g. implementer fixes the bug)
   └──────┬──────┘
          │  commit + push
          ▼
   ┌─────────────┐
   │ PR updated  │  ← loop back to review
   └─────────────┘
```

The loop continues until `/ship` merges to main.

## Usage

```
> /aidlc start "Add rate limiting to API"
> /specify
> /plan
> /implement T-001
> /test
> /review
> /ship
```

Each command reads the state, loads the matching skill, and either dispatches the agent or does the work itself.

## Install

Run from the repo root:

```bash
ln -sf "$(pwd)/extensions/aidlc-workflow" ~/.pi/agent/extensions/aidlc-workflow

for f in extensions/aidlc-workflow/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/agents/$(basename "$f")
done

for skill in extensions/aidlc-workflow/skills/*/; do
  name=$(basename "$skill")
  mkdir -p ~/.pi/agent/skills/$name
  ln -sf "$(pwd)/$skill/SKILL.md" ~/.pi/agent/skills/$name/SKILL.md
done
```

(The top-level README in this repo has the full install script with the commands symlink too.)

## Tested against

The pattern is informed by the Omi Desktop "Make Omi Fast" hackathon track (June 2026). See `/Users/choguun/Documents/Obsidian Vault/Projects/Omi/` for the case study where this workflow would have helped — particularly the `Upstream Overlap Discovery` doc, which shows the cost of duplicating work that was already on main.

## Related

- [choguun/agent-skills](https://github.com/choguun/agent-skills) — 23 individual skills for the same workflow
- [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows) — the canonical spec
- [pi docs](https://pi.dev/docs/latest/extensions) — extension SDK
