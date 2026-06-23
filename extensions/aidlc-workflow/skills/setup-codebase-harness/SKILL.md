---
name: setup-codebase-harness
description: Master skill — set up the full agent harness for any repo so an agent can work it reliably. The repo must be legible (map-not-manual docs + custom lints), executable (one-command dev stack), verifiable (e2e gate + a verify-before-ship loop), plus commit hygiene and entropy control. Use when onboarding a new/unfamiliar codebase to agent-driven development — "set up the harness", "make this repo agent-ready", "harness this codebase".
user_invocable: true
---

# Set up the codebase harness

**Harness engineering:** the model is fixed — what you engineer is
the *scaffolding* around it (the environment, the docs, the feedback
loops) so an agent can build and verify software with minimal human
attention. Humans steer; agents execute. Your job is to make the repo
**legible, executable, and verifiable.**

Work **incrementally and depth-first**: assess what exists, build the
one missing capability, use it to unlock the next. Don't boil the
ocean — set up what the repo actually needs. When the agent struggles,
the fix is almost never "try harder" — ask *"what capability is
missing, and how do I make it legible and enforceable?"* and add it.

This skill orchestrates the focused sub-skills: **`dev-local-setup`**,
**`e2e-setup`**, **`pr`**.

## 0. Assess

Before doing anything, read the repo's existing scaffolding. Many of
these already exist; respect what's there.

```bash
cd <repo>
ls -la
cat README.md 2>/dev/null | head -30
cat AGENTS.md 2>/dev/null | head -30       # Omi/cool-projects convention
cat CLAUDE.md 2>/dev/null | head -30       # loop-engineer convention
cat package.json 2>/dev/null | head -30    # Node
cat pyproject.toml 2>/dev/null | head -30  # Python
cat Package.swift 2>/dev/null | head -30   # Swift
```

Then answer, in one paragraph:

- What language/toolchain? (Node/Python/Swift/Go/Rust/...)
- What's the build command? (npm run build / swift build / make / ...)
- What's the test command? (npm test / pytest / swift test / ...)
- Is there a linter? (eslint / ruff / swiftlint / ...)
- Is there a worktree-safe dev launcher? (does `npm run dev` work
  from any directory?)
- What credentials/env vars does the app need? (database URLs, API
  keys, OAuth)

**Don't** guess. Read the actual files.

## 1. Make it legible

An agent needs to find things fast. If the repo has a giant
`README.md`, write a `MAP.md` at the root with a 1-line summary of
each top-level directory and the key entry points. Keep it ≤ 100 lines.

If the repo has no `AGENTS.md` / `CLAUDE.md`, write one. The Omi
convention is `AGENTS.md` (see `/Users/choguun/Documents/workspaces/
cool-projects/omi/AGENTS.md` for a battle-tested template). The
loop-engineer convention is `CLAUDE.md`. Either is fine — pick one
per repo and stick to it.

The agent-facing doc MUST include:

- Build/test/lint commands (exact commands, not "use the test
  suite").
- Repo map (1 line per top-level dir).
- Safety rules (what NOT to touch — production apps, secrets, etc.).
- Pre-commit hook install (formatting enforced by CI).
- Git worktree discipline (each sub-agent gets its own worktree).

## 2. Make it executable

One command should bring up the dev stack. If the repo already has one
(`./run.sh`, `npm run dev`, `make dev`), great — just document it in
`AGENTS.md` / `CLAUDE.md`. If not, write a `dev-local-setup` skill
that does it.

Common patterns:

- **Node:** `npm install && npm run dev`
- **Python:** `python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" && uvicorn app:app --reload`
- **Swift:** `swift build && swift run`
- **Rust:** `cargo build && cargo run`

The dev launcher should:

- Detect existing dependencies and skip re-install if present
- Carry over gitignored env files (`.env`, `.env.local`, etc.)
- Print a clear "ready" message with the URL/port

## 3. Make it verifiable

A verify-before-PR loop is the difference between "agent writes code
that might work" and "agent writes code that's proven to work". The
loop is:

1. Agent writes the change in a worktree.
2. Agent runs the project's fast check (typecheck + lint + tests on
   the changed files).
3. A **fresh verifier sub-agent** drives the real app (not just unit
   tests) to confirm the feature works end-to-end.
4. Only after both checks pass does the agent open a PR.

The Omi convention for the desktop app:
`/Users/choguun/Documents/workspaces/cool-projects/omi/desktop/e2e/SKILL.md`
(bundle-id + named bundle + agent-swift verification).

The loop-engineer convention for general repos:
`/pr` skill (in `.claude/skills/pr/SKILL.md`) — verify by driving the
running app, then open the PR.

Pick whichever fits the repo. The key invariant is: **a PR is never
opened with unverified code.**

## 4. Commit hygiene

Install the pre-commit hook. For Omi projects:
```bash
test -f .git/hooks/pre-commit || ln -s -f ../../scripts/pre-commit .git/hooks/pre-commit
```

For loop-engineer projects: copy the pre-commit hook from
`.claude/hooks/pre-commit` (if it exists) to `.git/hooks/pre-commit`.

The hook enforces formatting (which CI also enforces). Without it, CI
rejects the PR — wasted round-trip.

## 5. Entropy control

Every few weeks, the repo accumulates:

- Stale branches (`git branch --list 'feat/*' --sort=-committerdate`)
- Stale worktrees (`git worktree list`)
- Dead code (look for unused exports, TODO comments older than 6 months)
- Drift between the agent-facing docs and reality (the build command
  in `AGENTS.md` doesn't match `package.json`)

Run a cleanup pass:

```bash
# delete merged branches older than 30 days
git branch --merged main | grep -v '^\*' | xargs git branch -d

# remove stale worktrees
git worktree list | awk 'NR>1{print $1}' | xargs -I {} git worktree remove {}

# find stale TODOs
grep -rn "TODO" --include="*.{ts,tsx,swift,py,go,rs}" | head -20
```

The agent should not need to be told to do this — the
`entropy-control` skill (or a weekly cron) should fire automatically.

## When to stop

Stop when the repo has:

- [ ] A working `AGENTS.md` / `CLAUDE.md` with build/test/lint commands
- [ ] A one-command dev launcher that works from any directory
- [ ] A verify-before-PR gate (unit + e2e)
- [ ] A pre-commit hook that matches CI
- [ ] A MAP.md (if the repo is large)
- [ ] A backlog of known entropy items, with dates

That's enough. Don't over-engineer. The agent can iterate from there.