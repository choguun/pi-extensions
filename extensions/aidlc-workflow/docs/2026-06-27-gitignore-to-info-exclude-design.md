---
title: Move per-developer artifacts from .gitignore to .git/info/exclude
type: spec
status: approved
domain: [aidlc-workflow]
---

# Move per-developer artifacts from .gitignore to .git/info/exclude

## Goal

Local-only artifacts (per-developer, per-session) should never appear in a repo's `.gitignore` (which ships with every PR and imposes a developer's local tooling on every contributor). They belong in `.git/info/exclude` — a git-config-style local file that's never tracked.

## Scope

**Move from `.gitignore` to `.git/info/exclude`:**
- `.aidlc/` — AIDLC workflow per-loop state
- `.aidlc-progress.md` — AIDLC durable progress ledger (already in `.gitignore` from before this work)
- `.plan.md` — plan-mode extension's local plan file
- `.plan-mode-review.md` — plan-mode extension's local review file
- `.superpowers/` — superpowers sdd workspace
- `.opencode/` — opencode plans (when local)

**Update `.gitignore` to keep only build / editor / OS / test artifacts** (universal conventions that every contributor should follow).

**Update AGENTS.md and README.md** to document that AIDLC + plan-mode + superpowers users should add these patterns to their repo's `.git/info/exclude` (or `.gitignore` if they prefer).

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Apply to all 6 patterns or just `.aidlc/` | **A. All 6** — same class of artifact, consistent |
| 2 | Where to document for AIDLC users | **AGENTS.md "Local artifacts" section + README install section** |

## Architecture

### Modify

- `.gitignore` — remove the 6 per-developer patterns; keep build/editor/OS/test patterns
- `.git/info/exclude` — add the 6 patterns (this file is local, never committed)
- `AGENTS.md` — add "Local artifacts (not committed)" section explaining `.git/info/exclude`
- `README.md` — add note in install section

### Commit structure

```
Commit 1: chore: move per-developer artifacts from .gitignore to .git/info/exclude
  - Update .gitignore (remove 6 patterns)
  - Update .git/info/exclude (add 6 patterns, never committed)
  - Update AGENTS.md (add Local artifacts section)
  - Update README.md (note in install section)
```

## Why this matters

When AIDLC runs in any repo (this one or someone else's), it creates `.aidlc/` and `.aidlc-progress.md`. These are local to the developer's pi session — not part of the project. Putting them in the project's `.gitignore` (which ships with PRs) imposes the AIDLC convention on every contributor, even those who don't use AIDLC.

`.git/info/exclude` is the standard git mechanism for per-clone local exclusions:
- Lives in `.git/info/exclude` (git's own data dir, never tracked)
- Same syntax as `.gitignore`
- Applies to the current clone only
- Other contributors / CI / new clones don't see it

Same logic for `.plan.md`, `.plan-mode-review.md` (plan-mode extension), `.superpowers/` (superpowers sdd workspace), `.opencode/` (opencode plans).

## Timeline

2026-06-27 | spec drafted + approved — 6 patterns moved from `.gitignore` (which ships) to `.git/info/exclude` (which doesn't). Documentation updated.