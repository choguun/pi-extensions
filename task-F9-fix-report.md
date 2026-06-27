# Task F9 Fix Report — W3 stale `.worktrees/` heuristic in Common Mistakes

**Status:** ✅ Complete
**Branch:** `feat/tier-3-superpowers-fusion-polish-bundle-f8-f9-f12`
**Review finding addressed:** F9-W3 (from `task-F9-review.md`)
**File changed:** `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`

## Bug

The "Common Mistakes" section of the F9 skill still carried the superpowers
heuristic in its third bullet:

> **Cleaning up harness-owned worktrees**
> - **Problem:** Removing a worktree the harness created causes phantom state
> - **Fix:** Only clean up worktrees under `.worktrees/` or `worktrees/`

That path is the superpowers convention. For AIDLC users, the harness-owned
worktree path is `pi-extensions-worktrees/feat/` — already used in Step 2
detection (line 49) and Step 6 cleanup narrative (line 179) of the same skill.
The Common Mistakes bullet was inconsistent with the rest of the file and
misleading to AIDLC practitioners who would have no `.worktrees/` directories
in their repos.

## Fix

Replaced the superpowers heuristic with the AIDLC path, keeping the same
"Problem / Fix" structure:

```
**Cleaning up harness-owned worktrees**
- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees under `pi-extensions-worktrees/feat/` (the AIDLC harness convention)
```

Chose to replace rather than add a parenthetical because the entire skill is
AIDLC-specific (frontmatter description, Step 2 detection glob, Step 6
cleanup key). The parenthetical approach would have left a stale reference
that no AIDLC user would ever need.

## Verification

- `grep -nE '\.worktrees|^worktrees|/worktrees' SKILL.md` → **no matches**
- `grep -n 'worktrees' SKILL.md` → 3 matches, all AIDLC-specific:
  - line 49 — Step 2 detection glob (`*"pi-extensions-worktrees/feat/"*`)
  - line 179 — Step 6 cleanup narrative (mentions `pi-extensions-worktrees/feat/`)
  - line 226 — the fixed Common Mistakes bullet
- `npm test` in `extensions/aidlc-workflow/` → **154 passed, 0 failed** (~1.6s)

## Follow-ups not addressed here

- **F9-W1** — `task-F9-report.md` exists in the worktree as untracked.
  Left as-is; this fix report does not retire it.
- **F9-W2** — `bash install.sh` symlink verification. Not retested here;
  the symlink was created during F9.4 and the file content change is purely
  markdown text (no shell syntax affected), so reinstall behavior is
  unaffected.
- **F9-S1** — "Provenance-based" wording in Step 2 table. Suggestion only,
  not blocking.
- **F9-S2** — shipper.md trailing newline. Suggestion only, not blocking.