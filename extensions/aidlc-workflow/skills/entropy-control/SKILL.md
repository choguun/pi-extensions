---
name: entropy-control
description: Periodic cleanup of accumulated entropy in the repo — stale branches, stale worktrees, dead code, drifted docs. Use as a weekly cron, after a sprint ends, or when the repo "feels heavy" (slow git, lots of unmerged branches, AGENTS.md out of sync with reality). Honest output: report what was deleted, what was kept, what couldn't be cleaned automatically (with reason).
---

# entropy-control — keep the repo from rotting

Every few weeks a repo accumulates:

- **Stale branches** — `feat/foo` from a closed sprint, never merged.
- **Stale worktrees** — `git worktree list` shows entries for branches
  the agent forgot to clean up. Leftover worktrees pin their branch
  (you can't delete it).
- **Dead code** — unused exports, TODOs older than 6 months,
  commented-out blocks that survived three refactors.
- **Drifted docs** — `AGENTS.md` says the test command is `npm test` but
  `package.json` doesn't have a `test` script. The build command in
  the docs doesn't match the Makefile. The repo map in the agent
  doc doesn't list a new top-level dir.
- **Stale signals** — `signals/` has files with `status: open` and
  `frequency: 1` from 90 days ago, never re-touched.
- **Stale domains** — `domains/<old-project>/README.md` referencing a
  repo path that no longer exists.

The fix isn't "try harder" — it's a periodic, structured sweep that
deletes what's safe and reports what isn't.

## When to use

- **Weekly** (manual or cron): one full sweep.
- **After a sprint ends**: when the work shifts, the old branches
  should die.
- **When the repo "feels heavy"**: `git status` is slow, `git branch
  --list` is overwhelming, the agent keeps making wrong assumptions.

## Steps

### 1. Branches

List branches older than 30 days, not merged into the default branch:

```bash
git fetch origin --prune
git branch --list --no-color 'feat/*' 'fix/*' 'chore/*' 'docs/*' \
  | grep -v '^\*' \
  | xargs -I {} sh -c 'git merge-base --is-ancestor {} origin/main && echo MERGED {} || echo UNMERGED {}' \
  | grep '^MERGED ' \
  | awk '{print $2}' \
  | xargs -I {} git branch -D {}
```

**Safe to auto-delete:** merged branches older than 30 days.
**Keep:** unmerged branches (might still be WIP).
**Report:** the unmerged ones — the user can decide.

### 2. Worktrees

A leftover worktree pins its branch (you can't delete a checked-out
branch). Always clean up:

```bash
git worktree list
# For each entry beyond the main checkout:
git worktree remove <path> --force
# For each branch that's now orphaned (no worktree, no remote, no commit-on-main):
git branch -D <branch>
```

**Report:** worktrees that couldn't be removed (locked, dirty
working tree). The user fixes manually.

### 3. Dead code (best-effort, low confidence)

Tools that catch unused code (don't run these blindly — false
positives are common):

- **Node:** `npx ts-prune` (TS), `npx depcheck` (unused deps).
- **Python:** `vulture`, `flake8 --select F401` (unused imports).
- **Go:** `staticcheck -checks all` (U1000 unused).
- **Rust:** `cargo +nightly udeps`.
- **Swift:** No good tool. Manually grep for `private func` /
  `private var` references.

Stale TODOs:

```bash
# TODOs older than 6 months
git log --all --pretty=format: --name-only --diff-filter=A \
  | grep -E '\.(ts|tsx|swift|py|go|rs)$' \
  | sort -u \
  | xargs grep -Hn 'TODO' 2>/dev/null \
  | head -50
```

**Report:** the list. Don't auto-delete — TODOs are too context-
dependent.

### 4. Drifted docs

For each `AGENTS.md` / `CLAUDE.md` / `README.md`, verify the build
commands still match reality:

```bash
# Read the agent doc
grep -E '^(npm|swift|python|cargo|make) ' AGENTS.md 2>/dev/null \
  | grep -v '<!--' \
  | while read -r cmd; do
      # Check the command actually exists in package.json / Makefile / etc.
      echo "Checking: $cmd"
    done
```

Heuristic: extract every line starting with a command verb (`npm`,
`swift`, `python`, `cargo`, `make`, `git`, `gh`, `cd`, `test`, `build`),
then for each one, check if the tool can run it. If `npm test` is in
the doc but `package.json` has no `test` script, that's drift.

**Report:** drifted commands. The user updates the doc.

### 5. Stale signals

```bash
# Signals with status: open and last touched >90 days ago
for sig in signals/*.md; do
  if grep -q '^status: open' "$sig"; then
    last=$(git log -1 --format='%ai' -- "$sig" 2>/dev/null || echo "never")
    age_days=$(( ($(date +%s) - $(date -j -f '%Y-%m-%d' "${last:0:10}" +%s 2>/dev/null || date +%s)) / 86400 ))
    if [ "$age_days" -gt 90 ]; then
      echo "STALE $sig ($age_days days)"
    fi
  fi
done
```

**Auto-close** signals with frequency 1 and no PR linked (won't fix —
not worth chasing). **Keep open** signals with frequency 2+ (real
friction). **Report** the rest.

### 6. Stale domains

```bash
for domain in domains/*/; do
  name=$(basename "$domain")
  # Read the `repo:` frontmatter field
  repo=$(awk '/^repo:/{print $2; exit}' "$domain/README.md")
  if [ -n "$repo" ] && [ ! -d "$repo" ]; then
    echo "ORPHANED $name → $repo (path doesn't exist)"
  fi
done
```

**Report:** orphaned domains. The user decides whether to archive
the domain (`status: archived`) or fix the path.

## Output

A summary table:

```
## entropy-control sweep — YYYY-MM-DD

| Category | Auto-fixed | Reported | Notes |
|----------|-----------|----------|-------|
| Branches | 3 deleted | 1 unmerged | feat/old-feature |
| Worktrees | 0 | 1 stuck | dirty: ../pi-extensions-worktrees/fix-foo |
| Dead code | 0 | 12 candidates | ts-prune: 8 unused exports; TODO >6mo: 4 |
| Drifted docs | 0 | 2 commands | npm test (no script); swift test (no Package.swift) |
| Stale signals | 1 closed (frequency:1, no PR) | 3 still open (frequency:2+) | |
| Orphaned domains | 0 | 0 | |

Total: 4 items fixed, 17 items reported.
```

Append to `LOG.md`:

```
## YYYY-MM-DD · entropy-control sweep · #entropy #aidlc
What: N branches deleted, M worktrees reported, P drift items reported.
Refs: (this skill run — no PR).
```

## Safety rules

1. **Never force-delete unmerged branches.** The user might still want
   the WIP. Report, don't delete.
2. **Never `git worktree remove --force` on a worktree that contains
   uncommitted changes** unless the user has confirmed. Use
   `git worktree remove` (no `--force`) first — it refuses if there
   are local changes.
3. **Never delete `main` / `master` / `develop`.** Add an explicit
   denylist.
4. **Never delete a signal with `frequency: 2+`.** Multiple sightings
   means real friction. Keep it open.
5. **Never modify `AGENTS.md` / `CLAUDE.md` automatically.** Just
   report drift; the user edits.

## Cron-friendliness

If invoked as a cron (no human in the loop), default behavior:
- Run the safe auto-fixes (1, 2 with --force only on locked worktrees,
  5 for frequency-1-no-PR signals).
- Skip the report-only steps (3, 4, 6).
- Always print the summary so the cron log captures it.
- Always append to `LOG.md`.

If invoked manually (human present), run everything and produce the
full report.