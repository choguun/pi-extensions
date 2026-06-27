// extensions/aidlc-workflow/test/evals/harness.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrontmatter, parseVerdict } from "./harness.ts";

test("parseFrontmatter extracts name, setup, expected_behavior, judge_prompt", () => {
  const content = `---
name: test-scenario
setup: |
  You are an agent.
expected_behavior: |
  Do the right thing.
judge_prompt: |
  Did the LLM do the right thing?
---

[markdown body]
`;
  const result = parseFrontmatter(content);
  // F12.2 polish — narrow the union for TS. In a happy-path test we
  // expect a Scenario, not an error.
  assert.ok(!("error" in result), `expected Scenario, got error: ${JSON.stringify(result)}`);
  const s = result;
  assert.equal(s.name, "test-scenario");
  assert.match(s.setup!, /You are an agent\./);
  assert.match(s.expected_behavior!, /Do the right thing\./);
  assert.match(s.judge_prompt!, /Did the LLM do the right thing\?/);
});

test("parseFrontmatter strips YAML `|` block-scalar indicator from value", () => {
  // F12.2 polish — the `|` block-scalar indicator on a multi-line
  // value should be stripped, not included in the parsed string. The
  // previous parser kept the `|` as the first character, which leaked
  // into downstream consumers (e.g., LLM prompts started with `|`).
  const content = `---
name: pipe-test
setup: |
  First line of setup.
expected_behavior: |
  First line of behavior.
judge_prompt: |
  First line of judge.
---
`;
  const result = parseFrontmatter(content);
  assert.ok(!("error" in result), `expected Scenario, got error: ${JSON.stringify(result)}`);
  const s = result;
  assert.ok(!s.setup!.startsWith("|"), `setup should not start with "|", got: ${JSON.stringify(s.setup)}`);
  assert.ok(!s.expected_behavior!.startsWith("|"), `expected_behavior should not start with "|", got: ${JSON.stringify(s.expected_behavior)}`);
  assert.ok(!s.judge_prompt!.startsWith("|"), `judge_prompt should not start with "|", got: ${JSON.stringify(s.judge_prompt)}`);
  // Body content is preserved.
  assert.match(s.setup!, /First line of setup\./);
  assert.match(s.expected_behavior!, /First line of behavior\./);
  assert.match(s.judge_prompt!, /First line of judge\./);
});

// F12.2 polish — schema validation. parseFrontmatter now returns either
// a valid Scenario or an `{ error: string }` discriminator so callers
// can fail fast on malformed scenarios instead of getting back a
// half-populated Scenario object.

test("parseFrontmatter returns Scenario with all required fields when present", () => {
  const content = `---
name: full-scenario
setup: Do the thing.
expected_behavior: It should work.
judge_prompt: Did it work?
---
`;
  const s = parseFrontmatter(content);
  assert.ok(!("error" in s), `expected Scenario, got error: ${JSON.stringify(s)}`);
  assert.equal(s.name, "full-scenario");
  assert.equal(s.setup, "Do the thing.");
  assert.equal(s.expected_behavior, "It should work.");
  assert.equal(s.judge_prompt, "Did it work?");
});

test("parseFrontmatter returns { error } when a required field is missing", () => {
  const content = `---
name: missing-setup
expected_behavior: Has expected.
judge_prompt: Has judge.
---
`;
  const result = parseFrontmatter(content);
  assert.ok("error" in result, `expected { error }, got: ${JSON.stringify(result)}`);
  assert.match(result.error, /Missing required field/i);
  assert.match(result.error, /setup/);
});

test("parseFrontmatter returns { error } when an unknown field is present", () => {
  const content = `---
name: has-extra
setup: Has setup.
expected_behavior: Has expected.
judge_prompt: Has judge.
mystery_field: surprise!
---
`;
  const result = parseFrontmatter(content);
  assert.ok("error" in result, `expected { error }, got: ${JSON.stringify(result)}`);
  assert.match(result.error, /Unknown key/i);
  assert.match(result.error, /mystery_field/);
});

test("parseFrontmatter returns { error } when multiple required fields missing (first-missing wins)", () => {
  // F12.2 polish — implementation returns the FIRST missing field
  // (fail-fast on the first error), not a list of all missing fields.
  // Subsequent missing fields surface after the first is fixed.
  const content = `---
name: only-name
---
`;
  const result = parseFrontmatter(content);
  assert.ok("error" in result, `expected { error }, got: ${JSON.stringify(result)}`);
  // Per the brief's iteration order: name → setup → expected_behavior →
  // judge_prompt. Only `name` is present, so `setup` is the first missing.
  assert.match(result.error, /Missing required field/i);
  assert.match(result.error, /setup/);
});

test("parseFrontmatter returns { error } when no frontmatter block at all", () => {
  const content = `Just plain text, no YAML.`;
  const result = parseFrontmatter(content);
  assert.ok("error" in result, `expected { error }, got: ${JSON.stringify(result)}`);
  assert.match(result.error, /frontmatter|---/i);
});

test("parseVerdict returns 'pass' when only pass signals present", () => {
  assert.equal(parseVerdict("The LLM passed all checks. PASS"), "pass");
  assert.equal(parseVerdict("Yes, compliant with the spec."), "pass");
});

test("parseVerdict returns 'fail' when only fail signals present", () => {
  assert.equal(parseVerdict("The LLM failed to invoke. FAIL"), "fail");
  assert.equal(parseVerdict("No, not compliant."), "fail");
});

test("parseVerdict returns 'ambiguous' when both signals present", () => {
  assert.equal(parseVerdict("It passed but also failed in some way. PASS FAIL"), "ambiguous");
});

test("parseVerdict returns 'ambiguous' when neither signal present", () => {
  assert.equal(parseVerdict("The LLM did some things but I cannot tell."), "ambiguous");
});

test("parseVerdict is case-insensitive", () => {
  assert.equal(parseVerdict("PASS"), "pass");
  assert.equal(parseVerdict("pass"), "pass");
  assert.equal(parseVerdict("FAIL"), "fail");
  assert.equal(parseVerdict("fail"), "fail");
});

test("parseVerdict handles 'non-compliant' and 'incorrect' as fail signals", () => {
  assert.equal(parseVerdict("The behavior was non-compliant."), "fail");
  assert.equal(parseVerdict("That is incorrect."), "fail");
});