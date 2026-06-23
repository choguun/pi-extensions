---
name: state-management
description: How AIDLC state is read, written, and persisted across sessions. State lives in two places — local (`.aidlc/state.md`) and remote (GitHub branch + PR). The two can drift; the `aidlc` tool reconciles them.
---

# AIDLC State Management

State is the chain that links sessions. Without persistent state, every session starts from zero — re-reading the spec, re-discovering the plan, re-orienting. With persistent state, the next session knows exactly where the previous one left off.

## Where state lives

### Local

`.aidlc/state.md` in the project root. A flat key/value markdown file. The `aidlc` TypeScript tool reads and writes this file. Hand-edits are fine.

```markdown
# AIDLC State

- **Phase**: implementing
- **Branch**: feat/rate-limiting
- **PR**: 42
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /implement T-002
- **Notes**: T-001 done; no follow-ups; CI green

_Updated: 2026-06-23T11:00:00Z_
```

### Remote

- **Branch name** in git: tracks the feature (e.g. `feat/rate-limiting`)
- **PR number + title + body + comments** on GitHub: the source of truth for review feedback
- **Commits**: the audit trail of what was done

## Schema

The state has these required fields:

| Field | Type | Meaning |
|---|---|---|
| `phase` | enum | Current AIDLC phase: `not_started`, `specifying`, `planning`, `implementing`, `testing`, `reviewing`, `shipping` |
| `branch` | string or null | Current feature branch |
| `pr` | number or null | Open PR number for this branch |
| `last_action` | ISO timestamp | When the last phase finished |
| `next_action` | string | Human-readable next command (e.g. "Run /test") |
| `notes` | string | Free-form: completed tasks, follow-ups, gotchas |

Additional fields are allowed (e.g. `coverage_pct`, `review_p0_count`) but the required ones are above.

## Drift

The two state sources can drift. Common cases:
- Local says `implementing`, but the PR was merged → state is stale
- PR has new review comments, but local doesn't reflect them → check `/aidlc classify-comments`
- Working tree is dirty, but the branch is in a different state → run `git status` and reconcile

`/aidlc sync` reads git + `gh pr list` and updates `.aidlc/state.md` to match GitHub. Use it when in doubt.

## Lifecycle of state

```
START
  │
  │  /aidlc start "<feature>"
  │  → creates branch, draft PR, state.phase=specifying
  │
SPECIFY
  │  /specify
  │  → writes .aidlc/spec.md, commits, updates PR
  │  → state.phase=planning
  │
PLAN
  │  /plan
  │  → writes .aidlc/plan.md, commits
  │  → state.phase=implementing
  │
IMPLEMENT (loops per task)
  │  /implement T-001
  │  → writes code, runs tests, commits
  │  → state.phase=implementing, state.next_action="Run /implement T-002"
  │  ... continues until all tasks done ...
  │  /implement T-N (last)
  │  → state.phase=testing
  │
TEST
  │  /test
  │  → runs suite, fixes failures
  │  → state.phase=reviewing
  │
REVIEW
  │  /review
  │  → five-axis review, posts PR comment
  │  → if P0s: state.phase=implementing (back to fix)
  │  → if P1s/P2s only: state.phase=shipping
  │
SHIP
  │  /ship
  │  → verifies, merges, deletes branch
  │  → state.phase=shipped
  │
END
```

## Why state matters across sessions

Sessions are ephemeral. Models are swapped. Context windows are cleared. But state survives.

When a new session starts:
1. Read `.aidlc/state.md` — where are we?
2. Read the spec and plan — what are we building?
3. Read recent PR comments — what feedback exists?
4. Resume the work from the recorded `phase` and `next_action`

If the state file is missing, run `/aidlc start "<feature>"` to bootstrap.

## What NOT to put in state

- **Source code**: that's in git
- **Long-form spec/plan**: that's in `.aidlc/spec.md` and `.aidlc/plan.md`
- **Comments**: those are on the PR
- **Secrets**: NEVER

State is metadata about the work, not the work itself.

## What to put in state

- Current phase, branch, PR
- Last action timestamp
- Next action command
- Notable in-flight context: "T-001 done, T-002 in progress, no follow-ups"
- Pre-existing test failures that are out of scope
- Quirks specific to this work: "had to use Task.detached because the bridge was blocking the main actor"

Keep it short. State is for orientation, not documentation. Long-form goes in spec.md/plan.md.
