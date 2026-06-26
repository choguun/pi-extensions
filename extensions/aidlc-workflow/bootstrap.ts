// extensions/aidlc-workflow/bootstrap.ts
// Mirrors superpowers' .pi/extensions/superpowers.ts pattern.
// See: ~/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "aidlc bootstrap";
const SUBAGENT_STOP_TAG = "<SUBAGENT-STOP>";

let injectBootstrap = true;

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