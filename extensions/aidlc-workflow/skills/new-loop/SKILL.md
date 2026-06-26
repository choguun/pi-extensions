---
name: new-loop
description: Spin up a new AIDLC loop (domain) in the knowledge base — gather its charter, scaffold domains/<loop>/README.md + .aidlc/state.md, ensure the signals/ + docs/ + LOG.md substrate exists, then do ONE real test run of the loop and record it in the loop README's Timeline and in LOG.md. Use when the user says "set up a new loop", "create a domain", "start a new beat/workstream", or names a recurring project they want the agent to own.
---

# new-loop — spin up a new AIDLC loop

A **loop** (a `domain`) is one recurring project the agent owns: a
charter, a cadence, and the artifacts it produces. This skill creates
one, proves it works with a single real run, and leaves behind a
`domains/<loop>/README.md` that is the loop's live state.

Read `ARCHITECTURE.md` first if you haven't — it's the model this
skill instantiates.

## When to use

The user wants to stand up a new project/beat/job (e.g. "a weekly SEO
loop", "a support triage loop", "the floating-bar timing project").
Don't use this for a one-off task — that's just a backlog line in an
existing domain, or a `doc`/`signal`.

## Inputs to gather (ask only what's missing)

Pull these from the user's request; ask a short clarifying round only
for what you can't infer:

1. **name** — kebab-case, the loop's home folder
   (`domains/<name>/`). Keep it short.
2. **goal** — one line: the outcome this loop drives.
3. **cadence** — `manual` / `daily` / `weekly` / a cron expr. Default
   `manual`.
4. **what it does** — what the loop consumes (signals? data? an inbox?
   a URL?) and produces (signals? docs? a report? code changes via
   `/ship`?).
5. **tools/data** — any sources or credentials it needs (note them;
   point at a setup skill or `.env` rather than inlining secrets).
6. **repo path** — absolute path to the project this domain drives.
   Default: cwd.

If the request is already specific, infer all six and just confirm in
your summary — don't ask what's already clear.

## Steps

1. **Validate the name.** Kebab-case, no spaces, no underscores. If
   the user said "floating bar timing" the name is
   `floating-bar-timing`.
2. **Scaffold the domain folder.**
   - `domains/<name>/README.md` — fill in the template from
     `domains/README.md` with the user's inputs.
   - `domains/<name>/.aidlc/state.md` — initialize the phase machine:
     ```markdown
     # AIDLC state

     - phase: not_started
     - feature: <name>
     - branch: (none yet)
     - pr: (none yet)
     - next_action: Run `/aidlc start "<goal>"`
     - last_action: (never)
     ```
3. **Ensure the substrate exists.** Verify `signals/README.md`,
   `docs/README.md`, `domains/README.md`, and `LOG.md` exist. If any
   are missing, scaffold them from the templates in this skill.
4. **Test-run the loop.**
   - `cd <repo>` (the project this domain drives).
   - Run `git status` to confirm it's a git repo.
   - Run `node --version` / `python --version` / etc. to confirm
     tooling.
   - If the project has a test suite, run a minimal smoke test
     (`npm test -- --bail` or equivalent) — just to prove the loop's
     "verify" phase is wired up.
5. **Record the first run.**
   - Append a Timeline entry to `domains/<name>/README.md`:
     ```
     YYYY-MM-DD | scaffolded + test-run — npm test passed (5 cases)
     ```
   - Append a LOG.md entry:
     ```
     ## YYYY-MM-DD · New loop: <name> · #aidlc #domain
     What: Scaffolded `domains/<name>/README.md` + `.aidlc/state.md`; smoke-tested the verify phase.
     Refs: [README.md](domains/<name>/README.md) (new).
     ```
6. **Return a summary.** Tell the user:
   - The loop's name, goal, and cadence.
   - Where to go next: `cd <repo> && /aidlc start "<first feature>"`.

## Inputs you must NOT change

- The state schema (`.aidlc/state.md` fields are owned by
  `index.ts`; if you need a new field, update `index.ts` AND
  `state-management/SKILL.md` first).
- The phase transitions (owned by `commands.md` and
  `state-management/SKILL.md`).

## Verification

After scaffolding, run:
```bash
ls -la domains/<name>/
cat domains/<name>/README.md | head -20
cat domains/<name>/.aidlc/state.md
```

If any of these fail, the scaffold is broken — fix before reporting
success.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "I'll use the existing one" | A loop you can't find isn't a loop. New domain, new folder. |
| "Loops are overhead" | A one-off task is a backlog line, not a loop. The skill name says it. |
| "I'll skip the test-run" | The test-run is the proof the loop is wired up. Skip it = lie about done. |
| "I can write the README later" | The README IS the live state. No README = no loop. |
| "The substrate probably exists" | Verify. Don't assume. Missing `signals/` or `LOG.md` = broken loop. |
| "I'll make the cadence 'whenever'" | A loop without a cadence is a backlog. Pick one (default: `manual`). |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "The name doesn't matter" | The name is the folder path. Pick a stable kebab-case one. |
| "I'll just use the AIDLC default state" | The default state says "Run /aidlc start". For a new loop, that's wrong. |
| "Smoke test is overkill" | The smoke test proves the verify phase works. One command, 10 seconds. |
| "I'll skip the LOG.md entry" | No LOG.md entry = the loop never existed. Record it. |
| "The cadence can be decided later" | Cadence is an input. If you don't have one, ask before scaffolding. |