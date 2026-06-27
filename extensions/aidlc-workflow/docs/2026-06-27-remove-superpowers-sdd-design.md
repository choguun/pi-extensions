---
title: Remove .superpowers/sdd/ work artifacts (Tier 3 leftovers)
type: spec
status: approved
domain: [aidlc-workflow]
---

# Remove .superpowers/sdd/ work artifacts

## Goal

Follow-up to PR #8. Remove 3 more per-task work artifacts committed during Tier 3 PR #4 — same class as the 12 `task-*.md` files we just removed. These were missed in PR #8 because they live in `.superpowers/sdd/` and `extensions/.superpowers/sdd/`, not in the repo root.

## Scope

**Remove (3 files):**
- `.superpowers/sdd/task-F8.1-brief.md`
- `.superpowers/sdd/task-F8.1-report.md`
- `extensions/.superpowers/sdd/progress.md`

**Add to .gitignore:** None — `.superpowers/` is already covered by `.git/info/exclude` (PR #9). After removing these tracked files, the local-exclude rule will fully take effect.

## Decisions

| # | Question | Answer |
|---|---|---|
| 1 | Branch name | `feat/remove-superpowers-sdd-...` (AIDLC default) |
| 2 | Combined with .gitignore changes | **A. Just remove the files** — .gitignore already has them in `.git/info/exclude` from PR #9 |

## Architecture

### Modify

- `.gitignore`: no change (`.superpowers/` already in `.git/info/exclude`)
- Remove 3 files: `.superpowers/sdd/task-F8.1-brief.md`, `.superpowers/sdd/task-F8.1-report.md`, `extensions/.superpowers/sdd/progress.md`

### Commit structure

```
Commit 1: chore: remove .superpowers/sdd/ work artifacts (Tier 3 leftovers)
```

## Why this is needed

PR #8 removed 12 `task-*.md` per-task reports from the repo root but missed 3 more in `.superpowers/sdd/` directories. Now that `.superpowers/` is in `.git/info/exclude` (PR #9), the local-exclude rule can fully take effect — but only after the tracked files are removed.

After this PR:
- `.superpowers/` is fully untracked (`.git/info/exclude` covers it)
- Same for `extensions/.superpowers/` (same rule applies)

## Timeline

2026-06-27 | spec drafted + approved — 3 .superpowers/sdd/ files removed, completing PR #8's cleanup.