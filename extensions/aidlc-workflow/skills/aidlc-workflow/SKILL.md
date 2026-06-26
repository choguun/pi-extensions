---
name: aidlc-workflow
description: AI-Driven Development Life Cycle (AIDLC) — the orchestrator. Use when starting a new feature, when you need to know the current phase, or when you want to chain a phase into the next. Maintains state in `.aidlc/state.md` (local) + branch + PR (GitHub) so work survives across sessions and contexts.
---

# AIDLC Workflow

The AI-Driven Development Life Cycle. A six-phase pipeline that turns a brief into a merged PR, with state that survives across sessions and a feedback loop that closes on review comments.

## The pipeline

```
   specify  →  plan  →  implement  →  test  →  review  →  ship
     │         │         │            │         │         │
   spec.md   plan.md   code       tests     PR       merge
     │         │         │            │         │         │
   .aidlc/state.md tracks current phase + last/next action
```

Each phase is a separate slash command + skill + agent. They chain: after `/specify` finishes, the state is updated and `/aidlc next` will tell you to run `/plan`.

## When to use

- Starting any new feature (the human will say something like "let's build X" or "I want to add Y")
- Picking up work after a context reset (the skill reads `.aidlc/state.md` to know where you are)
- Resuming after a break or session restart
- Checking what phase you're in
- Closing the feedback loop when a PR has review comments

**When NOT to use:** Trivial fixes (one-line typo, rename) — go directly with the normal edit tools. The AIDLC overhead is only worth it for non-trivial work that touches multiple files or takes more than ~30 minutes.

## The protocol

### 1. Read state first

Before doing anything, read `.aidlc/state.md` to know:
- What phase you're in
- What branch you're on
- What PR (if any) is open
- What the last action was
- What the next action is

If `.aidlc/state.md` doesn't exist, this is a fresh project. Start with `/aidlc start "<feature>"`.

### 2. Verify against GitHub

State is in two places: local file and GitHub. They can drift. Before each phase:
- `git rev-parse --abbrev-ref HEAD` — confirm branch
- `gh pr list --head <branch> --state open` — confirm PR exists
- `gh pr view <PR> --json reviewDecision,statusCheckRollup` — confirm PR is in the expected state

If state has drifted (e.g. PR was merged but state still says `implementing`), run `/aidlc sync` to reconcile, or fix state manually if sync can't resolve it.

### 3. Check for new feedback

If a PR is open, run `/aidlc classify-comments` to see if there are unaddressed review comments. The tool will route them to the right phase (e.g. test failure → /test, real bug → /implement with the implementer agent).

### 4. Run the right phase command

`/specify` → `/plan` → `/implement T-XXX` → `/test` → `/review` → `/ship`

Each command loads its own skill (see the other files in this skill folder). The skill is the detailed how-to; this workflow.md is just the glue.

### 5. Update state at the end of each phase

Each phase ends with updating `.aidlc/state.md`:
- Set `phase` to the next phase
- Set `last_action` to the timestamp
- Set `next_action` to the command the human should run next
- Append any `notes` (e.g. "T-001 added Y, no follow-ups")

Commit the state file. The state is the chain that links sessions.

## State schema

`.aidlc/state.md` is a flat key/value document:

```markdown
# AIDLC State

- **Phase**: implementing
- **Branch**: feat/rate-limiting
- **PR**: 42
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /test
- **Notes**: T-001 done, T-002 in progress, no follow-ups

_Updated: 2026-06-23T11:00:00Z_
```

The `aidlc` tool in the TypeScript extension handles the read/parse/write. You can also edit it by hand — the format is intentionally simple.

## Spec / plan files

In addition to `state.md`, the AIDLC workflow produces:
- `.aidlc/spec.md` — the spec (from `/specify`)
- `.aidlc/plan.md` — the task list (from `/plan`)

These are checked in to git. They are the long-form context that the agents and skills load.

## The feedback loop

```
   ┌─────────────┐
   │ Human       │ ← review comments
   │ reviewer    │
   └──────┬──────┘
          │  PR comments, CI failures
          ▼
   ┌─────────────┐
   │ /review     │  ← reads + classifies
   │ classify    │
   └──────┬──────┘
          │  routes to phase
          ▼
   ┌─────────────┐
   │ /implement  │  ← implementer fixes
   │ or /test    │
   └──────┬──────┘
          │  commits
          ▼
   ┌─────────────┐
   │ PR updated  │  ← loop back to review
   └─────────────┘
```

The loop continues until `/ship` is reached and the PR is merged. If new comments come in after merge, that's a new AIDLC cycle.

## Related

- `specify` — the spec phase skill
- `plan` — the plan phase skill
- `implement` — the implement phase skill
- `test` — the test phase skill
- `review` — the review phase skill
- `ship` — the ship phase skill
- `state-management` — how state is read/written/persisted

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "This task is too small for AIDLC" | Every task goes through AIDLC. "Small" tasks are where unexamined assumptions cause the most wasted work. |
| "I'll just check state.md manually" | The state machine exists to track this for you. Re-read the spec for `/aidlc next` instead. |
| "I can skip the spec phase" | No. The spec is the contract; skipping it means rebuilding later. |
| "AIDLC overhead is too much" | AIDLC's overhead is less than the cost of rework. Time it before complaining. |
| "The phase doesn't apply" | If you can't see how a phase applies, you haven't read this skill. |
| "I'll skip /aidlc sync" | Local state and remote state drift. Sync before trusting either. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Too simple to need AIDLC" | Simple tasks break too. The discipline is fast for simple tasks. |
| "I'll catch up later" | Later never comes. Stay in the phase machine. |
| "I know the phase already" | Knowing the phase ≠ following the protocol. Read state.md. |
| "state.md is just a file" | state.md is the chain that links sessions. Lose it, lose the work. |
| "One PR doesn't need a loop" | One PR is one AIDLC cycle. The loop closes when /ship lands. |
