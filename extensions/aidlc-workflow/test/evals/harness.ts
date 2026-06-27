// extensions/aidlc-workflow/test/evals/harness.ts
// Minimal drill harness — LLM-as-judge runner, self-contained, no external deps.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Scenario {
  name: string;
  setup: string;
  expected_behavior: string;
  judge_prompt: string;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  reasoning: string;
  status: "pass" | "fail" | "ambiguous" | "error";
  error?: string;
}

export function parseFrontmatter(content: string): Scenario | { error: string } {
  // Match YAML frontmatter between --- markers
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { error: "No YAML frontmatter found (expected --- ... --- block at start)" };

  const yaml = match[1];
  const result: Record<string, string> = {};

  // Parse each YAML key: value
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentValue: string[] = [];

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey) {
        let value = currentValue.join("\n").trim();
        // F12.2 polish — strip YAML `|` block-scalar indicator if it
        // leaked into the first value line. With `setup: |`, the
        // first captured value is literally `"|"`. Without this
        // strip, downstream consumers see a leading `|` in the
        // parsed text, which leaks into LLM prompts.
        if (value.startsWith("|")) {
          value = value.slice(1).trim();
        }
        result[currentKey] = value;
      }
      currentKey = kvMatch[1];
      currentValue = kvMatch[2] ? [kvMatch[2]] : [];
    } else if (currentKey && line.startsWith("  ")) {
      // Continuation line
      currentValue.push(line.trim());
    }
  }
  if (currentKey) {
    let value = currentValue.join("\n").trim();
    if (value.startsWith("|")) {
      value = value.slice(1).trim();
    }
    result[currentKey] = value;
  }

  // ---- Schema validation (F12.2 polish) ----
  // Reject unknown keys first — typo guard. A scenario with an
  // unknown key is almost certainly wrong (the 4 required fields
  // are exhaustive), and silently keeping it would let typos like
  // `expected_behavoir` pass through.
  const REQUIRED_FIELDS = ["name", "setup", "expected_behavior", "judge_prompt"] as const;
  for (const key of Object.keys(result)) {
    if (!(REQUIRED_FIELDS as readonly string[]).includes(key)) {
      return { error: `Unknown key: ${key}` };
    }
  }
  // Then enforce that every required field is present.
  for (const key of REQUIRED_FIELDS) {
    if (!(key in result)) {
      return { error: `Missing required field: ${key}` };
    }
  }

  return result as unknown as Scenario;
}

export function parseVerdict(judgeResponse: string): "pass" | "fail" | "ambiguous" {
  // "compliant" counts as a pass signal only when NOT part of "not compliant" or "non-compliant"
  const passMatches = judgeResponse.match(/(?<!\bnot )(?<!\bnon-)\b(pass|yes|compliant)\b/gi) ?? [];
  const failMatches = judgeResponse.match(/\b(fail|no|non.compliant|incorrect)\b/gi) ?? [];

  if (passMatches.length > 0 && failMatches.length === 0) return "pass";
  if (failMatches.length > 0 && passMatches.length === 0) return "fail";
  return "ambiguous";
}

export async function runScenario(
  scenarioPath: string,
  llmInvoke: (prompt: string) => Promise<string>
): Promise<ScenarioResult> {
  const name = scenarioPath.split("/").pop() ?? scenarioPath;

  try {
    if (!existsSync(scenarioPath)) {
      return { name, passed: false, reasoning: "", status: "error", error: "Scenario file not found" };
    }

    const content = readFileSync(scenarioPath, "utf8");
    const scenario = parseFrontmatter(content);

    // F12.2 polish — parseFrontmatter now returns Scenario | { error }.
    // Fail fast with a clear error rather than trying to use a
    // half-populated Scenario object.
    if ("error" in scenario) {
      return { name, passed: false, reasoning: "", status: "error", error: scenario.error };
    }

    // Step 1: Send setup to LLM
    const llmResponse = await llmInvoke(scenario.setup);

    // Step 2: Send judge_prompt + LLM response to LLM judge
    const judgePrompt = `${scenario.judge_prompt}\n\nLLM response:\n${llmResponse}`;
    const judgeVerdict = await llmInvoke(judgePrompt);

    // Step 3: Parse verdict
    const verdict = parseVerdict(judgeVerdict);
    const passed = verdict === "pass";

    return { name: scenario.name, passed, reasoning: judgeVerdict, status: verdict };
  } catch (err) {
    return { name, passed: false, reasoning: "", status: "error", error: String(err) };
  }
}

export async function runAllScenarios(
  scenariosDir: string,
  llmInvoke: (prompt: string) => Promise<string>
): Promise<{ passed: number; failed: number; errored: number; results: ScenarioResult[] }> {
  if (!existsSync(scenariosDir)) {
    return { passed: 0, failed: 0, errored: 0, results: [] };
  }

  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".yaml"));
  const results: ScenarioResult[] = [];

  for (const f of files) {
    const r = await runScenario(join(scenariosDir, f), llmInvoke);
    results.push(r);
  }

  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => r.status === "fail" || r.status === "ambiguous").length,
    errored: results.filter((r) => r.status === "error").length,
    results,
  };
}

// CLI entry point
async function main() {
  const scenariosDir = process.argv[2] || "test/evals/scenarios";

  // Stub LLM invoker — replace with real LLM API call for actual evals
  const llmInvoke = async (prompt: string): Promise<string> => {
    console.error(`[stub] Would invoke LLM with: ${prompt.slice(0, 100)}...`);
    return "STUB_RESPONSE — replace with real LLM API call";
  };

  const result = await runAllScenarios(scenariosDir, llmInvoke);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errored > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}