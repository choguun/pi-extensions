# AIDLC workflow tests

Six test files, 65 tests total. All run with Node 24+'s built-in TypeScript stripping — no build step, no `tsc` invocation, no `ts-node`.

```
test/
├── smoke.test.ts       # 9 end-to-end tests: extension loads, registers tool + commands, status/start/verify actions work
├── parser.test.ts      # 2 unit tests: state.md parser handles all 6 fields
├── classifier.test.ts  # 20 unit tests: PR comment classifier routes to the right phase + priority
├── branch.test.ts      # 5 unit tests: detectDefaultBranch handles main/master/trunk/develop/gh-pages
├── substrate.test.ts   # 18 unit tests: signal I/O, dedup, LOG.md append
└── worktree.test.ts    # 11 unit tests: shellQuote safety, worktree bootstrap, env-file carryover, APFS clone
```

## Run

```bash
# All tests + typecheck
npm test

# Just smoke
npm run test:smoke

# Just parser
npm run test:parser

# Just classifier
npm run test:classifier

# Just branch
npm run test:branch

# Just substrate
npm run test:substrate

# Or directly with node (no npm script required)
node --experimental-strip-types --test test/smoke.test.ts
node --experimental-strip-types --test test/parser.test.ts
node --experimental-strip-types --test test/classifier.test.ts
node --experimental-strip-types --test test/branch.test.ts
node --experimental-strip-types --test test/substrate.test.ts
```

## What each file covers

### `smoke.test.ts` — extension integration

Verifies the extension actually loads in a Node process and the registered tools work:

- `extension loads and registers the `aidlc` tool` — confirms `index.ts` parses and runs
- `extension registers 7 slash commands` — confirms `pi.registerCommand` is called for each
- `/aidlc status reads .aidlc/state.md from the cwd` — creates a fake git repo + state.md, runs `status`, asserts the output
- `/aidlc status handles missing state.md gracefully` — runs `status` with no state.md, asserts it reports `not_started`
- `/aidlc classify-comments handles no PR gracefully` — no PR → error message, not a crash
- `/aidlc start creates a branch and draft PR state` — verifies the bootstrap flow writes state.md with the right phase
- `slash command handlers invoke the matching skill via sendUserMessage` — confirms the handler calls `ctx.sendUserMessage` (which is what actually triggers the skill; the return value is discarded by pi)

The smoke test creates real git repos in `os.tmpdir()` with `mkdtempSync`. Cleanup is best-effort via `try/finally`.

### `parser.test.ts` — state.md parser

Unit test for the `parseState` function. Two cases:
- A complete state file with all 6 fields → all parsed
- An empty state file → defaults preserved

### `classifier.test.ts` — PR comment routing

20 tests covering all the major routing rules:
- P0 routes (race condition, null pointer, memory leak, SQL injection, CVE)
- P1 routes (failing test, build broken, missing coverage, scope creep, missing acceptance criterion)
- P2 routes (typo, refactor suggestion)
- Review-bot digests (cubic-dev-ai, etc.) — both with specific issue types and the generic "no issues found" case
- Edge cases (empty comment, mixed keywords)

### `branch.test.ts` — `detectDefaultBranch`

5 tests that create real git repos and verify the function picks the right default branch in each scenario:
- No remote set, on `master` → returns `master`
- Remote set, on a feature branch, default `main` → returns `main`
- Same, default `trunk` → returns `trunk`
- Same, default `develop` → returns `develop`
- `gh-pages` style repo → returns `gh-pages`

The point: the start action creates the feature branch *from* the default branch. If we hardcode "main" and the repo uses "trunk", the branch is created from the wrong ancestor.

### `substrate.test.ts` — knowledge-base I/O

6 unit tests for the I/O primitives that back the loop-engineer fusion:
- `parseSignal` extracts frontmatter (kind, category, frequency, sources, domain, status, phase, priority), body, and `## Timeline` entries
- Handles empty Timeline (no entries yet)
- Signal dedup: 3 PR comments hitting the same slug → 1 signal with `frequency: 3`
- LOG.md append: first entry has no leading blank; subsequent entries do
- Domain scaffold validation: README.md + `.aidlc/state.md` both required

## Why `--experimental-strip-types`?

Node 24+ can run TypeScript files directly without a build step (`tsc`, `ts-node`, `esbuild`). We pass `--experimental-strip-types` to enable it. This means:
- No `dist/` directory to manage
- No `tsconfig.json` build target
- No `tsc` watching

It's the same pattern `tsx` uses, built into Node.

## Adding a new test

Drop a new `*.test.ts` file in `test/`. Add it to the `test` script in `package.json`:

```json
"test": "npm run typecheck && node --test test/smoke.test.ts test/parser.test.ts test/classifier.test.ts test/branch.test.ts test/<your-new-test>.ts"
```

Use `node:test` and `node:assert/strict` — no extra deps needed.

## When tests fail

Run the failing test alone:

```bash
node --experimental-strip-types --test test/<failing-file>.test.ts
```

If typecheck fails (e.g. you changed an interface in `index.ts`):

```bash
npm run typecheck
```

The error usually points at the function signature or a field name. Fix the source, the test will pass on the next run.