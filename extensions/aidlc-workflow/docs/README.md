# docs/ — durable knowledge

One file per **doc**: something learned, analyzed, or decided that we
want to be findable later. If a signal is raw evidence, a doc is the
worked-through version: an analysis, a writeup, a decision and its
rationale, a how-it-works note, a gotcha discovered the hard way.

This README is the schema. See `ARCHITECTURE.md` for the model.

## Frontmatter

```yaml
---
kind: doc
domain: []                  # which loop(s) this belongs to
status: draft | adopted | superseded   # optional; use when a doc can be acted on or replaced
links: []                   # related artifacts, [[slug]] or paths
---
```

Optionally add a `type:` field (e.g. `analysis`, `decision`,
`learning`, `spec`, `post-mortem`) if you find yourself wanting to
filter docs by shape — but don't force it. Most docs are just
knowledge.

## Body

Main text = *what's true now*. Append an optional `## Timeline` for
*what happened* (revisions, supersessions, when a decision was
revisited). Link liberally with `[[slug]]`.

## Naming

`<short-kebab-slug>.md` or `<TOPIC>-<YYYY-MM>.md` — whatever reads
well and sorts sensibly.

## Examples

- `state-management.md` — how `.aidlc/state.md` works, why it's
  authoritative, how `/aidlc sync` reconciles drift
- `classifier-rules.md` — why each routing rule exists, what tests
  cover them, edge cases that bit us
- `worktree-discipline.md` — why every sub-agent gets its own worktree,
  the APFS clone optimization, the env-file carryover gotcha
- `pr-feedback-loop.md` — how PR comments become signals become routed
  work, with a worked example