# signals/ — evidence

One file per **signal**: a piece of feedback from a PR comment, an
incident, or an observation worth remembering. Signals are **deduped
and frequency-counted** — when the same thing shows up again, you don't
make a new file, you add a Timeline entry to the existing one and bump
`frequency`.

This README is the schema. See `ARCHITECTURE.md` for the model.

## Frontmatter

```yaml
---
kind: signal
category: feedback | friction | bug | observation | idea   # what sort
frequency: 1                # how many times seen; increment on recurrence
sources: []                 # where it came from (PR URLs, ticket ids, etc.)
domain: []                  # which loop(s) this feeds — a list of project names
status: open | triaged | actioned | closed
phase: specify | plan | implement | test | review | ship | none   # which phase handles it
priority: P0 | P1 | P2      # severity — see classifier.ts for the rules
---
```

## Body

A short statement of the signal (what, and why it matters), then an
optional append-only `## Timeline` accumulating each sighting:

```
## Timeline
2026-06-10 | PR #123 — race condition in cache invalidation
2026-06-15 | PR #127 — same root cause, different file
2026-06-22 | PR #131 — third sighting, still broken
```

`frequency` = number of Timeline entries. Link related artifacts with
`[[slug]]`. Once `frequency: 3+`, the signal should be treated as
**P1 minimum** regardless of individual sighting priority.

## Naming

`<short-kebab-slug>.md` (e.g. `cache-race-condition.md`), or a stable
id like `SIG-<n>.md` if you prefer running numbers. The kebab-slug form
is preferred — it makes `[[links]]` readable.

## How signals are created

By the **classifier** in `classifier.ts`:

1. `/aidlc classify-comments` reads PR comments.
2. For each comment, the classifier routes it to a phase + priority.
3. If the body matches an existing signal slug (by keyword), increment
   that signal's `frequency` and append a Timeline entry.
4. Otherwise, create a new signal file with `frequency: 1`.

## How signals get closed

- `status: actioned` — the issue was fixed; link the fixing PR/commit
  in Timeline.
- `status: closed` — the issue won't be fixed (won't fix / out of scope);
  explain in Timeline.