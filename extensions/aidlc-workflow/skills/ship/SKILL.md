---
name: ship
description: Marks the AIDLC PR ready for review and triggers the merge. Use when the current AIDLC phase=shipping and all reviews are addressed.
---

# Ship

Make sure the AIDLC PR is actually merged to main. Don't ship a half-merged branch.

## When to use

- The current AIDLC phase is `shipping`
- The user said `/ship`
- All review comments are addressed and the test suite is green

## Inputs

- `.aidlc/state.md` → current phase, branch, PR
- `gh pr view <PR>` for status
- `git status` and `git log main..HEAD` for local state

## Output

- A merged PR
- The branch deleted
- `.aidlc/state.md` with phase=shipped

## Pre-flight checklist

Before merging, verify ALL of these:

- [ ] **CI is green**: `gh pr checks <PR>` shows all checks passing
- [ ] **No unresolved review comments**: `gh pr view <PR> --json reviewDecision` is APPROVED or REVIEW_REQUIRED
- [ ] **Working tree clean**: `git status` shows no changes
- [ ] **All commits pushed**: `git log origin/<branch>..HEAD` is empty
- [ ] **No merge conflicts**: `gh pr view <PR> --json mergeable` is MERGEABLE
- [ ] **Spec is complete**: all 8/8 (or whatever) acceptance criteria covered
- [ ] **Tests pass**: `<test command>` is green

If any check fails, **stop** and report which one. Do not proceed.

## The merge

Choose the merge strategy based on the repo's convention:
- Squash (most common for feature branches): `gh pr merge <PR> --squash --body "AIDLC: <feature> (#<PR>)"`
- Rebase: `gh pr merge <PR> --rebase`
- Merge: `gh pr merge <PR> --merge`

If unsure, look at `git log main --oneline -20` to see the recent merge commit style and follow it.

## After merge

1. Sync local main:
   ```bash
   git checkout main
   git pull
   ```

2. Delete the feature branch:
   ```bash
   git branch -d <branch>
   git push origin --delete <branch>
   ```

3. Update `.aidlc/state.md`:
   ```markdown
   - **Phase**: shipped
   - **Last action**: 2026-06-23T11:00:00Z
   - **Next action**: —
   - **Notes**: merged #<PR> to main at <sha>
   ```

4. Commit the state update: `git add .aidlc/ && git commit -m "aidlc: shipped <feature>"` (in the main branch, this becomes part of the merge commit)

5. Output: `Shipped <feature> to main via #<PR>`

## When to STOP and ask

- **CI is red**: don't merge. Even if the failures look unrelated, merge conflicts are worse than a delay.
- **Reviewer hasn't approved**: don't merge. Ask them.
- **Working tree is dirty**: don't merge. Commit or stash first.
- **Merge conflicts**: don't force-resolve without the human's input. Conflict resolution is a design decision.

## Common mistakes

- **"It's just a small fix, let me just merge it"**: no. Run the checklist. Every time.
- **Squashing when the project uses rebase**: respect the project's convention.
- **Forgetting to delete the branch**: stale branches are technical debt.
- **Not updating state.md**: the next AIDLC cycle needs to know this one shipped.
