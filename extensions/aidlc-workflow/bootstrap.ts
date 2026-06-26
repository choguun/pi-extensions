// extensions/aidlc-workflow/bootstrap.ts
// Mirrors superpowers' .pi/extensions/superpowers.ts pattern.
// See: ~/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "AIDLC mode";
const SUBAGENT_STOP_TAG = "<SUBAGENT-STOP>";

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

export function messageContainsBootstrap(message: unknown): boolean {
  if (message === null || message === undefined) return false;
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

export default function bootstrapExtension(pi: ExtensionAPI): void {
  // Per-extension flag, NOT module-scope: two pi sessions on the same machine
  // (multi-session extension) must not share injection state.
  let injectBootstrap = true;

  pi.on("session_start", async () => {
    injectBootstrap = true;
  });

  pi.on("session_compact", async () => {
    injectBootstrap = true;
  });

  pi.on("agent_end", async () => {
    injectBootstrap = false;
  });

  pi.on("context", async (event, ctx) => {
    if (!injectBootstrap) return;
    if (event.messages.some(messageContainsBootstrap)) return;

    // cwd lives on pi's ExtensionContext (ctx), NOT on ContextEvent.
    // Reading from event.cwd or process.cwd() is wrong whenever pi's cwd
    // differs from the shell's cwd (multi-project, multi-session, `pi --cwd`).
    const cwd = ctx.cwd;
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
