---
title: AIDLC knowledge-base architecture
type: decision
status: adopted
---

# AIDLC knowledge-base architecture

How the **AIDLC Workflow** extension organizes itself as a long-lived,
compounding loop engineer — borrowed from the
[loop-engineer-template](https://github.com/jasonzhou1993/loop-engineer-template)
and adapted for PR-driven, slash-command-driven work.

## The model (v1 — deliberately minimal)

Three ideas only:

1. **The 6-phase pipeline is a loop, not a one-shot.** Every project runs
   `specify → plan → implement → test → review → ship` and then back to
   `specify` for the next feature. The state machine is a phase schema,
   not a state file that ends.
2. **Each project is a `domain` (loop) with its own README/charter** that
   holds the project's *live state* — current focus, backlog, links to
   signals and docs, and a `## Timeline` of every run.
3. **PR comments are `signals`** — evidence that feeds the loop. They get
   deduped, frequency-counted, and routed to the right phase via the
   classifier. Cross-project signals accumulate in a global `signals/`
   pool so a friction the support loop logs can get picked up by the
   product loop.

### Kinds (start with just these two)

| kind | what it is | folder | key frontmatter |
|---|---|---|---|
| `signal` | evidence: PR comment, reviewer feedback, incident (deduped, frequency-counted) | `signals/` | `category, frequency, sources[], domain[], status, phase, priority` |
| `doc` | durable knowledge: a spec, a decision, a learning, a how-it-works note | `docs/` | `domain[], status?, links` |

Add a `task` kind only when a project's backlog outgrows its README.
Add a `metric` kind only when you have a numeric time-series.

### Domains (loops)

A domain is one **loop**: a thread of work with its own charter, cadence,
and (optionally) metrics. A domain folder holds its **`README.md`** +
its **state file** (`.aidlc/state.md`) + links to its artifacts. The
README is the live state; the state file is the phase machine.

```
domains/<project>/
├── README.md        # charter, current focus, backlog, timeline, links
└── .aidlc/
    ├── state.md     # phase machine (specifying|planning|implementing|...)
    ├── spec.md      # current spec (written in specifying phase)
    ├── plan.md      # task list (written in planning phase)
    └── reviews/     # per-PR review notes
```

### The 6-phase pipeline (a loop, not a one-shot)

```
specify → plan → implement → test → review → ship
   ↑                                            |
   └────────────────────────────────────────────┘
              (next feature, or pivot)
```

Each phase is a slash command + a skill + an agent:

| phase | slash command | skill | agent | role |
|-------|---------------|-------|-------|------|
| specify | `/specify <feature>` | `specify/SKILL.md` | `spec-writer.md` | write `.aidlc/spec.md` from a brief |
| plan | `/plan` | `plan/SKILL.md` | `planner.md` | break spec into testable tasks (`.aidlc/plan.md`) |
| implement | `/implement T-XXX` | `implement/SKILL.md` | `implementer.md` | one task at a time, TDD |
| test | `/test` | `test/SKILL.md` | (run tests) | typecheck + unit + e2e |
| review | `/review` | `review/SKILL.md` | `reviewer.md` | five-axis review + read PR comments |
| ship | `/ship` | `ship/SKILL.md` | `shipper.md` | merge the PR (verify-before-PR gate) |

**`aidlc-status`** is a meta-command: read state, print the current
phase + branch + PR + next action.

### State lives in two places (and they're reconciled)

1. **Local** — `.aidlc/state.md` in the project root. Fast reads.
2. **Remote** — branch + PR (title, description, comments) on GitHub.
   Feedback source (reviewers write comments; `classify-comments` reads
   them).

Drift reconciled by `/aidlc sync`: read both, write the union back to
state.md. Conflicts are resolved in favor of state.md (the human's
source of truth).

### Body convention — two layers (borrowed from loop-engineer)

Each artifact (signal, doc, domain README, state.md) = a normal **main
body** + an optional appended **`## Timeline`** (append-only, dated:
`YYYY-MM-DD | source — what happened`). *"What's true now"* = body;
*"what happened"* = Timeline. This gives every artifact its own
history, absorbs daily logs, and lets a `signal` accumulate evidence
(frequency = Timeline entries).

Example for `signals/FB-001.md`:
```markdown
---
kind: signal
category: feedback
frequency: 3
sources: [https://github.com/owner/repo/pull/123#issuecomment-1, ...]
domain: [my-project]
status: triaged
phase: implement
priority: P1
---

# Race condition in cache invalidation

A reviewer flagged this in PR #123. The cache TTL races with the
invalidation callback, so stale entries can survive a refresh.

## Timeline
2026-06-10 | PR #123 comment — first sighting
2026-06-15 | PR #127 comment — second sighting, same root cause
2026-06-22 | PR #131 comment — third sighting, still broken
```

After three sightings, `frequency: 3` and the team should treat this as
P1.

### Logs & data

- **`LOG.md`** (global, in `~/.pi/agent/aidlc-memory/LOG.md` or
  per-project) — global activity feed: one line per ship/ingest. Detail
  lives in each artifact's `## Timeline`.
- **`signals/`** — the feedback pool. Dedup by slug; bump `frequency`
  on recurrence; never make duplicates.
- **No separate `daily`/`journal` kind.** A domain's run-log is its
  README's `## Timeline`; a signal's history is its own `## Timeline`.

### The PR-comment classifier (the core of the feedback loop)

The classifier lives in `classifier.ts` and routes each comment to a
phase + priority. Rules in order — first match wins:

1. **Review-bot digests** (`**N issue found**` headers from cubic-dev-ai,
   coderabbit, etc.) — keyword-match inside the digest.
2. **Build/test failure** — "the build is broken", "test failing", etc.
3. **Missing test/coverage** — "where are the tests?", "missing
   coverage".
4. **Real bug** — race, leak, crash, null pointer.
5. **Security** — CVE, injection, XSS.
6. **Spec/requirements** — out of scope, scope creep.
7. **Design/refactor** — abstraction, coupling.
8. **Style nit** — typo, doc, naming.
9. **Fallback** — needs human review.

The classifier is shared between runtime (`index.ts`) and tests
(`test/classifier.test.ts`) — they import the same function so they
can't drift.

### Compounding via shared signals (the novelty)

The killer feature loop-engineer adds that AIDLC lacked: **signals
flow across domains**. If the Omi project and the AI-DLC project both
hit "race condition in cache invalidation", they should share one
signal file (deduped by slug), and any project's triage should be able
to reference it.

```
~/.pi/agent/aidlc-memory/
├── LOG.md                          # cross-project activity feed
├── ARCHITECTURE.md                  # this file
├── signals/
│   ├── cache-race-condition.md     # seen in 3 projects, frequency: 7
│   ├── floating-bar-timing.md      # seen in 1 project, frequency: 2
│   └── ...
├── docs/
│   ├── state-management.md         # how state.md works
│   ├── classifier-rules.md         # why each rule exists
│   └── ...
└── domains/                        # one folder per project
    ├── omi-floating-bar/
    │   ├── README.md
    │   └── .aidlc/state.md
    ├── pi-extensions/
    │   ├── README.md
    │   └── .aidlc/state.md
    └── ...
```

When a PR comment hits the classifier, it doesn't just route to a phase
— it also creates-or-updates a signal file. When a project's phase
advances, it appends to that domain's README Timeline AND to the
global LOG.md.

### Worktree discipline (borrowed from loop-engineer)

Each sub-agent code session gets its own worktree so parallel agents
don't collide. The orchestrator owns the main checkout; workers
own worktrees.

For Node projects, use **APFS clone** to copy `node_modules` from the
main checkout into the worktree (copy-on-write, near-instant, no
extra disk). Fall back to `pnpm install --prefer-offline` if APFS clone
fails. For non-Node projects, set `depsWarmed: 'none'` and let later
stages install on demand.

The `start` action creates the worktree as part of feature bootstrap:

```typescript
// instead of `git checkout -b feat/foo main`:
const worktree = `../${repoName}-worktrees/feat-${slug}`;
git(`worktree add ${worktree} -b feat/${slug} ${defaultBranch}`);
```

The agent then `cd`s into the worktree, copies gitignored env files,
warms dependencies, and works there. Never modifies the main checkout.

### Rules (DRY + MECE)

1. **One concept = one home** (by kind). Everything else links via
   `[[slug]]`.
2. **`domain:` is a field (list), not a folder.** Cross-cutting =
   multi-tag + multi-link.
3. **Collectors write data; agents write knowledge.** Don't pay an LLM
   to fetch numbers.
4. **Frontmatter = anything you'd query.** Prose for everything else.
5. **PR comments → signals (deduped, frequency-counted).** Never make
   duplicates; always route to a phase.

---

## Deferred — add only when the need is real (do NOT pre-build)

| Later | Trigger to add it |
|---|---|
| `task` kind | a project's backlog outgrows its README |
| `metric` kind + jsonl | a numeric time-series starts being collected |
| derived index (sqlite / vector) | retrieval volume outgrows ripgrep (~10⁴⁺ artifacts) |
| cron / webhook trigger | first non-manual automation (e.g. nightly PR-comment sweep) |
| reconcile / consolidation daemon | autonomous volume creates dupes / contradictions |
| autonomy / guardrails / budget formalization | agents act without human review |

The substrate extends to all of these without a rebuild — markdown
stays the system of record; you layer a cache/daemon on top.

---

## Map (where things live)

| I want to… | Go to |
|---|---|
| see where a project is in the pipeline | `<project>/.aidlc/state.md` |
| read a project's charter / backlog | `<project>/README.md` |
| see PR comments that need routing | `signals/` (deduped) |
| read a durable piece of knowledge | `docs/` |
| see why we chose something | `docs/` (a decision) |
| see the cross-project activity feed | `LOG.md` |
| spin up a new project/loop | run `/aidlc new-loop` |
| make a repo agent-ready | run `setup-codebase-harness` |
| prove a feature works before shipping | run `/pr` (verify-before-PR) |