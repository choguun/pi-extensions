---
name: aidlc-commands
description: Slash commands for the AIDLC workflow — spec → plan → implement → test → review → ship. Each command loads a phase-specific skill. Use this when you want to drive the AIDLC workflow as standalone slash commands (without needing the TypeScript extension's `aidlc` tool).
---

# AIDLC Commands

The seven slash commands that drive an AIDLC feature from spec to merge. Each command:

1. Reads `.aidlc/state.md` to know the current phase
2. Loads the matching skill (see `skills/<name>/SKILL.md`) for the detailed workflow
3. Updates state at the end

## The commands

| Command | Skill loaded | Phase transition | When to use |
|---|---|---|---|
| `/specify` | `specify` | `*` → `specifying` | Starting a new feature; need to write the spec |
| `/plan` | `plan` | `specifying` → `planning` | Spec is done; need to break into tasks |
| `/implement T-XXX` | `implement` | `planning` → `implementing` | Implementing one task from the plan |
| `/test` | `test` | `implementing` → `testing` | Need to verify the build is green |
| `/review` | `review` | `testing` → `reviewing` (or back to `implementing` if P0s) | Need a code review before ship |
| `/ship` | `ship` | `reviewing` → `shipping` → `shipped` | All checks green; ready to merge |
| `/aidlc-status` | `aidlc-workflow` | (no transition) | Need to know the current state |

## When to use

Use these slash commands when:
- You're driving a feature through AIDLC manually (no sub-agents)
- You want fine-grained control over each phase
- The TypeScript `aidlc` tool isn't loaded but you still want the AIDLC workflow

**When NOT to use:** For trivial fixes (one-line typo), use the normal edit tools directly. The AIDLC overhead is only worth it for non-trivial work that touches multiple files.

## Comparison to the TypeScript `aidlc` tool

| | Slash commands (this file) | `aidlc` tool (index.ts) |
|---|---|---|
| Implementation | Pure markdown | TypeScript |
| Reads `.aidlc/state.md` | ✅ | ✅ |
| Reads GitHub PR | ❌ (relies on the agent) | ✅ (via `gh` CLI) |
| Classifies comments | ❌ (manual via `/review`) | ✅ (`aidlc classify-comments`) |
| Dispatches sub-agents | ❌ (manual) | ✅ (via the agent system) |
| Tool required | pi with skills loaded | pi with extension loaded |

The slash commands are a degraded-mode fallback: if the TypeScript extension can't load (missing deps, wrong Node version, etc.), you can still drive the workflow.

## The protocol

Each command follows the same protocol:
1. Read `.aidlc/state.md` (or set it to `not_started` if missing)
2. Verify GitHub state matches (branch, PR) — if not, run `gh pr view` and reconcile
3. Load the matching skill
4. Follow the skill's instructions
5. Update state at the end of the phase

The `aidlc-workflow` skill documents this in detail.

## State file

After each command, `.aidlc/state.md` is updated:
- `phase` → the new phase
- `last_action` → ISO timestamp
- `next_action` → the next command to run

This makes the workflow resumable: a new session can pick up where the last one left off by reading state.

## Examples

Starting a new feature:
```
> /aidlc start "Add rate limiting to API"
> /specify
> /plan
> /implement T-001
> /implement T-002
> /test
> /review
> /ship
```

Picking up after a break:
```
> /aidlc-status
# shows: phase=implementing, last=2026-06-23T10:00, next=Run /implement T-002
> /implement T-002
> /test
> /review
> /ship
```

Closing the feedback loop after a PR review:
```
> /review
# reads PR comments, classifies them, routes to /test or /implement
> /implement T-003 # (per the review's instructions)
> /test
> /review
> /ship
```

## Related

- `specify` skill — the spec phase
- `plan` skill — the plan phase
- `implement` skill — the implement phase
- `test` skill — the test phase
- `review` skill — the review phase
- `ship` skill — the ship phase
- `aidlc-workflow` skill — the orchestrator (state + lifecycle)
- `state-management` skill — how state is read/written/persisted
