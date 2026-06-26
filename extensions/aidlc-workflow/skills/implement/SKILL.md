---
name: implement
description: Implements a single task from the AIDLC plan using TDD. Use when the current AIDLC phase=implementing and the user invoked `/implement T-XXX`. One task at a time.
---

<HARD-GATE>
When a bug is found during implementation, invoke `systematic-debugging`
before patching. Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
</HARD-GATE>

# Implement

Take ONE task from `.aidlc/plan.md` and implement it using TDD. **One task per session** — never bundle.

## When to use

- The current AIDLC phase is `implementing`
- The user said `/implement T-XXX` (where T-XXX is a task ID)
- The plan has been written and committed

## Inputs

- `.aidlc/plan.md` — find task T-XXX
- `.aidlc/spec.md` — for context on the broader feature
- The codebase — for the project's conventions

## Output

- The code (committed, tested)
- Updated `.aidlc/plan.md` (T-XXX marked done with completion note)
- Updated `.aidlc/state.md` (incremented task counter, set next action)

## The TDD cycle

```
    RED                GREEN              REFACTOR
 Write a test    Write minimal code    Clean up the
 that fails  ──→  to make it pass  ──→  implementation
```

### Step 1: RED

Write a failing test. It MUST fail. A test that passes immediately proves nothing.

```swift
// RED: this test fails because makeSlug doesn't exist yet
func testMakeSlug() {
    XCTAssertEqual(makeSlug("Hello World"), "hello-world")
}
```

### Step 2: GREEN

Write the minimum code to make the test pass. Don't over-engineer:

```swift
// GREEN: minimal implementation
func makeSlug(_ s: String) -> String {
    return s.lowercased().replacingOccurrences(of: " ", with: "-")
}
```

### Step 3: REFACTOR

Clean up while keeping tests green. Now is the time to:
- Extract helpers
- Rename for clarity
- Consolidate duplicated code
- Add type annotations

### Step 4: COMMIT

Per cycle. `git add -A && git commit -m "T-XXX: <what changed>"`. Don't accumulate work — each commit is a save point.

## Per-cycle commit pattern

```
T-001: Add makeSlug function with test
T-001: Add slugify URL routing
T-001: Add slug uniqueness check
```

3 commits for T-001. Each is a coherent save point. The next agent (or future you) can `git log T-001` to see exactly what happened.

## Test approach by layer

| Task type | Test layer | Speed |
|---|---|---|
| Pure function | Unit | < 100ms |
| API endpoint | Integration | 100-500ms |
| UI component | Snapshot + interaction | 200ms-2s |
| Full user flow | E2E | 1-10s |

Pick the **fastest test that proves the behavior**. Don't reach for E2E when a unit test will do.

## When to stop and ask

- The task requires a new dependency → ask the user
- The task requires a schema migration → ask the user
- The task requires changing the API surface that other code depends on → ask the user
- The pre-existing test suite is broken before you start → note it, continue if unrelated, ask if related
- You're not sure what the right behavior is → re-read the spec, then ask

## Per-task commit

After the task is complete and tests are green:

```bash
git add -A
git commit -m "implement T-XXX: <short description>

- What you added
- What you changed
- What you left for later (follow-ups)"
git push
```

Update the plan:
```markdown
### T-001: <Title>
- [x] AC1
- [x] AC2
- [x] AC3
- **Done**: <commit sha>
- **Notes**: <anything worth knowing later>
```

Update state:
```markdown
- **Phase**: implementing
- **Last action**: 2026-06-23T11:00:00Z
- **Next action**: Run /implement T-002
- **Notes**: T-001 done
```

## Common mistakes

- **Skipping RED**: "I'll write the test and the code at the same time" → no, write the test first, watch it fail, THEN write the code
- **Implementing more than the task**: scope creep is the #1 cause of bad PRs
- **Bigger commits**: 1 commit per TDD cycle. Not 1 commit per task. Not 1 commit per day.
- **Not running the existing test suite**: you might break something. Always run before declaring done.
- **Not pushing**: if the work isn't pushed, it doesn't exist for the next phase

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "I'll write the test after" | That's not TDD. Invoke `test-driven-development` skill. Iron law: NO PRODUCTION CODE WITHOUT FAILING TEST FIRST. Tests-after prove nothing — you never saw them catch the bug. |
| "This is too simple for TDD" | Simple code breaks. Test takes 30 seconds. |
| "I'm just exploring" | Fine. Throw away the exploration, start with TDD. |
| "The existing code has no tests" | You're improving it. Add tests as you go. |
| "The bug is obvious, I'll just patch" | Obvious-to-you ≠ root-caused. Use `systematic-debugging` — 5 min saves 5 hours. |
| "I'll bundle two tasks in one commit" | One task per session, one commit per TDD cycle. Bundling hides failures. |
| "Manual smoke is enough" | Manual smoke proves one run. Tests prove every run. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "TDD will slow me down" | TDD is faster than debugging after. Pragmatic = test-first. |
| "Need to explore first" | OK — throw away the exploration, start with TDD. |
| "Manual test is faster" | Manual doesn't prove edge cases. Re-run every change. |
| "The task is just one line" | One line still has a test. The commit doesn't get to skip RED. |
| "I'll fix the bug, then add the test" | Reverse order. Test reproduces the bug first. |
| "I'll skip the failing pre-existing test" | Note it. Don't silently bypass. The next phase needs to know. |
