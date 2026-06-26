// extensions/aidlc-workflow/bootstrap.ts
// Mirrors superpowers' .pi/extensions/superpowers.ts pattern.
// See: ~/.pi/agent/git/github.com/obra/superpowers/.pi/extensions/superpowers.ts

const EXTREMELY_IMPORTANT_MARKER = "<EXTREMELY_IMPORTANT>";
const BOOTSTRAP_MARKER = "aidlc bootstrap";
const SUBAGENT_STOP_TAG = "<SUBAGENT-STOP>";

let injectBootstrap = true;