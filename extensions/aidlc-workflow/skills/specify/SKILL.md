---
name: specify
description: Writes the spec for an AIDLC feature. Use when the current AIDLC phase=specifying. Reads the brief from `.aidlc/state.md` notes and the PR description; produces `.aidlc/spec.md`.
---

<HARD-GATE>
Every spec MUST include `## Test Plan` with ≥1 scenario (ST-NNN). Spec-writer refuses to commit without it.
</HARD-GATE>

# Specify

Write a complete specification for the AIDLC feature. This is the foundation — every other phase (plan, implement, test, review) reads this spec as its source of truth.

## When to use

- The current AIDLC phase is `specifying`
- The user said `/specify` or equivalent
- A spec is missing or stale and a downstream phase needs to start

## Inputs

- `.aidlc/state.md` → `notes` (the brief, from the human)
- The current PR's description (which may have additional context from the human's original issue)
- The codebase (read enough to understand the project's style, structure, and existing patterns)

## Output

`.aidlc/spec.md` — a complete spec following the template below. The spec must be **complete enough that the next phase (plan) can decompose it into tasks without going back to ask the human**.

## Template

Write the spec with these six core sections, in this order. Don't skip any.

```markdown
# <Feature Name>

## Objective

One paragraph: what we're building, who the user is, and what success looks like.

## Commands

The exact shell commands to build, test, lint, run. Not just tool names — full invocations with flags.

```bash
Build: npm run build
Test: npm test -- --coverage
Lint: npm run lint --fix
Dev: npm run dev
```

## Project Structure

Where the new code will live. Path layout. Test placement. Doc placement.

```
src/                       # Application source
  feature/                 # The new feature
src/feature/__tests__/     # Feature tests
docs/                      # Documentation
```

## Code Style

One real code snippet showing the project's style. Naming conventions, formatting, type conventions. Include a "good example" and a "do NOT do this" example.

## Testing Strategy

What test framework. Unit vs integration vs e2e. Coverage target. Which test level for which concern.

## Boundaries

The three-tier rule list:
- **Always do:** (e.g. run tests before committing, follow the project's naming conventions)
- **Ask first:** (e.g. add a new dependency, change CI config, schema migrations)
- **Never do:** (e.g. commit secrets, delete failing tests without asking)

## Acceptance Criteria

5-10 numbered criteria that, if all met, mean the feature is done. These become the basis for the test plan and the review rubric.

## Out of Scope

What's NOT in this feature. Be specific — this prevents scope creep later.

## Open Questions

Anything ambiguous that the human should answer before the plan phase starts. Each question as a separate bullet, with a recommended answer.
```

## After writing

1. Commit: `git add .aidlc/ && git commit -m "spec: <feature name>"`
2. Push: `git push`
3. Update the PR description: `gh pr edit <PR> --body-file .aidlc/spec.md`
4. Update `.aidlc/state.md`:
   - `phase: planning`
   - `next_action: Run /plan to break the spec into tasks`
   - `last_action: <timestamp>`

## When Plans Reference This Spec

Plans created from this spec use the full superpowers writing-plans format (see `_template.md` at `extensions/aidlc-workflow/docs/plans/_template.md`). Each T-XXX task should reference the ST-NNN scenarios it implements (from `## Test Plan` above) and provide exact file paths + complete code per step.

## Quality bar

A spec is "done" when:
- A stranger could read it and start implementing without asking questions
- The acceptance criteria are testable (not vague like "should be fast" but specific like "p99 latency < 100ms")
- The boundaries section prevents the implementer from making decisions that should be the human's
- The "Out of Scope" section is non-empty

## Common mistakes

- **Too vague**: "Add a login feature" — what's the auth method? What providers? What does "logged in" mean? What data do we store?
- **Missing acceptance criteria**: every feature needs them. "It should work" is not an acceptance criterion.
- **Burying open questions**: put them in their own section. Don't pretend to know.
- **Skipping the boundaries**: this is where real bugs live. Be explicit about what NOT to do.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "Spec is obvious" | If it's obvious, write it down. Obvious-to-you ≠ obvious-to-the-implementer. |
| "User will iterate anyway" | Iterate on the spec, not on the implementation. Cheap up front, expensive later. |
| "Acceptance criteria are for testing, not the spec" | ACs ARE the contract. Both the implementer and reviewer read them. |
| "Out of Scope is optional" | Out of Scope prevents scope creep. Always fill it. |
| "I'll skip the boundaries" | Boundaries are where real bugs live. Always include them. |
| "Open questions can wait" | Open questions block planning. List them now, answer them early. |
| "Code style section is filler" | Code style is the one snippet the implementer imitates. Make it real. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "I'll fill the boundaries section after writing the spec" | If you didn't define boundaries while context was fresh, you'll skip it. Write boundaries inline. |
| "I can answer open questions myself" | Speculative answers become silent scope expansion. Ask the human, even when you think you know. |
| "Code style is obvious from the repo" | Future-you won't remember which file was the reference. One snippet is the citation the implementer imitates. |
| "I'll add ACs as I go" | ACs are the spec. If you find one mid-implementation, the spec was incomplete. |
| "Vague ACs are fine, the implementer will figure it out" | The implementer will guess. Wrong. Make ACs testable. |
| "Out of Scope is for v2" | Out of Scope is for THIS feature. Empty = scope creep waiting. |
| "I can write the spec in 5 minutes" | Fast spec = incomplete spec. Time the comprehensiveness. |
