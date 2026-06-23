---
kind: domain
domain: pi-extensions
status: active
goal: ship a production-grade AIDLC workflow pi extension with knowledge-base substrate
cadence: manual
repo: /Users/choguun/Documents/workspaces/cool-projects/pi-extensions
---

# pi-extensions — AIDLC workflow extension

The AIDLC (AI-Driven Development Life Cycle) pi extension: a 6-phase
pipeline (specify → plan → implement → test → review → ship) plus a
shared knowledge base (signals, docs, domains, LOG.md). Lives in
`extensions/aidlc-workflow/` and installs into `~/.pi/agent/`.

## Current focus

Run the fusion with the loop-engineer-template: adopt the
knowledge-base substrate (signals/, docs/, domains/, LOG.md), add the
new-loop / setup-codebase-harness skills, integrate the PR-comment
classifier as the signal classifier, and add worktree discipline.

## Backlog

- [ ] Wire the classifier to write signals/ on every PR comment
- [ ] Add `/aidlc new-loop` skill to scaffold new domains
- [ ] Add `setup-codebase-harness` skill (from loop-engineer)
- [ ] Add worktree discipline to `start` action (APFS clone for node_modules)
- [ ] Add tests for signal dedup + LOG.md append
- [ ] Add `verify-before-PR` gating to `/ship`

## Evidence & analysis

See `ARCHITECTURE.md` for the model.

## Pipeline state

This domain IS the extension's own knowledge base — its
`.aidlc/state.md` is the phase machine, and the 6 phases map to
extension features (specify skill, plan skill, etc.).

## Timeline

2026-06-23 | fusion kickoff — wrote ARCHITECTURE.md + scaffolded
            signals/, docs/, domains/, LOG.md; extracted classifyComment
            to classifier.ts; fixed 3 routing bugs (build-broken,
            failing-test, where-tests); added 20 classifier tests + 5
            branch tests; wired `npm test` to run typecheck + all 4
            test files. Test count: 9 → 34.