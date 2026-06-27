---
title: Tidy up repo — remove task-*.md work artifacts + gitignore plan-mode artifacts
type: spec
status: approved
domain: [aidlc-workflow]
---

# Tidy up repo — design

## Goal

Remove 12 `task-*.md` per-task report files from the repo root (committed during Tier 3 PR #4 as part of per-task subagent-driven-development documentation), and add `.gitignore` entries for other work artifacts that should never be committed.

## Scope

**Remove (12 files at repo root):**
- `task-1.1-fix-report.md`
- `task-A.2-fix-report.md`
- `task-B.1-report.md`
- `task-C.1-report.md`
- `task-D.1-report.md`
- `task-E-fix-report.md`
- `task-E-report.md`
- `task-F9-fix-report.md`
- `task-F9-report.md`
- `task-FG-fix-report.md`
- `task-H-report.md`
- `task-T-report.md`

**Add to .gitignore (5 entries):**
- `.aidlc/` — per-session AIDLC state (local only, per AGENTS.md)
- `.aidlc-progress.md` — already present
- `.plan.md` — local plan-mode plan file
- `.plan-mode-review.md` — local plan-mode review file
- `.superpowers/` — superpowers sdd workspace
- `.opencode/` — opencode plans (when local)

**Out of scope:**
- Don't change any code or tests
- Don't restructure anything else

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Commit structure | **A. Single commit** — atomic cleanup |
| 2 | Branch name | `feat/tidy-up-repo-...` (AIDLC default) |

## Architecture

### Modify

- `.gitignore` — add 5 new patterns
- Remove 12 task-*.md files

### Commit structure

```
Commit 1: chore: remove task-*.md work artifacts + gitignore plan-mode artifacts
```

## Timeline

2026-06-27 | spec drafted + approved — atomic cleanup, 12 task report files removed, 5 new gitignore entries.