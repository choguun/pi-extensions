# Work log

Append-only journal of finished work bulks across **all** projects in
this knowledge base. Newest at the BOTTOM. Append an entry right
before the commit that ships a bulk of work. Keep entries SHORT:
header line + What + Refs, nothing else.

**Entry grammar** (strict, one header line per entry):

```
## YYYY-MM-DD · Short title · #tag1 #tag2
What: 1-2 lines, outcome first.
Refs: [doc](path) (new|updated), repo PR/commit links.
```

**Tags** (reuse before inventing): `#aidlc` `#state` `#classifier`
`#signal` `#doc` `#domain` `#ship` `#infra` `#workflow` `#spec`

**Retrieval recipes:**

```bash
# index of all entries (one line each)
grep '^## 20' LOG.md

# all entries about a topic
awk '/^## 20/{p=/#classifier/} p' LOG.md

# entries from a month
awk '/^## 20/{p=/^## 2026-06/} p' LOG.md
```

---

<!-- Append new entries below this line. Do not edit anything above. -->

## 2026-06-23 · Fusion kickoff: loop-engineer × AIDLC · #aidlc #arch #classifier #state
What: Adopted loop-engineer knowledge-base substrate. Wrote `ARCHITECTURE.md`, scaffolded `signals/`, `docs/`, `domains/`, `LOG.md`; extracted `classifyComment` to `classifier.ts` (shared between runtime + tests); fixed 3 routing bugs; expanded tests 9→34.
Refs: [classifier.ts](classifier.ts), [test/classifier.test.ts](test/classifier.test.ts) (new), [ARCHITECTURE.md](ARCHITECTURE.md) (new), [LOG.md](LOG.md) (new).

## 2026-06-23 · Implemented 4 deferred tasks · #aidlc #signal #worktree #verify #entropy
What: Added `entropy-control` skill (periodic cleanup); wired classifier → signals/ write (new `triage` action via substrate.ts); added worktree discipline to `start` action with APFS-clone node_modules optimization (worktree.ts); added verify-before-PR gate (new `verify` action). Test count: 40 → 66.
Refs: [substrate.ts](substrate.ts) (new), [worktree.ts](worktree.ts) (new), [skills/entropy-control/](skills/entropy-control/) (new), [test/substrate.test.ts](test/substrate.test.ts) (rewritten), [test/worktree.test.ts](test/worktree.test.ts) (new).