---
name: test
description: Runs the test suite and addresses failures. Use when the current AIDLC phase=testing, after implementing, or when CI is red. Verifies that all the acceptance criteria from the spec are covered.
---

<HARD-GATE>
When tests fail, invoke `systematic-debugging` before proposing fixes.
Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
</HARD-GATE>

<HARD-GATE>
The `/test` phase MUST validate TDD compliance. For each spec `## Test Plan` scenario (ST-NNN), verify ≥1 test covers it. For each production code commit, verify a test commit preceded it. Report violations explicitly.
</HARD-GATE>

## TDD Validation Steps

1. **Scenario coverage check:** grep test files for `ST-NNN` IDs from spec.md. Report: "X scenarios covered, Y missing."
2. **Commit history check:** `git log --oneline | head -20` — verify test files are committed before or with their corresponding production code.
3. **TDD violation detection:** if production files changed without test files also changed, report as TDD violation.

# Test

Run the test suite, address failures, and verify that all the spec's acceptance criteria are covered. This is the gate before review.

## When to use

- After `/implement T-XXX` finishes
- When CI is red on the PR
- When `/aidlc status` says the phase is `testing`
- Whenever the human says "run the tests" or "is the build green?"

## Inputs

- `.aidlc/spec.md` — the acceptance criteria
- `.aidlc/plan.md` — the tasks (each has a test approach)
- The test suite (project-specific)

## Output

- A green test suite
- An updated test count + coverage report (if available)
- `.aidlc/state.md` updated with test results
- If failures were found and fixed, a commit with the fixes

## Protocol

### Step 1: Run the suite

Use the project's test command (from the spec's `Commands` section):

```bash
<test command from spec>
```

If the spec doesn't have one, look at the project's `package.json`, `Makefile`, or `Cargo.toml` for the test command.

### Step 2: Categorize failures

For each failure:
- **Pre-existing** (failing before this AIDLC cycle): note in `.aidlc/state.md` notes, don't fix unless related
- **Caused by this AIDLC cycle**: fix it
- **Test is wrong** (catches a bug that doesn't exist): update the test, justify the change in the commit message

### Step 3: Fix the right ones

For each failure caused by this cycle:
- Read the failure carefully — what assertion is failing and why?
- Form a hypothesis (3-5 min max)
- If the hypothesis is "the code is wrong", fix the code
- If the hypothesis is "the test is wrong", fix the test
- If the hypothesis is "I don't know", ASK the user (don't guess)

### Step 4: Re-run

After each fix, re-run the suite. Don't batch fixes — you might fix one and break another.

### Step 5: Verify spec coverage

For each acceptance criterion in `.aidlc/spec.md`, verify there's a test that covers it. If a criterion has no test, write one (this is RED-GREEN-REFACTOR for the spec itself).

### Step 6: Update state

```markdown
- **Phase**: reviewing
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /review
- **Notes**: tests green (X tests, Y% coverage), all 8/8 spec ACs covered
```

## When to STOP and ask

- A pre-existing test is failing in a way you don't understand → ask
- A test failure suggests the spec is wrong (e.g. the spec said "X" but the test fails because the implementation is actually correct) → ask
- A test would take > 30 minutes to write from scratch → consider if the AC is too vague
- CI is failing on a service you don't control (e.g. GitHub Actions outage) → note and continue

## Common mistakes

- **Skipping the test run because "I know it works"**: no, run it. Always. The cost of a false positive is 10 seconds; the cost of a missed regression is hours.
- **"Fixing" pre-existing tests**: those are out of scope. Note them and move on.
- **Lowering coverage**: if you're tempted to delete a test to make the suite pass, that's a red flag. The test is right, the code is wrong.
- **Not checking the spec**: every AC needs a test. If the suite passes but an AC has no test, you haven't verified the spec — you've verified the test.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "Tests pass, ship it" | Did you run them fresh in this turn? `verification-before-completion` requires fresh evidence. |
| "This test is flaky" | Investigate with `systematic-debugging` before disabling. Flaky = a bug you haven't found yet. |
| "I'll add a regression test later" | TDD requires the test first. No "later" in TDD. |
| "Coverage is fine" | Coverage ≠ correctness. Run the actual verification command. |
| "The failure is in someone else's code" | Pre-existing failures are still failures. Note them, but don't pretend they're not there. |
| "I can guess why it failed" | Guess → patch → still broken. Use `systematic-debugging`. Form a hypothesis with evidence. |
| "Just rerun, it'll pass" | A test that needs a rerun to pass is broken. Find out why. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Linter passed" | Linter ≠ compiler. Run the build / test command. |
| "It worked when I tried it" | Manual testing is ad-hoc. Re-run the automated suite. |
| "Tests are slow" | Profile the slow tests. Don't skip them. |
| "I deleted the failing test" | That's deleting evidence. Fix the code, not the test. |
| "Skipping pre-existing failures" | Out-of-scope failures still ship. Note them in state.md so the human sees. |
| "I'll fix the spec, not the test" | If the AC was wrong, say so in the commit. Don't silently flip the contract. |
