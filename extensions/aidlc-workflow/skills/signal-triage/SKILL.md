---
name: signal-triage
description: Triage incoming PR comments into the signals/ knowledge base. For each comment, route it via the classifier (classifier.ts), then either create a new signal file (with frequency: 1) or update an existing signal (bump frequency, append Timeline entry). Use after running /aidlc classify-comments, when a batch of PR comments has accumulated, or as a scheduled cron to keep the signals/ pool fresh.
---

# signal-triage — turn PR comments into deduped signals

This skill is the **bridge between the classifier and the knowledge
base**. The classifier (in `classifier.ts`) already routes comments to
phase + priority. This skill takes that routing and writes it into
`signals/` as durable, frequency-counted evidence.

## When to use

- After `/aidlc classify-comments` finishes — the user wants the
  classifications persisted, not just printed.
- When a project's PR has accumulated comments that haven't been
  triaged yet (status = `open`).
- As a periodic sweep (cron or manual) to keep `signals/` fresh.

## Steps

1. **Read the source.** Get the classified comments. Either from
   `/aidlc classify-comments` output, or by running it again
   (`gh api .../comments --paginate --slurp | jq`).
2. **For each classified comment**, decide: new signal or existing?
   - **Keyword match:** extract 1-3 keywords from the comment body
     (e.g. "race condition", "cache invalidation"). Look up
     `signals/*.md` frontmatter for matching `sources` or body text.
   - **Slug match:** if a signal slug matches (e.g. comment says
     "the cache race condition" and there's a
     `signals/cache-race-condition.md`), update it.
   - **Otherwise, create new signal** with a slug from the keywords
     (kebab-case, ≤ 40 chars).
3. **Update or create:**
   - **Existing signal:** bump `frequency` (in frontmatter), append
     a Timeline entry (`YYYY-MM-DD | <PR URL> — <short description>`),
     update `phase` / `priority` if the new classification differs.
   - **New signal:** write the file from the template below with
     `frequency: 1`, the comment body as the main text, and one
     Timeline entry.
4. **Resolve phase routing.** The signal's `phase:` field tells the
   agent which phase to invoke next. If the project's current phase
   matches, the signal becomes work-in-progress; if not, the signal
   sits in `status: open` until the project loops back.
5. **Append to LOG.md.** One entry per triage batch, not per signal:
   ```
   ## YYYY-MM-DD · Triaged N signals for <project> · #signal #aidlc
   What: N comments → M new signals + K updated (frequency bumped).
   Refs: [signals/](signals/) (updated).
   ```

## New-signal template

```markdown
---
kind: signal
category: feedback      # feedback | friction | bug | observation | idea
frequency: 1
sources: [<PR URL>]
domain: [<project>]
status: open
phase: <implementing | testing | reviewing | specifying | planning | shipping>
priority: P0 | P1 | P2
---

# <slug> — <one-line title>

<Original comment body, verbatim if possible.>

## Timeline
YYYY-MM-DD | <PR URL> — first sighting
```

## Existing-signal update

```markdown
---
kind: signal
frequency: <bumped>      # was N, now N+1
status: open              # or triaged, actioned, closed
phase: <updated if changed>
priority: <updated if changed>
sources: [<appended new PR URL>]
---

# <slug> — <one-line title>

<Body unchanged.>

## Timeline
YYYY-MM-DD | <PR URL> — first sighting
YYYY-MM-DD | <PR URL> — <second sighting, same root cause>   # NEW
```

## Verification

After triaging:

```bash
ls -la signals/*.md | head -10
grep "^frequency:" signals/*.md | head -10
```

Each comment from the source should appear in exactly one signal's
Timeline. If a comment shows up in two signals, dedupe (merge the
Timeline entries into the older signal, delete the newer).

## Anti-patterns

- **Don't write a signal without sourcing it.** `sources: []` is
  useless — the agent can't trace it back. Always include the PR URL.
- **Don't make duplicate signals for the same root cause.** If two
  comments both say "the cache race condition", it's ONE signal with
  `frequency: 2`, not two signals.
- **Don't downgrade a signal's priority.** If a `P0` becomes a `P1`
  later, that's a downgrade — explain why in the Timeline, but don't
  silently lower the priority without human review.