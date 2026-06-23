# multi-session

Let multiple pi processes on the same machine discover each other and
exchange messages. Each session is registered in a shared file with a
heartbeat; messages flow through per-session mailboxes.

This is an **extension** — drop it into `~/.pi/agent/extensions/multi-session/`
(or use `bash install.sh` from this repo) and it loads automatically.

## What you get

Once installed, every pi session on the machine:

- Registers itself in `${agentDir}/runtime/registry.json` with a heartbeat
  every 10s.
- Polls its mailbox `${agentDir}/runtime/mailbox/<sessionId>.jsonl` every
  2s (override with `PI_MULTI_SESSION_POLL_MS`).
- Exposes three LLM-callable tools: `pi_who`, `pi_sessions`, `pi_send`.
- Exposes three slash commands: `/who`, `/sessions`, `/send`.

## How sessions find each other

The registry is a single JSON file shared by all pi processes. Each
process writes its own entry keyed by `hostname:pid`. A 10s heartbeat
keeps the entry "live". If a process dies without deregistering, its
heartbeat goes stale (30s threshold) and the next registering process
prunes it.

## How messages flow

```
Session A                       Session B
   |                               |
   |  pi_send(to=B, type=task,     |
   |          text="run tests")    |
   |                               |
   |  append → mailbox/B.jsonl     |
   |                               |
   |                  (poll) ←---- |
   |                               |
   |                  inject as    |
   |                  user msg     |
   |                               |
   |                  LLM responds |
   |                               |
   |  ← (optional reply via        |
   |     pi_send type=reply)       |
```

The mailbox is persistent JSONL. Messages survive process restarts —
if session B isn't running when A sends, the message queues up and
B picks it up on startup.

## Message types

| Type     | What happens in the recipient                                    |
| -------- | ----------------------------------------------------------------- |
| `notify` | Shows a custom message in the TUI. No LLM action.                |
| `task`   | Injected as a user message, LLM processes when idle.              |
| `steer`  | Injected as a user message, interrupts mid-stream if active.     |
| `request`| Like `task` but the recipient is told to reply via `pi_send`.    |
| `reply`  | Like `task`; carries `replyTo` for sender correlation.           |
| `ack`    | Custom message confirming receipt; no LLM action.                |

## Files

- `index.ts` — Extension entry. Registers tools, commands, and event
  handlers.
- `protocol.ts` — Message types, identity, addressing helpers. Pure
  functions, no I/O.
- `registry.ts` — Process registry (`runtime/registry.json`). Atomic
  writes, heartbeat timer, stale pruning.
- `mailbox.ts` — Per-session message log (`runtime/mailbox/<id>.jsonl`).
  Append, read, mark processed, polling watcher.
- `test/` — 4 test files, ~40 tests. Run with `npm test`.

## Configuration

| Env var                      | Default       | What                                    |
| ---------------------------- | ------------- | --------------------------------------- |
| `PI_CODING_AGENT_DIR`        | `~/.pi/agent` | Where runtime/ lives.                   |
| `PI_MULTI_SESSION_POLL_MS`   | `2000`        | Mailbox poll interval.                  |

## Tests

```bash
cd extensions/multi-session
npm test
```

The test suite uses Node 24's `--experimental-strip-types` (no build
step) and `node --test` (no test runner dep). It runs against a temp
agentDir so the user's real registry is never touched.

## Related

- [pi-extensions AGENTS.md](../../AGENTS.md) — repo-level conventions
- [pi docs: extensions](https://pi.dev/docs/latest/extensions) — full
  Extension API
- [pi docs: session format](https://pi.dev/docs/latest/session-format) —
  how `SessionManager` exposes the session id
