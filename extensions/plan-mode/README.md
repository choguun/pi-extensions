# Plan Mode Extension

Claude Code / OpenCode-style plan mode for pi. Read-only exploration + parallel
explore agents + plan written to a single file + explicit `plan_enter` /
`plan_exit` tools.

## Features

- **`plan_enter` / `plan_exit` tools** — agent decides when to enter/exit plan
  mode (mirrors OpenCode's design)
- **5-phase system prompt** — explore → design → review → write plan → exit
- **Pattern-based permission ruleset** — tool + path glob + allow/deny/ask
- **Bash restricted to read-only commands** — denylist of destructive patterns
- **edit/write only on the plan file** — every other path is blocked
- **Plan file path resolution** — `<cwd>/.opencode/plans/<timestamp>-<slug>.md`
  by default, or override via `--plan-file`, or auto-detect `.aidlc/plan.md`
  when AIDLC context is active
- **Session persistence** — state survives `--resume`

## Activation

```bash
# Start in plan mode
pi --plan-mode "Add OAuth to the auth service"

# Override plan file location
pi --plan-mode --plan-file docs/feature-plan.md "..."

# In a TUI session:
/plan-mode            # toggle
/plan-enter           # enter explicitly
/plan-exit            # exit explicitly
```

The build agent can also call `plan_enter` mid-session when it decides a task
needs planning. The user is asked to confirm before the mode activates.

## How it works

### Permissions

OpenCode's pattern-based permission ruleset, ported to pi's `tool_call`
event. Default action is `"allow"`. Rules are evaluated in order; `deny`
always wins.

Default plan-mode ruleset (`PLAN_AGENT_PERMISSIONS`):

| Tool | Pattern | Action |
|---|---|---|
| `*` | — | `allow` |
| `bash` | `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `chown`, `ln`, redirects | `deny` |
| `bash` | `npm install`, `yarn add`, `pnpm add`, `pip install`, `apt install` | `deny` |
| `bash` | `git add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, `branch -d` | `deny` |
| `bash` | `sudo`, `kill`, `reboot`, `vim`, `nano`, `emacs`, `code`, `subl` | `deny` |
| `edit` / `write` | `*` | `deny` |
| `edit` / `write` | `.opencode/plans/*.md` | `allow` |
| `edit` / `write` | `.aidlc/plan.md` | `allow` |
| `plan_enter` | — | `deny` (can't enter from inside plan) |
| `plan_exit` | — | `allow` |

### Plan file path resolution

```
1. --plan-file flag          → wins always
2. .aidlc/state.md present   → <cwd>/.aidlc/plan.md (when phase ∈ {specifying, planning})
3. default                   → <cwd>/.opencode/plans/<timestamp>-<slug>.md
```

The default filename pattern matches OpenCode: `<ISO timestamp>-<slug>.md`
where `:`, `.` are replaced with `-` for filesystem safety.

### `plan_exit` flow

Mirrors OpenCode's `PlanExitTool` exactly:

1. Agent calls `plan_exit` when the plan file is complete
2. User is asked: "Plan at `<path>` is complete. Switch to build mode and
   start implementing?"
3. **Yes** → plan mode disabled, synthetic follow-up user message sent:
   `"The plan at <path> has been approved, you can now edit files.
   Execute the plan."`
4. **No** → stay in plan mode for refinement

## Tests

```bash
cd extensions/plan-mode
npm install --no-save typebox @earendil-works/pi-coding-agent @types/node typescript
npm test
```

60+ tests across:

- **`test/permissions.test.ts`** — glob matching, permission evaluation,
  default rulesets
- **`test/utils.test.ts`** — path resolution, filename formatting, AIDLC
  state detection
- **`test/smoke.test.ts`** — extension loads, tools register, tool_call
  guard enforces rules, plan_enter/plan_exit flow works

## Architecture

```
extensions/plan-mode/
├── index.ts            # The extension (entry point)
├── permissions.ts      # Pattern-based ruleset engine
├── utils.ts            # Pure helpers (path resolution, slugify, etc.)
├── agents/explore.md   # Read-only recon subagent definition
├── README.md           # This file
└── test/
    ├── permissions.test.ts
    ├── utils.test.ts
    └── smoke.test.ts
```

### Design choices

- **`permissions.ts` is a pure module** — no pi runtime, no fs I/O. Easy to
  test in isolation. Mirrors OpenCode's `Permission` data model.
- **Two tools, not one** — `plan_enter` (build → plan) and `plan_exit`
  (plan → build). The build agent decides when to enter; the user decides
  when to leave. Matches OpenCode.
- **5-phase prompt is templated** — `<PLAN_FILE_PATH>` is substituted at
  injection time. Plan file is created on disk before the prompt is injected.
- **No AIDLC auto-advance** — `plan_exit` doesn't touch `.aidlc/state.md`.
  Run `/aidlc next` after exiting plan mode if you want the AIDLC state
  machine to advance.

## Reference

- OpenCode plan mode:
  [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
  - `packages/opencode/src/agent/agent.ts` — permission ruleset per agent
  - `packages/opencode/src/tool/plan.ts` — `PlanExitTool`
  - `packages/opencode/src/agent/prompt/explore.txt` — explore prompt
- pi's existing plan-mode example:
  `packages/coding-agent/examples/extensions/plan-mode/` (Claude Code-style
  numbered list + `[DONE:n]` markers; different paradigm, kept for compatibility)

## Limitations

- **Pattern-based permissions, not path-glob permissions.** We use globs in
  the ruleset, but evaluation happens in a single linear pass. OpenCode's
  implementation has more sophisticated precedence rules (subagent
  inheritance, plugin transforms) that we don't replicate.
- **Regex-based bash allowlist is not a sandbox.** The destructive-command
  patterns use regex with `\b` word boundaries. A clever user could craft
  a command that slips through (e.g., shell variable expansion
  `r""m -rf /`, alternate path lookup via `$PATH` rewriting, or built-in
  command aliases). This is the same risk OpenCode has — for a true sandbox,
  use a container/VM (e.g., Gondolin or sandbox-runtime). For most users,
  the allowlist blocks accidental destructive commands, not a determined
  adversary.
- **No subagent isolation beyond `explore`.** OpenCode has a `general`
  subagent for multi-step parallel work. pi's `subagent` extension can fill
  this role if needed.
- **Single-plan-per-session.** Plan files are timestamped, so multiple plans
  don't collide on disk, but only one plan is "active" per session.
- **Module-level state.** The `state` object is a module-level singleton
  (pi runs one session per process, so this is fine today). If pi ever
  supports multiple concurrent sessions per process, the state will need
  to move into a per-session context.
- **No desktop / IDE integration.** TUI-only. RPC mode works for non-blocking
  tool_call guards but confirm dialogs aren't available.

## Security model

- The `--plan-file` flag value is capped at 4096 characters to prevent
  context-window bloat from a malicious or accidental giant path. Over-limit
  values fall back to the default plan-path resolution, with a TUI warning.
- `edit` and `write` are restricted to the plan file (and `.aidlc/plan.md`
  in AIDLC context). Any other write target is blocked with a TUI
  notification.
- `plan_exit` verifies the plan file exists on disk before sending the
  "approved, execute the plan" synthetic message. If the agent never wrote
  to the file, the exit is rejected and the user is notified.