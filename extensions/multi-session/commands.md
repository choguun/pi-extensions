---
name: multi-session-commands
description: Slash commands for the multi-session extension — /who, /sessions, /send. Use when you want to see your session identity, list other live pi sessions, or send a message to another session from the editor.
---

# Multi-Session Commands

These commands are registered by the multi-session extension. They let you
interact with other pi sessions on the same machine without leaving your
current TUI.

## /who

Show this session's identity:

- session id (short + full)
- display name
- working directory
- model + thinking level
- status (starting / idle / busy)
- pid + hostname

Other sessions use these fields to address you.

## /sessions

List all other live pi sessions. Use the picker to select one; the editor
is then pre-filled with `/send <short-id> ` so you can type the message.

A session is "live" if it has updated its heartbeat in the last 30 seconds.

## /send <ref> <message...>

Send a message to another session as a `task` (the recipient's LLM will
process it). The `<ref>` can be:

- Full session id (`019ebf2e-545b-753f-b1b4-18344f6641ec`)
- Partial session id prefix (`019ebf2e` or `019ebf2e545b753f`)
- Display name (exact or case-insensitive)

The message text is everything after the first space. If the ref is
ambiguous (matches multiple sessions), the command errors and lists the
candidates.

## When to use

- You have two pi sessions open in different terminals and want to delegate
  work between them.
- You started a long-running task in one session and want to send status
  updates from another.
- You want to coordinate a refactor across sessions working on different
  parts of the codebase.

## LLM-callable tools

The extension also exposes three tools the LLM can call:

- `pi_who` — show this session's identity
- `pi_sessions` — list other live sessions
- `pi_send` — send a message to another session

These are the same operations as the slash commands, but callable from
the agent loop. Use `pi_send` from the agent when you want it to
collaborate with another session autonomously.
