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
  const s = parseFrontmatter(content);
  assert.equal(s.name, "test-scenario");
  assert.match(s.setup!, /You are an agent\./);
  assert.match(s.expected_behavior!, /Do the right thing\./);
  assert.match(s.judge_prompt!, /Did the LLM do the right thing\?/);
});

test("parseFrontmatter returns empty object on malformed YAML (no frontmatter)", () => {
  const content = `No frontmatter here. Just plain text.`;
  const s = parseFrontmatter(content);
  assert.deepEqual(s, {});
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