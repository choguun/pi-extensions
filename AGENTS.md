<!--
  This is AGENTS.md — the context any AI agent reads on EVERY session in this
  repo. Keep it tight. Detail belongs in ARCHITECTURE.md, the per-skill
  SKILL.md files, or docs/. Cut anything that doesn't apply.
-->

# pi-extensions — Agent operating context

You are working in the **pi-extensions** repo. It builds pi extensions,
agents, skills, and commands that implement the **AI-Driven Development
Life Cycle (AIDLC)** — a 6-phase pipeline (spec → plan → implement →
test → review → ship) with a loop-engineer-style knowledge-base substrate.

The authoritative model lives in
[`extensions/aidlc-workflow/ARCHITECTURE.md`](extensions/aidlc-workflow/ARCHITECTURE.md).
Read it first if you haven't this session.

## What it is

- **Main extension:** `extensions/aidlc-workflow/` — TypeScript extension
  that registers the `aidlc` tool (7 actions) and 7 slash commands.
- **Multi-session extension:** `extensions/multi-session/` — lets multiple
  pi processes on the same machine discover each other and exchange
  messages. Process registry + per-session mailboxes in
  `${agentDir}/runtime/`. Exposes `pi_sessions`, `pi_send`, `pi_who`
  tools + `/who`, `/sessions`, `/send` commands.
- **Knowledge base:** same folder as AIDLC, with `signals/`, `docs/`,
  `domains/`, `LOG.md` — the loop-engineer fusion that makes work
  compound across projects.
- **Skills:** `extensions/aidlc-workflow/skills/*/SKILL.md` — 12 skills
  (6 phase + 6 meta). `extensions/multi-session/commands.md` is exposed
  as a fallback skill at install.
- **Agents:** `extensions/aidlc-workflow/agents/*.md` — 6 specialized
  agents (spec-writer, planner, implementer, reviewer, pr-feedback-handler,
  shipper).
- **Tests:** `extensions/aidlc-workflow/test/` — 66 tests. Run with
  `cd extensions/aidlc-workflow && npm test`. `extensions/multi-session/test/`
  — 62 tests. Run with `cd extensions/multi-session && npm test`.

## Repo map (1 line per directory)

| Path | What |
|---|---|
| `extensions/aidlc-workflow/` | The AIDLC workflow extension (everything lives here) |
| `extensions/aidlc-workflow/skills/` | 12 SKILL.md files (one per skill) |
| `extensions/aidlc-workflow/agents/` | 6 agent files |
| `extensions/aidlc-workflow/signals/` | Evidence pool (PR comments, deduped) |
| `extensions/aidlc-workflow/docs/` | Durable knowledge (decisions, learnings) |
| `extensions/aidlc-workflow/domains/` | One folder per project (loop) |
| `extensions/aidlc-workflow/test/` | 6 test files, 66 tests |
| `extensions/multi-session/` | Cross-session IPC extension (registry + mailboxes) |
| `extensions/multi-session/protocol.ts` | Message types, identity, addressing helpers |
| `extensions/multi-session/registry.ts` | Process registry (heartbeat, stale prune) |
| `extensions/multi-session/mailbox.ts` | Per-session message log (append, poll, mark) |
| `extensions/multi-session/test/` | 4 test files, 62 tests |
| `install.sh` | Symlinks every extension under `extensions/*` into `~/.pi/agent/` |

## Build & run

```bash
# Install (one-time, after clone) — handles every extension in extensions/*/
bash install.sh

# Run all tests (AIDLC)
cd extensions/aidlc-workflow
npm install --no-save typebox    # one-time, only test dep
npm test                         # typecheck + 66 tests, takes ~1s

# Run all tests (multi-session)
cd ../multi-session
npm install --no-save typebox @earendil-works/pi-coding-agent @types/node typescript   # one-time
npm test                         # typecheck + 62 tests, takes ~21s (uses 100ms inbox poll)
```

The extensions run TypeScript directly via Node 24's
`--experimental-strip-types` — **no build step**. Edit `.ts` files,
restart pi, the new code loads.

## Code conventions

### TypeScript (extensions/*/*.ts)

- **No in-function imports.** All imports at module top level.
- **Module split:** keep `index.ts` thin. Logic goes in
  `<name>.ts` modules. For multi-session: `protocol.ts` (types),
  `registry.ts` (process registry), `mailbox.ts` (message I/O).
- **Atomic writes.** Use the `.tmp + rename` pattern (see AIDLC
  `substrate.ts` `writeSignal` and multi-session `registry.ts`
  `writeRegistry`). A crash mid-write must not leave a half-written file.
- **POSIX shell escaping.** When embedding LLM-supplied strings in shell
  commands, use `shellQuote()` from AIDLC `worktree.ts`. Never `exec`
  raw input.
- **APFS detection.** AIDLC `worktree.ts` `detectApfs()` uses
  `stat -f%Ht /` — APFS magic = 0x4827. Fall back to `pnpm/npm install`
  on non-APFS or when lockfiles differ.
- **TypeBox enums.** Use `Type.String({ description: "..." })` with
  a description listing valid values. Don't import `StringEnum` from
  `@earendil-works/pi-ai` (transitive dep only).
- **Tool return shape.** TypeScript can't infer union types for
  `registerTool().execute()` return values when error vs success
  branches have different `details` shapes. Either: (a) declare a
  single union-friendly details type and use a helper, or (b) cast
  the return. Both AIDLC and multi-session use the helper pattern.

### Markdown (skills, docs, ARCHITECTURE, LOG)

- **Two-layer pages.** Each artifact = body + optional `## Timeline`
  (append-only, dated: `YYYY-MM-DD | source — what happened`).
- **One concept = one home.** By kind (`signal`, `doc`), not by domain.
  Cross-cutting = multi-tag + multi-link. `domain:` is a frontmatter field
  (a list), never a folder.
- **Frontmatter = anything you'd query.** Prose for everything else.
- **LOG.md grammar.** Strict: `## YYYY-MM-DD · Title · #tag1 #tag2`
  + `What:` + optional `Refs:`. One entry per ship/ingest.

### Tests (extensions/aidlc-workflow/test/)

- **Use Node 24's built-in test runner** (`node --test`). No `ts-node`,
  no `jest`, no `vitest`. The `--experimental-strip-types` flag strips
  TypeScript at load.
- **One test file per module.** `classifier.test.ts` imports
  `../classifier.ts`. Tests and runtime share the same function — no
  drift possible.
- **Edge cases matter.** The classifier's `\b` boundaries don't match
  between `fail` and `i` in `failing`; the worktree code preserves `/`
  in branch names; LOG.md counts entries by `## YYYY-MM-DD` headers, not
  by file existence. Each gotcha has a regression test.

## Safety rules

- **Never modify production files outside this repo.** `/Applications/Omi.app`,
  `/Applications/Omi Beta.app`, anything outside this repo, anything in
  `/Users/choguun/` that's not a workspace — leave alone.
- **Never push to `main` directly.** All work goes on feature branches
  + PR. The repo uses regular merge (no squash).
- **Never push or open PRs unless asked.** Commit locally by default.
  The user's standing rule.
- **Always run `npm test` before committing.** 66 tests must pass.
  Typecheck must be clean.
- **Always preserve the loop-engineer invariants.** Don't add folders
  for things that should be kinds (`signal`, `doc`). Don't make
  `domain:` a folder. Don't skip the `## Timeline` append-only rule.

## Adding a new skill

1. Create `extensions/aidlc-workflow/skills/<name>/SKILL.md`.
2. Write the SKILL.md with frontmatter (`name`, `description`,
   optional `user_invocable`).
3. Add the directory to `extensions/aidlc-workflow/skills/`.
4. Run `bash install.sh` to symlink it.
5. Reference it from `commands.md` or the relevant phase skill if it's
   a phase skill.
6. If it has logic worth testing, add `test/<name>.test.ts` and update
   `package.json` `test` script.

## Adding a new agent

1. Create `extensions/aidlc-workflow/agents/<name>.md`.
2. Write the agent's role + when-to-use + output contract.
3. `bash install.sh` symlinks it automatically.

## Adding a new action to the `aidlc` tool

1. Add the case in `index.ts` `execute()` (search for `if (action ===`).
2. Add tests in `test/smoke.test.ts` (use the existing `MockExtensionAPI`).
3. Document in `commands.md` so the slash-command reference stays current.

## Multi-session extension conventions

- **Three modules, one orchestrator.** Don't put I/O in `protocol.ts`
  (pure types/helpers only) or in `index.ts` (extension entry only).
  New behavior goes in `registry.ts` or `mailbox.ts`.
- **Addressing is by id prefix, name, or case-insensitive name.**
  `resolveSessionRef()` does this — never write a custom resolver in a
  tool/command.
- **Heartbeat interval is 10s, stale threshold is 30s.** Changing these
  changes the time it takes for dead sessions to be reaped; both numbers
  are constants in `protocol.ts`. Document any change in `README.md`.
- **Mailbox poll interval is 2s, override with `PI_MULTI_SESSION_POLL_MS`.**
  Tests set the env var to 100ms so the watcher is fast.
- **Self-send is forbidden.** `pi_send` rejects it; don't bypass this in
  a tool just because it's "useful" — it creates infinite loops.
- **Inbox is JSONL append-only.** Mark processed in place; don't delete
  the line. The `seenIds` set in `index.ts` prevents re-injection across
  polls. The TTL filter on `readMessages()` prevents old processed
  messages from being re-injected after a restart.

## Adding a new multi-session tool/command

1. Add the tool in `extensions/multi-session/index.ts` (use the
   `sendError`/`sendOk` helpers for pi_send-style tools, or a
   dedicated details-type interface for new tools).
2. If it needs a new message type, add it to `MessageType` in
   `protocol.ts` and route it in `deliverMessage()` in `index.ts`.
3. Add tests in `test/smoke.test.ts` (the MockExtensionAPI is reusable).
4. Document in `commands.md` (slash command) and in the tool's
   `description` (LLM-callable).

## Knowledge-base I/O

Read/write the knowledge base via `substrate.ts`, never directly:

```typescript
import { upsertSignal, readSignal, appendLogEntry, formatLogEntry } from "./substrate.ts";

// Create or update a signal (dedup by slug, atomic write)
const { signal, created } = upsertSignal(cwd, slug, {
  category: "bug",
  sources: [prUrl],
  domain: [projectName],
  classification: { phase: "implement", priority: "P1", reason: "..." },
  body: commentBody,
});

// Append to LOG.md
appendLogEntry(path.join(cwd, "LOG.md"), formatLogEntry({
  date: new Date().toISOString().slice(0, 10),
  title: "Triaged N signals",
  tags: ["signal", "aidlc"],
  what: "...",
}));
```

## Related

- [choguun/agent-skills](https://github.com/choguun/agent-skills) — 23
  standalone skills for the same workflow (the inspiration for many of
  the skills here)
- [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows) —
  the canonical spec
- [jasonzhou1993/loop-engineer-template](https://github.com/jasonzhou1993/loop-engineer-template) —
  the knowledge-base substrate model
- [pi docs](https://pi.dev/docs/latest/extensions) — extension SDK
- Real-world case study: `/Users/choguun/Documents/Obsidian Vault/Projects/Omi/`
  (the "Make Omi Fast" hackathon track that drove the design)