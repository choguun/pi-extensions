# domains/ — loops

Each subfolder is one **loop** (one project): a thread of work with a
charter, a cadence, and (optionally) metrics. A domain folder holds
its **`README.md`** (the loop's live state) and its **`state.md`**
(the phase machine). It **links** to artifacts in `signals/` and
`docs/`; it never contains them. The loop's to-dos live inline in the
README's `## Backlog`.

Don't create domains by hand — run the **`/aidlc new-loop`** skill. It
scaffolds the README from the template below and records the first run
in the domain's `## Timeline`.

This README is the schema. See `ARCHITECTURE.md` for the model.

## Domain README template

```markdown
---
kind: domain
domain: <loop-name>
status: active | paused | archived
goal: <one line — the outcome this loop drives>
cadence: <manual | daily | weekly | cron expr>
repo: <path to the project this domain drives, e.g. ../omi>
---

# <loop-name> — <short tagline>

<2-4 lines: what this loop does, what it consumes, what it produces.>

## Current focus
<The single most important thing this loop is working on right now.>

## Backlog
- [ ] <work item — link [[signal-slug]] / [[doc-slug]] if one exists>
- [ ] <next thing>

## Evidence & analysis
[[signal-slug]] · [[doc-slug]]

## Pipeline state
See `.aidlc/state.md` for the current 6-phase state (specify → plan →
implement → test → review → ship).

## Timeline
YYYY-MM-DD | <source — what happened this run>
```

A domain's `## Timeline` is its run-log: one terse dated line per run.
Rich per-run detail lives in the artifacts it links, not here.