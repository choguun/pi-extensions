# Task F+G Fix Report — `tester.md` Reference section

**Branch:** `feat/tier-2-superpowers-fusion-tdd-as-iron-law-f5`
**Review:** `.superpowers/sdd/task-FG-review.md`
**Fix commit:** `ddaaf91` — `fix(aidlc): Part F+G review — add \`test\` skill to tester.md Reference`
**Verifier:** `cd extensions/aidlc-workflow && npm test` → **136 pass / 0 fail / 0 skip** (1299 ms)

---

## What changed

Single file: `extensions/aidlc-workflow/agents/tester.md` (the Reference
section at the bottom). +2 / −1.

### Before

```markdown
## Reference

Invoke the **`test-driven-development`** skill for TDD discipline. The tester enforces it.
```

### After

```markdown
## Reference

- **`test-driven-development`** — TDD discipline (iron law + RED-GREEN-REFACTOR + anti-rationalization table)
- **`test`** — the `/test` skill that this agent validates against (TDD validation steps mirror `skills/test/SKILL.md` lines 12-24)
```

## Why

Review warning #1: the frontmatter `description` already claimed the
tester loads **both** the `test` skill and `test-driven-development`,
but the body's Reference section only pointed at `test-driven-development`.
The `test` skill (`extensions/aidlc-workflow/skills/test/SKILL.md`)
carries the canonical TDD Validation Steps rubric (lines 12–24:
scenario coverage check, commit history check, TDD violation detection)
that Responsibilities 2–3 directly mirror. Without this reference, the
rubric was undiscoverable from the agent file even though the agent
was supposed to enforce it.

The Reference section now mirrors the frontmatter description exactly,
so a future implementer / reviewer reading the agent spec can see both
skills it depends on.

## Review items NOT addressed here

- **Warning #2** (test #5 regex substring coupling): optional robustness
  improvement. Left for a follow-up PR per the review's own guidance
  ("the regex robustness improvement ... can land in a follow-up or stay
  as-is").
- **Suggestions** (description-length tightening, file-header note,
  bidirectional F4↔F5 cross-link): all marked "consider" in the review;
  out of scope for a one-fix task.

## Tests

- `cd extensions/aidlc-workflow && npm test` → 136 pass / 0 fail / 0 skip
- Test #8 (the symlink + target assertion from F.1 + G.1) still passes
  unchanged — no test-code drift.
- No production-code change; the existing 8 `skills-tdd` content tests
  continue to verify `tester.md`'s frontmatter shape, description length,
  and section presence (the new bullets satisfy "Reference section
  exists" without changing any test).
