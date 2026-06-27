# Task F9 Report — finishing-a-development-branch skill + shipper.md lifecycle

**Status:** ✅ Complete
**Branch:** `feat/tier-3-superpowers-fusion-polish-bundle-f8-f9-f12`
**Commit:** `4e9ddaf` — feat(aidlc): F9 — finishing-a-development-branch skill (adapted) + shipper.md lifecycle rewrite
**Tests:** 154 passed, 0 failed (npm test in `extensions/aidlc-workflow/`)
**Commits added to branch (total):** 1

## Per-sub-task summary

| ID | Task | Outcome |
|----|------|---------|
| F9.1 | Copy SKILL.md byte-identical from `~/.pi/agent/git/github.com/obra/superpowers/skills/finishing-a-development-branch/SKILL.md` | ✅ Done. SHA-256 `e6d4a812de900d33c6eacfb40747f99427f25c304a7b7099120f9373b115a47f` matches source. 241 lines copied to `extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md`. |
| F9.2 | Adapt Step 2 (Detect Environment) — add WORKTREE_PATH + IS_AIDLC_WORKTREE | ✅ Done. Added after the existing GIT_DIR/GIT_COMMON block. Pattern `*"pi-extensions-worktrees/feat/"*` sets `IS_AIDLC_WORKTREE=true` and echoes the detected path. |
| F9.3 | Adapt Step 6 (Cleanup Workspace) — gate worktree removal on IS_AIDLC_WORKTREE | ✅ Done. Replaced the generic `.worktrees/` provenance block with an `if [ "$IS_AIDLC_WORKTREE" = true ]` guard that `cd`s to main checkout, runs `git worktree remove`, then `git worktree prune`. Echoes confirmation. |
| F9.4 | Verify adaptations + run `bash install.sh` | ✅ Done. `grep -c "pi-extensions-worktrees" SKILL.md` returns **2** (line 49 detection + line 179 cleanup narrative). `bash install.sh` created symlink at `~/.pi/agent/skills/finishing-a-development-branch/SKILL.md` → worktree path. |
| F9.5 | Rewrite shipper.md to full lifecycle (5 responsibilities + Reference section + HARD-GATE) | ✅ Done. Replaced prior PR-merge-only agent with the full finishing lifecycle: verify tests → detect environment → present 4 options → execute → cleanup. References `finishing-a-development-branch`, `test`, and `verification-before-completion` skills. |

## Verification

- **Byte-identity of copy:** SHA-256 of source and copy both equal `e6d4a81…`. `diff -q` silent.
- **Adaptation pattern present:** `grep -c "pi-extensions-worktrees"` = 2 (matches at lines 49 and 179).
- **Step 2 detection code present:** `grep -n "WORKTREE_PATH\|IS_AIDLC_WORKTREE=false" SKILL.md` → Step 2 lines 47–51.
- **Step 6 guard present:** `grep -n 'if \[ "$IS_AIDLC_WORKTREE" = true \]' SKILL.md` → Step 6 lines 181–186.
- **Symlink installed:** `~/.pi/agent/skills/finishing-a-development-branch/SKILL.md` resolves to worktree SKILL.md.
- **Test suite:** `cd extensions/aidlc-workflow && npm test` → 154 tests pass, 0 fail, duration 1.4s.

## Diff stats

```
extensions/aidlc-workflow/agents/shipper.md                      | 59 +++++-------- (41 deletions, 18 insertions)
extensions/aidlc-workflow/skills/finishing-a-development-branch/SKILL.md (new file, 241 + 12 adapted lines)
2 files changed, 268 insertions(+), 41 deletions(-)
```

## Notes

- Adapted code follows the brief literally (bash `MAIN_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"` form, not `git rev-parse --show-toplevel` form). The `git -C ... --show-toplevel` form in the original SKILL.md was discarded in favor of the brief's `&& pwd` form per the brief's "Replace with:" block.
- Did not modify the "Otherwise" branch (harness-owned worktrees) or the Quick Reference / Common Mistakes / Red Flags sections — the brief did not request those changes.
- Did not modify the Step 2 prose table (GIT_DIR == GIT_COMMON vs != GIT_COMMON); only added the bash additions. The brief did not request a table rewrite.
- Step 5 (Execute Choice) is unchanged: still uses `MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)` for Option 1 and Option 4 `cd "$MAIN_ROOT"` blocks. These run *before* Step 6 cleanup, so they don't need to be tied to `IS_AIDLC_WORKTREE` — they're about merging/checkout, not removal.

## Ready for next task

F9 done. Next AIDLC task in the polish bundle is F12 (per plan). Shipper + finishing skill now provide the full lifecycle for the merge decision.