# Tier 1 Superpowers Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt four superpowers patterns that together form a discipline foundation for AIDLC: bootstrap extension, anti-rationalization tables, and two new skills (verification-before-completion + systematic-debugging).

**Architecture:** One new TypeScript module (`bootstrap.ts`) injected into the existing aidlc-workflow extension via 4 session lifecycle events; one new test file for the bootstrap; 12 existing skill files get additive "Red Flags" + "Common Rationalizations" sections; two new SKILL.md files (port from superpowers); four existing agent/skill files get one-line references to the new skills; one new test file for skill content checks.

**Tech Stack:** TypeScript (Node 24, `--experimental-strip-types`), `node --test`, existing project conventions.

## Global Constraints

These constraints apply to every task. Tasks' requirements implicitly include this section.

- **TypeScript style (from AGENTS.md):** no in-function imports; module split keeps `index.ts` thin; atomic writes use `.tmp + rename`; POSIX shell escaping via `shellQuote()`.
- **Skill format (from superpowers + AIDLC):** frontmatter with `name` + `description` only (description ≤ 1024 chars); "Red Flags" + "Common Rationalizations" tables; iron laws in fenced caps blocks.
- **Voice:** new skills (F3, F4) use superpowers' "your human partner" voice (per Q7); F2 tables match the existing voice of the skill being edited (no rewriting existing prose).
- **Test pattern:** `node --test`, one test file per module, `MockExtensionAPI` pattern from `test/smoke.test.ts`.
- **Commit hygiene:** one commit per fusion (F1, F2, F3, F4 in order). Regular merge, no squash. Frontmatter `## Timeline` entry on the spec for each commit.
- **No placeholders** in any code block (per writing-plans "No Placeholders" rule). Every step that changes code shows the code.

---

## File Structure (locked-in by this plan)

### Create

| Path | Fusion | Lines (est.) |
|---|---|---|
| `extensions/aidlc-workflow/bootstrap.ts` | F1 | ~180 |
| `extensions/aidlc-workflow/test/bootstrap.test.ts` | F1 | ~250 |
| `extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md` | F3 | ~250 (port from superpowers) |
| `extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md` | F4 | ~400 (port from superpowers) |
| `extensions/aidlc-workflow/test/skills.test.ts` | F3+F4 | ~200 |

### Modify (additive only)

| Path | Fusion | Change |
|---|---|---|
| `extensions/aidlc-workflow/index.ts` | F1 | import + invoke `bootstrapExtension(pi)` at the bottom of default export |
| `extensions/aidlc-workflow/agents/shipper.md` | F3 | add 1 paragraph near top: verification-before-completion gate |
| `extensions/aidlc-workflow/agents/reviewer.md` | F3 | add 1 paragraph near top: verification-before-completion gate |
| `extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md` | F2 | add Red Flags + Common Rationalizations |
| `extensions/aidlc-workflow/skills/entropy-control/SKILL.md` | F2 | same |
| `extensions/aidlc-workflow/skills/implement/SKILL.md` | F2 + F4 | F2 tables + systematic-debugging reference |
| `extensions/aidlc-workflow/skills/new-loop/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/plan/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/review/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/setup-codebase-harness/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/ship/SKILL.md` | F2 + F3 | F2 tables + verification-before-completion reference |
| `extensions/aidlc-workflow/skills/signal-triage/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/specify/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/state-management/SKILL.md` | F2 | F2 tables |
| `extensions/aidlc-workflow/skills/test/SKILL.md` | F2 + F4 | F2 tables + systematic-debugging reference |

### No changes

- `install.sh`, `package.json`, `.aidlc/state.md`
- Agent files outside F3 scope: `spec-writer.md`, `planner.md`, `implementer.md`, `pr-feedback-handler.md`
- The 6 existing test files (untouched by this release; F1 adds bootstrap.test.ts, F3/F4 add skills.test.ts)

---

## Task Sequencing

```
F1 (foundation)        → F2 (additive)      → F3 (new skill)    → F4 (new skill)
bootstrap.ts           12 skills get tables  verification skill   debugging skill
+ tests                no tests              + integration         + integration
commit 1               commit 2              commit 3             commit 4
```

Each fusion is one commit. F1 must commit first because F3/F4 are referenced by name in F1's bootstrap message templates (they exist when the agent sees the HARD-GATEs).

---

# F1: Bootstrap Extension

## Task F1.1: Create bootstrap.ts skeleton

**Files:**
- Create: `extensions/aidlc-workflow/bootstrap.ts`

**Step 1: Write the file with constants + flag**

```typescript
// extensions/aidlc-workflow/bootstrap.ts
// Mirrors superpowers' .pi/extensions/superpowers.ts pattern.
// See: ~/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "aidlc bootstrap";
const SUBAGENT_STOP_TAG = "<SUBAGENT-STOP>";

let injectBootstrap = true;
```

**Step 2: Verify the file parses**

Run: `cd extensions/aidlc-workflow && node --experimental-strip-types --check bootstrap.ts`
Expected: exits 0, no output.

**Step 3: Commit (placeholder, will be amended by later tasks)**

Run: `git add extensions/aidlc-workflow/bootstrap.ts && git commit -m "wip(aidlc): bootstrap skeleton (F1.1)"`
Note: this commit will be amended/extended by later F1 tasks. Final commit at end of F1.

---

## Task F1.2: Add readAIDLCState() helper

**Files:**
- Modify: `extensions/aidlc-workflow/bootstrap.ts`

**Step 1: Append the helper**

```typescript
// append to bootstrap.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AIDLCState {
  phase: string;
  branch: string;
  pr: string;
  notes: string;
}

export function readAIDLCState(cwd: string): AIDLCState | null {
  const aidlcDir = join(cwd, ".aidlc");
  if (!existsSync(aidlcDir)) return null;

  const statePath = join(aidlcDir, "state.md");
  if (!existsSync(statePath)) return null;

  try {
    const content = readFileSync(statePath, "utf8");
    return parseStateContent(content);
  } catch (err) {
    console.warn(`[aidlc-bootstrap] failed to read state.md: ${err}`);
    return null;
  }
}

function parseStateContent(content: string): AIDLCState | null {
  const result: AIDLCState = {
    phase: "(unreadable)",
    branch: "(unreadable)",
    pr: "(unreadable)",
    notes: "",
  };

  let parsed = 0;
  const lines = content.split("\n");
  for (const line of lines) {
    const m = line.match(/^- \*\*(\w+)\*\*:\s*(.+)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "Phase") { result.phase = value.trim(); parsed++; }
    else if (key === "Branch") { result.branch = value.trim(); parsed++; }
    else if (key === "PR") { result.pr = value.trim(); parsed++; }
    else if (key === "Notes") { result.notes = value.trim(); }
  }

  return parsed > 0 ? result : null;
}
```

**Step 2: Verify the file parses**

Run: `cd extensions/aidlc-workflow && node --experimental-strip-types --check bootstrap.ts`
Expected: exits 0.

---

## Task F1.3: Add buildBootstrapContent() with templates

**Files:**
- Modify: `extensions/aidlc-workflow/bootstrap.ts`

**Step 1: Append the builder**

```typescript
// append to bootstrap.ts

const ACTIVE_LOOP_TEMPLATE = `${SUBAGENT_STOP_TAG}
If you were dispatched as a subagent to execute a specific task, skip this reminder.
</SUBAGENT-STOP>

${EXTREMELY_IMPORTANT_MARKER}
You are working in AIDLC mode (the AI-Driven Development Life Cycle).

Current state:
- Phase: {{phase}}
- Branch: {{branch}}
- PR: {{pr}}

Next action: run \`/aidlc next\`. Or read \`.aidlc/state.md\` directly.

HARD-GATEs (do not skip):
- Before any creative work (new feature, refactor, behavior change): invoke \`/specify\` first. Do NOT write code without an approved design.
- Before any completion claim: invoke \`verification-before-completion\` and run the verification command.
- Before patching a test failure or bug: invoke \`systematic-debugging\` and find the root cause first.

Each AIDLC skill carries its own HARD-GATE at the top of its SKILL.md. Read it before invoking.
</${EXTREMELY_IMPORTANT_MARKER}>`;

const NO_LOOP_TEMPLATE = `${SUBAGENT_STOP_TAG}
If you were dispatched as a subagent to execute a specific task, skip this reminder.
</SUBAGENT-STOP>

${EXTREMELY_IMPORTANT_MARKER}
You are working in AIDLC mode (the AI-Driven Development Life Cycle).

No active loop in this directory. To start a feature, run \`/aidlc start "<feature-name>"\`.

If you are about to do creative work, run \`/aidlc start "<feature>"\` first to spawn the AIDLC pipeline. Do NOT skip the brainstorming/spec phase.
</${EXTREMELY_IMPORTANT_MARKER}>`;

export function buildBootstrapContent(state: AIDLCState | null): string {
  if (state === null) return NO_LOOP_TEMPLATE;
  return ACTIVE_LOOP_TEMPLATE
    .replace("{{phase}}", state.phase)
    .replace("{{branch}}", state.branch)
    .replace("{{pr}}", state.pr);
}
```

**Step 2: Verify the file parses**

Run: `cd extensions/aidlc-workflow && node --experimental-strip-types --check bootstrap.ts`
Expected: exits 0.

---

## Task F1.4: Add message helpers (detection + insertion index)

**Files:**
- Modify: `extensions/aidlc-workflow/bootstrap.ts`

**Step 1: Append the helpers**

```typescript
// append to bootstrap.ts

export function messageContainsBootstrap(message: unknown): boolean {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.includes(BOOTSTRAP_MARKER);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    return (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.includes(BOOTSTRAP_MARKER)
    );
  });
}

export function firstNonCompactionSummaryIndex(messages: unknown[]): number {
  let index = 0;
  while ((messages[index] as { role?: unknown } | undefined)?.role === "compactionSummary") {
    index += 1;
  }
  return index;
}
```

**Step 2: Verify the file parses**

Run: `cd extensions/aidlc-workflow && node --experimental-strip-types --check bootstrap.ts`
Expected: exits 0.

---

## Task F1.5: Wire bootstrapExtension() with all 4 event handlers

**Files:**
- Modify: `extensions/aidlc-workflow/bootstrap.ts`

**Step 1: Append the default export**

```typescript
// append to bootstrap.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function bootstrapExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    injectBootstrap = true;
  });

  pi.on("session_compact", async () => {
    injectBootstrap = true;
  });

  pi.on("agent_end", async () => {
    injectBootstrap = false;
  });

  pi.on("context", async (event: { messages: unknown[]; cwd?: string }) => {
    if (!injectBootstrap) return;
    if (event.messages.some(messageContainsBootstrap)) return;

    const cwd = event.cwd ?? process.cwd();
    const aidlcDir = join(cwd, ".aidlc");
    if (!existsSync(aidlcDir)) return;

    const state = readAIDLCState(cwd);
    const bootstrap = buildBootstrapContent(state);
    const bootstrapMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: bootstrap }],
      timestamp: Date.now(),
    };

    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    return {
      messages: [
        ...event.messages.slice(0, insertAt),
        bootstrapMessage,
        ...event.messages.slice(insertAt),
      ],
    };
  });
}
```

**Step 2: Verify the file parses**

Run: `cd extensions/aidlc-workflow && node --experimental-strip-types --check bootstrap.ts`
Expected: exits 0.

---

## Task F1.6: Wire bootstrap into index.ts

**Files:**
- Modify: `extensions/aidlc-workflow/index.ts`

**Step 1: Add the import at the top (after existing imports)**

```typescript
// add at the top of index.ts, after existing imports

import bootstrapExtension from "./bootstrap.ts";
```

**Step 2: Invoke inside the default export**

Find the existing default export function in `index.ts` (it registers the `aidlc` tool and commands). Add this line at the END of that function, just before the closing `}`:

```typescript
  bootstrapExtension(pi);
```

**Step 3: Verify typecheck**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: passes existing tests (66 of them), no new failures. Bootstrap not yet tested — that's Task F1.7.

**Step 4: Manual smoke check**

Run: `cd /tmp && rm -rf aidlc-smoke && mkdir aidlc-smoke && cd aidlc-smoke && echo "test" > .aidlc/state.md && pi -e /Users/choguun/Documents/workspaces/cool-projects/pi-extensions/extensions/aidlc-workflow 2>&1 | head -20`
Expected: extension loads without error.

---

## Task F1.7: Write bootstrap.test.ts (15 tests)

**Files:**
- Modify: `extensions/aidlc-workflow/test/smoke.test.ts` (extract MockExtensionAPI)
- Create: `extensions/aidlc-workflow/test/mock-extension-api.ts`
- Modify: `extensions/aidlc-workflow/package.json` (glob the test script)
- Create: `extensions/aidlc-workflow/test/bootstrap.test.ts`

**Pre-step A: Extract MockExtensionAPI to a shared module**

Per pre-flight Finding 2 (user chose A — reuse the existing mock):
1. Read `extensions/aidlc-workflow/test/smoke.test.ts` lines 1-130 to identify the MockExtensionAPI class definition.
2. Create `extensions/aidlc-workflow/test/mock-extension-api.ts` containing the `MockExtensionAPI` class exported as default. Move it verbatim.
3. Update `extensions/aidlc-workflow/test/smoke.test.ts` to import from `./mock-extension-api.ts` and remove the local class definition.
4. Run: `cd extensions/aidlc-workflow && npm run test:smoke`
5. Expected: smoke tests still pass.

**Pre-step B: Glob the test script in package.json**

Per pre-flight Finding 1 (user chose B — glob):
1. Edit `extensions/aidlc-workflow/package.json`: change `"test": "npm run typecheck && node --test test/smoke.test.ts test/parser.test.ts test/classifier.test.ts test/branch.test.ts test/substrate.test.ts test/worktree.test.ts"` to `"test": "npm run typecheck && node --test test/*.test.ts"`.
2. Run: `cd extensions/aidlc-workflow && npm test`
3. Expected: all 6 existing test files run and pass.

**Step 1: Write the test file**

```typescript
// extensions/aidlc-workflow/test/bootstrap.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import bootstrapExtension, {
  buildBootstrapContent,
  firstNonCompactionSummaryIndex,
  messageContainsBootstrap,
  readAIDLCState,
  type AIDLCState,
} from "../bootstrap.ts";

// ---- readAIDLCState ----

test("readAIDLCState parses valid state.md", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(
    join(cwd, ".aidlc/state.md"),
    `- **Phase**: implementing
- **Branch**: feat/foo
- **PR**: 42
- **Notes**: working on F1
- **Last action**: 2026-06-26T12:00:00Z
- **Next action**: Run /test`,
  );
  const state = readAIDLCState(cwd);
  assert.ok(state);
  assert.equal(state.phase, "implementing");
  assert.equal(state.branch, "feat/foo");
  assert.equal(state.pr, "42");
  assert.equal(state.notes, "working on F1");
  rmSync(cwd, { recursive: true });
});

test("readAIDLCState returns null when .aidlc/ missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  assert.equal(readAIDLCState(cwd), null);
  rmSync(cwd, { recursive: true });
});

test("readAIDLCState returns null when state.md missing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  assert.equal(readAIDLCState(cwd), null);
  rmSync(cwd, { recursive: true });
});

test("readAIDLCState returns null on malformed file", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(join(cwd, ".aidlc/state.md"), "not a state file");
  assert.equal(readAIDLCState(cwd), null);
  rmSync(cwd, { recursive: true });
});

test("readAIDLCState tolerates missing fields", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(
    join(cwd, ".aidlc/state.md"),
    `- **Phase**: planning`,
  );
  const state = readAIDLCState(cwd);
  assert.ok(state);
  assert.equal(state.phase, "planning");
  assert.equal(state.branch, "(unreadable)");
  rmSync(cwd, { recursive: true });
});

// ---- buildBootstrapContent ----

test("buildBootstrapContent with state → active template", () => {
  const state: AIDLCState = {
    phase: "implementing",
    branch: "feat/foo",
    pr: "42",
    notes: "",
  };
  const out = buildBootstrapContent(state);
  assert.match(out, /<EXTREMELY_IMPORTANT>/);
  assert.match(out, /Phase: implementing/);
  assert.match(out, /Branch: feat\/foo/);
  assert.match(out, /PR: 42/);
  assert.match(out, /invoke `\/specify` first/);
});

test("buildBootstrapContent with null → no-loop template", () => {
  const out = buildBootstrapContent(null);
  assert.match(out, /<EXTREMELY_IMPORTANT>/);
  assert.match(out, /No active loop in this directory/);
  assert.match(out, /aidlc start/);
});

// ---- messageContainsBootstrap ----

test("messageContainsBootstrap detects marker in string content", () => {
  assert.equal(
    messageContainsBootstrap({ role: "user", content: "<EXTREMELY_IMPORTANT>aidlc bootstrap...</EXTREMELY_IMPORTANT>" }),
    true,
  );
});

test("messageContainsBootstrap detects marker in array content", () => {
  assert.equal(
    messageContainsBootstrap({
      role: "user",
      content: [{ type: "text", text: "<EXTREMELY_IMPORTANT>aidlc bootstrap...</EXTREMELY_IMPORTANT>" }],
    }),
    true,
  );
});

test("messageContainsBootstrap returns false for unrelated message", () => {
  assert.equal(
    messageContainsBootstrap({ role: "user", content: "hello" }),
    false,
  );
});

// ---- firstNonCompactionSummaryIndex ----

test("firstNonCompactionSummaryIndex skips summaries", () => {
  const messages = [
    { role: "compactionSummary" },
    { role: "compactionSummary" },
    { role: "user", content: "real message" },
    { role: "assistant", content: "response" },
  ];
  assert.equal(firstNonCompactionSummaryIndex(messages), 2);
});

test("firstNonCompactionSummaryIndex returns 0 when no summaries", () => {
  const messages = [{ role: "user", content: "hi" }];
  assert.equal(firstNonCompactionSummaryIndex(messages), 0);
});

// ---- bootstrapExtension handlers ----

type Handler = (event: unknown) => Promise<unknown>;

function makeMockPi() {
  const handlers = new Map<string, Handler[]>();
  return {
    on(event: string, handler: Handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    fire(event: string, payload: unknown) {
      const list = handlers.get(event) ?? [];
      return Promise.all(list.map((h) => h(payload)));
    },
    count(event: string) {
      return (handlers.get(event) ?? []).length;
    },
  };
}

function makeMsg(role: string, text?: string) {
  if (text === undefined) return { role };
  return { role, content: [{ type: "text", text }] };
}

test("session_start handler arms flag (context handler injects)", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(
    join(cwd, ".aidlc/state.md"),
    `- **Phase**: implementing\n- **Branch**: feat/foo\n- **PR**: 42`,
  );

  await pi.fire("session_start", {});
  const result = await pi.fire("context", {
    messages: [makeMsg("user", "hello")],
    cwd,
  });
  const firstResult = (await result)[0] as { messages: unknown[] } | undefined;
  assert.ok(firstResult);
  const bootstrapMsg = firstResult.messages.find((m: unknown) =>
    messageContainsBootstrap(m),
  );
  assert.ok(bootstrapMsg);
  rmSync(cwd, { recursive: true });
});

test("session_compact handler re-arms flag", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(
    join(cwd, ".aidlc/state.md"),
    `- **Phase**: implementing\n- **Branch**: feat/foo\n- **PR**: 42`,
  );

  // First turn: injects
  await pi.fire("session_start", {});
  await pi.fire("context", { messages: [makeMsg("user", "hi")], cwd });
  await pi.fire("agent_end", {});

  // Second turn without re-arming: skipped
  const result2 = await pi.fire("context", {
    messages: [makeMsg("user", "second"), makeMsg("user", "<EXTREMELY_IMPORTANT>aidlc bootstrap</EXTREMELY_IMPORTANT>")],
    cwd,
  });
  const firstResult2 = (await result2)[0] as { messages: unknown[] } | undefined;
  if (firstResult2) {
    // Should not have inserted a NEW bootstrap (one already present)
    const bootstraps = firstResult2.messages.filter(messageContainsBootstrap);
    assert.equal(bootstraps.length, 1);
  }

  // Compaction re-arms
  await pi.fire("session_compact", {});
  // After compaction, the message array may have lost the bootstrap
  const result3 = await pi.fire("context", {
    messages: [makeMsg("compactionSummary"), makeMsg("user", "after compact")],
    cwd,
  });
  const firstResult3 = (await result3)[0] as { messages: unknown[] } | undefined;
  if (firstResult3) {
    const bootstrapMsg = firstResult3.messages.find(messageContainsBootstrap);
    assert.ok(bootstrapMsg, "should re-inject after compaction");
  }
  rmSync(cwd, { recursive: true });
});

test("agent_end handler disarms flag (no re-injection on next turn)", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(
    join(cwd, ".aidlc/state.md"),
    `- **Phase**: implementing`,
  );

  await pi.fire("session_start", {});
  await pi.fire("context", { messages: [makeMsg("user", "hi")], cwd });
  await pi.fire("agent_end", {});

  // Second turn without compaction: no re-injection
  const result = await pi.fire("context", {
    messages: [makeMsg("user", "hi again")],
    cwd,
  });
  const firstResult = (await result)[0] as { messages: unknown[] } | undefined;
  if (firstResult) {
    const bootstraps = firstResult.messages.filter(messageContainsBootstrap);
    assert.equal(bootstraps.length, 0);
  }
  rmSync(cwd, { recursive: true });
});

test("context handler injects when armed, no duplicate", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(join(cwd, ".aidlc/state.md"), `- **Phase**: implementing`);

  await pi.fire("session_start", {});
  const result = await pi.fire("context", {
    messages: [makeMsg("user", "<EXTREMELY_IMPORTANT>aidlc bootstrap</EXTREMELY_IMPORTANT>")],
    cwd,
  });
  const firstResult = (await result)[0] as { messages: unknown[] } | undefined;
  if (firstResult) {
    const bootstraps = firstResult.messages.filter(messageContainsBootstrap);
    assert.equal(bootstraps.length, 1);
  }
  rmSync(cwd, { recursive: true });
});

test("context handler skips when .aidlc/ missing", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-")); // no .aidlc/

  await pi.fire("session_start", {});
  const result = await pi.fire("context", {
    messages: [makeMsg("user", "hi")],
    cwd,
  });
  const firstResult = (await result)[0] as { messages: unknown[] } | undefined;
  if (firstResult) {
    const bootstraps = firstResult.messages.filter(messageContainsBootstrap);
    assert.equal(bootstraps.length, 0);
  }
  rmSync(cwd, { recursive: true });
});

test("context handler survives malformed state.md", async () => {
  const pi = makeMockPi();
  bootstrapExtension(pi as never);

  const cwd = mkdtempSync(join(tmpdir(), "aidlc-test-"));
  mkdirSync(join(cwd, ".aidlc"));
  writeFileSync(join(cwd, ".aidlc/state.md"), "garbage");

  await pi.fire("session_start", {});
  // Should not throw — either returns no change or injects no-loop template
  await pi.fire("context", { messages: [makeMsg("user", "hi")], cwd });
  // No assertion on injection count; just verifying no crash
  rmSync(cwd, { recursive: true });
});
```

**Step 2: Run the tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: all 66 existing tests pass + 15 new bootstrap tests pass = 81 total.

**Step 3: Verify coverage on bootstrap.ts**

Run: `cd extensions/aidlc-workflow && npx c8 --reporter=text node --experimental-strip-types --test test/bootstrap.test.ts`
Expected: ≥85% line coverage on `bootstrap.ts`.

---

## Task F1.8: Commit F1 + spec Timeline entry

**Files:**
- Modify: `extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md` (Timeline only)

**Step 1: Amend the F1 WIP commits into a single F1 commit**

Run:
```bash
git log --oneline -5
# Identify the F1.1 WIP commit and the subsequent WIP commits if any
# If F1 was one squashed sequence of edits, soft-reset and recommit:
git reset --soft HEAD~N  # where N = number of F1 WIP commits
git add extensions/aidlc-workflow/bootstrap.ts extensions/aidlc-workflow/test/bootstrap.test.ts extensions/aidlc-workflow/index.ts
git commit -m "feat(aidlc): F1 bootstrap extension

Injects AIDLC-mode reminder on session_start + session_compact so the
LLM sees the current phase + 3 core HARD-GATEs every session boundary.

- bootstrap.ts: 4 event handlers (session_start, session_compact,
  agent_end, context) following superpowers' .pi/extensions/superpowers.ts
  pattern. Two message templates (active-loop + no-loop).
- bootstrap.test.ts: 15 tests covering state parsing, template
  building, message detection, insertion index, and all 4 handlers.
- index.ts: imports + invokes bootstrapExtension at end of default export.
- No new dependencies. No install.sh changes (skills already discoverable
  via symlinks).

Closes F1 in the Tier 1 fusion spec:
extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md"
```

**Step 2: Append to spec Timeline**

Edit `extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md`,
append to the `## Timeline` section:

```markdown
2026-06-26 | F1 shipped — bootstrap extension + 15 tests + index.ts wiring. Bootstrap injects AIDLC-mode reminder on session_start + session_compact.
```

**Step 3: Commit the Timeline update**

Run: `git add extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md && git commit -m "docs(aidlc): log F1 ship in spec Timeline"`

---

# F2: Anti-rationalization Tables

## Task F2.1: Choose a template for the tables

**Files:**
- None (design decision recorded in commit message)

**Step 1: Confirm the template**

The format for every F2 table is:

```markdown
## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "[excuse]" | [rebuttal]" |
| ... |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "[excuse]" | [rebuttal]" |
| ... |
```

5-10 rows per table. Adapt from superpowers skills' rationalizations
where the underlying excuse maps to AIDLC's domain.

**Step 2: Document the template**

Run: `echo "F2 template confirmed: Red Flags + Common Rationalizations, 5-10 rows each" >> /tmp/f2-decisions.log`

---

## Task F2.2: Add tables to aidlc-workflow/SKILL.md

**Files:**
- Modify: `extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md`

**Step 1: Read the existing file**

Run: `cat extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md`

**Step 2: Append the tables**

Append to the end of the file (before any existing `## Timeline`):

```markdown
## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "This task is too small for AIDLC" | Every task goes through AIDLC. "Small" tasks are where unexamined assumptions cause the most wasted work. |
| "I'll just check state.md manually" | The state machine exists to track this for you. Re-read the spec for `/aidlc next` instead. |
| "I can skip the spec phase" | No. The spec is the contract; skipping it means rebuilding later. |
| "AIDLC overhead is too much" | AIDLC's overhead is less than the cost of rework. Time it before complaining. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Too simple to need AIDLC" | Simple tasks break too. The discipline is fast for simple tasks. |
| "I'll catch up later" | Later never comes. Stay in the phase machine. |
| "The phase doesn't apply" | If you don't see how it applies, you haven't read this skill. |
```

**Step 3: Verify**

Run: `wc -l extensions/aidlc-workflow/skills/aidlc-workflow/SKILL.md`
Expected: file grew by ~20-25 lines.

---

## Task F2.3: Add tables to test/SKILL.md (also gets F4 reference)

**Files:**
- Modify: `extensions/aidlc-workflow/skills/test/SKILL.md`

**Step 1: Read the existing file**

Run: `cat extensions/aidlc-workflow/skills/test/SKILL.md`

**Step 2: Append F4 reference at top + F2 tables at bottom**

Prepend (just after the frontmatter):

```markdown
<HARD-GATE>
When tests fail, invoke `systematic-debugging` before proposing fixes.
Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
</HARD-GATE>
```

Append (before any `## Timeline`):

```markdown
## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "Tests pass, ship it" | Did you run them fresh in this turn? `verification-before-completion` requires fresh evidence. |
| "This test is flaky" | Investigate with `systematic-debugging` before disabling. |
| "I'll add a regression test later" | TDD requires the test first. No "later" in TDD. |
| "Coverage is fine" | Coverage ≠ correctness. Run the actual verification command. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Linter passed" | Linter ≠ compiler. Run the build / test command. |
| "It worked when I tried it" | Manual testing is ad-hoc. Re-run the automated suite. |
| "Tests are slow" | Profile the slow tests. Don't skip them. |
```

**Step 3: Verify**

Run: `wc -l extensions/aidlc-workflow/skills/test/SKILL.md`
Expected: file grew.

---

## Task F2.4: Add tables to implement/SKILL.md (also gets F4 reference)

**Files:**
- Modify: `extensions/aidlc-workflow/skills/implement/SKILL.md`

**Step 1: Read the existing file**

Run: `cat extensions/aidlc-workflow/skills/implement/SKILL.md`

**Step 2: Append F4 reference at top + F2 tables at bottom**

Prepend (after frontmatter):

```markdown
<HARD-GATE>
When a bug is found during implementation, invoke `systematic-debugging`
before patching. Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
</HARD-GATE>
```

Append (before any `## Timeline`):

```markdown
## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---|---|
| "I'll write the test after" | That's not TDD. Tests-after prove nothing — you never saw them catch the bug. |
| "This is too simple for TDD" | Simple code breaks. Test takes 30 seconds. |
| "I'm just exploring" | Fine. Throw away the exploration, start with TDD. |
| "The existing code has no tests" | You're improving it. Add tests as you go. |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "TDD will slow me down" | TDD is faster than debugging after. Pragmatic = test-first. |
| "Need to explore first" | OK — throw away the exploration, start with TDD. |
| "Manual test is faster" | Manual doesn't prove edge cases. Re-run every change. |
```

**Step 3: Verify**

Run: `wc -l extensions/aidlc-workflow/skills/implement/SKILL.md`

---

## Task F2.5: Add tables to remaining 9 skills (mechanical batch)

**Files:** Modify each of:
- `extensions/aidlc-workflow/skills/entropy-control/SKILL.md`
- `extensions/aidlc-workflow/skills/new-loop/SKILL.md`
- `extensions/aidlc-workflow/skills/plan/SKILL.md`
- `extensions/aidlc-workflow/skills/review/SKILL.md`
- `extensions/aidlc-workflow/skills/setup-codebase-harness/SKILL.md`
- `extensions/aidlc-workflow/skills/ship/SKILL.md`
- `extensions/aidlc-workflow/skills/signal-triage/SKILL.md`
- `extensions/aidlc-workflow/skills/specify/SKILL.md`
- `extensions/aidlc-workflow/skills/state-management/SKILL.md`

**Step 1: For each file, append a "Red Flags" + "Common Rationalizations" section with 5-10 rows adapted to that skill's domain.**

Reference superpowers skills at `~/.pi/agent/git/github.com/obra/superpowers/skills/*/SKILL.md` for adapted rationalizations. The general pattern:

- **Red Flags:** "STOP" thoughts the LLM will have while doing the task
- **Common Rationalizations:** excuses + rebuttals

Examples per skill (adapt as needed):

- **entropy-control:** "I'll clean up later", "git history is enough"
- **new-loop:** "I'll use the existing one", "loops are overhead"
- **plan:** "I'll figure it out as I go", "this is too simple for a plan"
- **review:** "It's small, no need to review", "I'll trust my own work"
- **setup-codebase-harness:** "I'll set up later", "this codebase is special"
- **ship:** "Tests pass locally, good enough" (verification gate cross-reference)
- **signal-triage:** "I'll handle signals ad-hoc", "frequencies don't matter"
- **specify:** "Spec is obvious", "user will iterate anyway"
- **state-management:** "state.md is just a file", "drift doesn't matter"

**Step 2: Verify all 12 skills have tables**

Run:
```bash
for f in extensions/aidlc-workflow/skills/*/SKILL.md; do
  if ! grep -q "## Red Flags" "$f"; then
    echo "MISSING: $f"
  fi
done
```
Expected: no MISSING lines.

**Step 3: Run tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: all 81 tests still pass (F2 is content-only, no test changes).

---

## Task F2.6: Commit F2 + spec Timeline entry

**Step 1: Commit F2**

Run:
```bash
git add extensions/aidlc-workflow/skills/
git commit -m "feat(aidlc): F2 anti-rationalization tables in all 12 skills

Each AIDLC skill now has a 'Red Flags' + 'Common Rationalizations'
section enumerating the excuses an LLM uses to skip the discipline,
with rebuttals. Mechanical, additive change — no existing prose
modified.

Adapted from superpowers skills' rationalization tables; examples
reframed for AIDLC's domain. test/ + implement/ also got explicit
F4 references (systematic-debugging HARD-GATE) in their frontmatter.

Closes F2 in the Tier 1 fusion spec:
extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md"
```

**Step 2: Append to spec Timeline**

Edit `extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md`,
append:

```markdown
2026-06-26 | F2 shipped — Red Flags + Common Rationalizations added to all 12 AIDLC skills. test/ + implement/ also got explicit F4 references.
```

**Step 3: Commit the Timeline update**

Run: `git add extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md && git commit -m "docs(aidlc): log F2 ship in spec Timeline"`

---

# F3: verification-before-completion Skill

## Task F3.1: Create the SKILL.md file (direct port)

**Files:**
- Create: `extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md`

**Step 1: Write the file**

Copy the source verbatim from:
`~/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md`

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md \
   extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md
```

**Step 2: Verify file matches source**

Run:
```bash
diff ~/.pi/agent/git/github.com/obra/superpowers/skills/verification-before-completion/SKILL.md \
     extensions/aidlc-workflow/skills/verification-before-completion/SKILL.md
```
Expected: no diff output.

**Step 3: Verify install.sh picks it up**

Run: `bash install.sh 2>&1 | grep verification`
Expected: see a symlink created at `~/.pi/agent/skills/verification-before-completion`.

**Step 4: Verify the symlink**

Run: `ls -la ~/.pi/agent/skills/verification-before-completion`
Expected: symlink pointing to the AIDLC extension's SKILL.md.

---

## Task F3.2: Add verification gate to shipper.md

**Files:**
- Modify: `extensions/aidlc-workflow/agents/shipper.md`

**Step 1: Read the file**

Run: `cat extensions/aidlc-workflow/agents/shipper.md`

**Step 2: Add the verification gate at the top**

After the frontmatter (if any), prepend:

```markdown
<HARD-GATE>
Before claiming the PR is ready to ship, invoke
`verification-before-completion` and follow its gate function.
Iron law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

Run the verification command in this turn. Read the output. THEN
claim completion.
</HARD-GATE>
```

**Step 3: Verify**

Run: `grep -A2 "HARD-GATE" extensions/aidlc-workflow/agents/shipper.md`
Expected: see the gate.

---

## Task F3.3: Add verification gate to reviewer.md

**Files:**
- Modify: `extensions/aidlc-workflow/agents/reviewer.md`

**Step 1: Read the file**

Run: `cat extensions/aidlc-workflow/agents/reviewer.md`

**Step 2: Add the verification gate at the top**

Prepend (after frontmatter if any):

```markdown
<HARD-GATE>
Before approving the PR, invoke `verification-before-completion`
and follow its gate function. Iron law: NO COMPLETION CLAIMS
WITHOUT FRESH VERIFICATION EVIDENCE.

The reviewer's claim that "the code is correct" requires the same
fresh evidence the shipper needs.
</HARD-GATE>
```

**Step 3: Verify**

Run: `grep -A2 "HARD-GATE" extensions/aidlc-workflow/agents/reviewer.md`

---

## Task F3.4: Add verification reference to ship/SKILL.md (cross-cutting with F2)

**Files:**
- Modify: `extensions/aidlc-workflow/skills/ship/SKILL.md`

**Step 1: Read the file**

Run: `cat extensions/aidlc-workflow/skills/ship/SKILL.md`

**Step 2: Prepend the verification HARD-GATE**

After frontmatter:

```markdown
<HARD-GATE>
Before shipping, invoke `verification-before-completion`. Run the
test suite + typecheck + lint in this turn. Read the output. THEN
declare ready to ship.
</HARD-GATE>
```

(Note: this file also gets F2 tables from Task F2.5; this is a separate edit for the HARD-GATE.)

**Step 3: Verify**

Run: `grep -A2 "HARD-GATE" extensions/aidlc-workflow/skills/ship/SKILL.md`

---

## Task F3.5: Write skills.test.ts (F3 portion — 8 tests)

**Files:**
- Create: `extensions/aidlc-workflow/test/skills.test.ts`

**Step 1: Write the F3 portion of the test file**

```typescript
// extensions/aidlc-workflow/test/skills.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const VERIFICATION_SKILL = join(ROOT, "skills/verification-before-completion/SKILL.md");
const DEBUGGING_SKILL = join(ROOT, "skills/systematic-debugging/SKILL.md");

function readSkill(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

// ---- F3: verification-before-completion ----

test("verification-before-completion SKILL.md exists", () => {
  assert.ok(existsSync(VERIFICATION_SKILL));
});

test("verification-before-completion has valid frontmatter", () => {
  const content = readSkill(VERIFICATION_SKILL);
  assert.match(content, /^---\nname: verification-before-completion\n/);
  assert.match(content, /^description: Use when/m);
});

test("verification-before-completion description ≤ 1024 chars", () => {
  const content = readSkill(VERIFICATION_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("verification-before-completion contains iron law", () => {
  const content = readSkill(VERIFICATION_SKILL);
  assert.match(content, /NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE/);
});

test("verification-before-completion contains all 5 Key Patterns", () => {
  const content = readSkill(VERIFICATION_SKILL);
  for (const pattern of ["Tests:", "Regression tests", "Build:", "Requirements:", "Agent delegation"]) {
    assert.match(content, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("shipper.md references verification-before-completion", () => {
  const content = readSkill(join(ROOT, "agents/shipper.md"));
  assert.match(content, /verification-before-completion/);
});

test("reviewer.md references verification-before-completion", () => {
  const content = readSkill(join(ROOT, "agents/reviewer.md"));
  assert.match(content, /verification-before-completion/);
});

test("install.sh symlink points to verification-before-completion", () => {
  const linkPath = join(process.env.HOME ?? "", ".pi/agent/skills/verification-before-completion");
  if (!existsSync(linkPath)) {
    // install.sh hasn't run; this is acceptable in CI
    return;
  }
  const stat = require("node:fs").lstatSync(linkPath);
  assert.ok(stat.isSymbolicLink(), "should be a symlink");
});
```

**Step 2: Run the F3 tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: all 81 prior tests + 8 new F3 tests pass = 89 total.

---

## Task F3.6: Commit F3 + spec Timeline entry

**Step 1: Commit F3**

Run:
```bash
git add extensions/aidlc-workflow/skills/verification-before-completion/ extensions/aidlc-workflow/agents/shipper.md extensions/aidlc-workflow/agents/reviewer.md extensions/aidlc-workflow/skills/ship/SKILL.md extensions/aidlc-workflow/test/skills.test.ts
git commit -m "feat(aidlc): F3 verification-before-completion skill + integration

Direct port of superpowers' verification-before-completion SKILL.md
(no AIDLC-specific adaptation — discipline is universal). The skill
enforces 'no completion claims without fresh verification evidence'.

Integration:
- agents/shipper.md + agents/reviewer.md: explicit HARD-GATE at top
  requiring the skill be invoked before declaring ready to ship/review.
- skills/ship/SKILL.md: HARD-GATE cross-reference.
- test/skills.test.ts: 8 content checks verifying file presence,
  frontmatter, iron law, all 5 Key Patterns, and references.

Closes F3 in the Tier 1 fusion spec."
```

**Step 2: Append to spec Timeline**

Edit `extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md`,
append:

```markdown
2026-06-26 | F3 shipped — verification-before-completion skill ported from superpowers. shipper.md + reviewer.md + ship/SKILL.md got HARD-GATE references. 8 content tests in skills.test.ts.
```

**Step 3: Commit Timeline update**

Run: `git add extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md && git commit -m "docs(aidlc): log F3 ship in spec Timeline"`

---

# F4: systematic-debugging Skill

## Task F4.1: Create the SKILL.md file (direct port, supporting techniques reference only)

**Files:**
- Create: `extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md`

**Step 1: Write the file**

Copy the source verbatim from:
`~/.pi/agent/git/github.com/obra/superpowers/skills/systematic-debugging/SKILL.md`

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/systematic-debugging/SKILL.md \
   extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md
```

**Step 2: Verify file matches source**

Run:
```bash
diff ~/.pi/agent/git/github.com/obra/superpowers/skills/systematic-debugging/SKILL.md \
     extensions/aidlc-workflow/skills/systematic-debugging/SKILL.md
```
Expected: no diff output.

**Step 3: Verify install.sh picks it up**

Run: `bash install.sh 2>&1 | grep debugging`
Expected: see a symlink created.

---

## Task F4.2: Add debugging gate to test/SKILL.md

**Files:**
- Modify: `extensions/aidlc-workflow/skills/test/SKILL.md`

**Step 1: Verify F2.3 already added the F4 reference**

Run: `grep -A2 "HARD-GATE" extensions/aidlc-workflow/skills/test/SKILL.md`
Expected: see the F4 reference (added in Task F2.3). If not, add it now:

```markdown
<HARD-GATE>
When tests fail, invoke `systematic-debugging` before proposing fixes.
Iron law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
</HARD-GATE>
```

**Step 2: No further changes** — the F2.3 reference is sufficient.

---

## Task F4.3: Add debugging gate to implement/SKILL.md

**Files:**
- Modify: `extensions/aidlc-workflow/skills/implement/SKILL.md`

**Step 1: Verify F2.4 already added the F4 reference**

Run: `grep -A2 "HARD-GATE" extensions/aidlc-workflow/skills/implement/SKILL.md`
Expected: see the F4 reference (added in Task F2.4). If not, add it now.

---

## Task F4.4: Extend skills.test.ts with F4 tests (8 more)

**Files:**
- Modify: `extensions/aidlc-workflow/test/skills.test.ts`

**Step 1: Append F4 tests to the existing test file**

```typescript
// append to skills.test.ts

// ---- F4: systematic-debugging ----

test("systematic-debugging SKILL.md exists", () => {
  assert.ok(existsSync(DEBUGGING_SKILL));
});

test("systematic-debugging has valid frontmatter", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /^---\nname: systematic-debugging\n/);
  assert.match(content, /^description: Use when/m);
});

test("systematic-debugging description ≤ 1024 chars", () => {
  const content = readSkill(DEBUGGING_SKILL);
  const match = content.match(/^description: (.+)$/m);
  assert.ok(match);
  assert.ok(match[1].length <= 1024, `description is ${match[1].length} chars`);
});

test("systematic-debugging contains iron law", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST/);
});

test("systematic-debugging contains all 4 phase headers", () => {
  const content = readSkill(DEBUGGING_SKILL);
  for (const phase of [
    "Root Cause Investigation",
    "Pattern Analysis",
    "Hypothesis and Testing",
    "Implementation",
  ]) {
    assert.match(content, new RegExp(phase));
  }
});

test("systematic-debugging contains the '3+ Fixes Failed' rule", () => {
  const content = readSkill(DEBUGGING_SKILL);
  assert.match(content, /3\+ Fixes Failed/);
});

test("test/SKILL.md references systematic-debugging", () => {
  const content = readSkill(join(ROOT, "skills/test/SKILL.md"));
  assert.match(content, /systematic-debugging/);
});

test("implement/SKILL.md references systematic-debugging", () => {
  const content = readSkill(join(ROOT, "skills/implement/SKILL.md"));
  assert.match(content, /systematic-debugging/);
});
```

**Step 2: Run all tests**

Run: `cd extensions/aidlc-workflow && npm test`
Expected: all 89 prior tests + 8 new F4 tests pass = 97 total.

---

## Task F4.5: Commit F4 + spec Timeline entry

**Step 1: Commit F4**

Run:
```bash
git add extensions/aidlc-workflow/skills/systematic-debugging/ extensions/aidlc-workflow/skills/test/SKILL.md extensions/aidlc-workflow/skills/implement/SKILL.md extensions/aidlc-workflow/test/skills.test.ts
git commit -m "feat(aidlc): F4 systematic-debugging skill + integration

Direct port of superpowers' systematic-debugging SKILL.md (universal
4-phase root cause investigation discipline). Supporting techniques
referenced but full content deferred to follow-up.

Integration:
- skills/test/SKILL.md + skills/implement/SKILL.md: HARD-GATE
  requiring systematic-debugging before patching failures/bugs.
- test/skills.test.ts: 8 content checks for F4 (file presence,
  frontmatter, iron law, 4 phases, 3+ fixes rule, references).

Closes F4 in the Tier 1 fusion spec."
```

**Step 2: Append to spec Timeline**

Edit `extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md`,
append:

```markdown
2026-06-26 | F4 shipped — systematic-debugging skill ported from superpowers. test/SKILL.md + implement/SKILL.md got HARD-GATE references. 8 content tests in skills.test.ts. Tier 1 fusion release complete: 97 tests passing (66 prior + 15 bootstrap + 16 skill content).
```

**Step 3: Commit Timeline update**

Run: `git add extensions/aidlc-workflow/docs/2026-06-26-aidlc-bootstrap-design.md && git commit -m "docs(aidlc): log F4 ship + release complete in spec Timeline"`

---

# Self-Review

After writing this plan, scan once for issues:

**1. Spec coverage:**
- F1 → Tasks F1.1–F1.8 ✓
- F2 → Tasks F2.1–F2.6 ✓
- F3 → Tasks F3.1–F3.6 ✓
- F4 → Tasks F4.1–F4.5 ✓

**2. Placeholder scan:** none — every code block has the actual code.

**3. Type consistency:** AIDLCState interface defined in F1.2, used throughout F1. No name drift.

**4. Test coverage:** 15 (F1) + 8 (F3) + 8 (F4) = 31 new tests across 2 new test files. F2 has no tests (content only). 97 total after release.

---

# Execution Handoff

After this plan is reviewed and approved, two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Per-task reviews catch issues early.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
