---
name: review
description: Reviews the AIDLC PR across five axes (correctness, readability, architecture, security, performance). Use when the current AIDLC phase=reviewing. Posts the review as a PR comment.
---

# Review

Senior-engineer code review across five axes. The output is a PR comment that closes the feedback loop.

## When to use

- The current AIDLC phase is `reviewing`
- The user said `/review`
- After the test suite is green and the user wants a sanity check before shipping

## Inputs

- `gh pr view <PR>` — title, body, reviewDecision
- `gh pr diff <PR>` — the diff
- `.aidlc/spec.md` — does the code match the spec?
- `.aidlc/plan.md` — are all tasks done?

## Output

- A review report posted as a PR comment (`gh pr comment <PR> --body-file review-report.md`)
- Updated `.aidlc/state.md` with review summary

## The five-axis review

### 1. Correctness

Does the code do what the spec/plan says it should?

- Edge cases (null, empty, boundary values)
- Error paths (not just the happy path)
- Race conditions, off-by-one errors
- The tests actually verify the behavior (not just that they pass)
- The acceptance criteria from the spec are all covered

### 2. Readability & Simplicity

Can another engineer understand this without the author explaining?

- Names descriptive and consistent
- Control flow straightforward
- Dead code (unused vars, backwards-compat shims, `// removed` comments)
- Abstractions earning their complexity (don't generalize until the 3rd use case)
- Nested ternaries, deep callbacks
- A new conditional bolted onto an unrelated flow → push the logic into its own helper

### 3. Architecture

Does the change fit the system's design?

- Existing patterns followed, or new ones justified
- Module boundaries maintained
- Dependencies flowing in the right direction (no cycles)
- Appropriate abstraction level
- Refactor reduces complexity, not just relocates it
- Feature-specific logic not leaking into shared modules
- Type boundaries explicit (no gratuitous `any`/optional/casts)

### 4. Security

Does the change introduce vulnerabilities?

- Input validation
- Secrets in code/logs/git
- Auth/authz checks
- Parameterized SQL
- Output encoding (XSS)
- Dependencies from trusted sources
- External data treated as untrusted at boundaries
- See `security-and-hardening` skill for details

### 5. Performance

Is the change fast enough?

- Algorithmic complexity (O(n²) where O(n) suffices)
- N+1 queries
- Unnecessary allocations
- Missing indexes
- See `performance-optimization` skill for details

## Severity

- **P0**: blocks ship. Bug, security hole, test failure, missing acceptance criterion.
- **P1**: blocks ship. Style, naming, missing test for non-obvious behavior.
- **P2**: advisory. Doc nit, comment improvement, optional refactor.

The approval standard: **approve a change when it definitely improves overall code health, even if it isn't perfect**. Don't block because it isn't exactly how you would have written it. (Lifted from Google's eng-prractice.)

## Output format

```markdown
## Files Reviewed
- `path/to/file.ts` (lines X-Y, +N -M lines)

## Critical (must fix)
- `file.ts:42` - <issue>. Suggested fix.

## Warnings (should fix)
- `file.ts:100` - <issue>. Suggested fix.

## Suggestions (consider)
- `file.ts:150` - <idea>. Rationale.

## Pre-existing issues exposed
- `file.ts:200` - <issue that was here before this diff, but the diff interacts with it>.

## Summary
<2-3 sentences. Approve / request changes / approve with comments.>

## Tests
- [✓/✗] Tests added for new code paths
- [✓/✗] Tests cover edge cases
- [✓/✗] Tests follow existing patterns
```

## After reviewing

1. Write the report to a file: `review-report.md`
2. Post as PR comment: `gh pr comment <PR> --body-file review-report.md`
3. Update `.aidlc/state.md` with the summary and finding counts
4. If P0s are found, update the state to `implementing` (so the implementer can address them)
5. If only P1s/P2s, update to `shipping` (so the shipper can proceed)

## Common mistakes

- **Skipping the architecture axis**: most reviews miss it. The code might be correct and readable but the abstraction is wrong.
- **Approving too easily**: "looks good to me" is not a review. Run all five axes.
- **Being too harsh**: P2s are advisory. Don't block ship on style nits.
- **Not posting the review**: the report is the deliverable. Posting a summary on the PR closes the feedback loop.
- **Not updating state**: the next phase needs to know the review is done.
