#!/bin/bash
# Install script for the AIDLC workflow extension.
# Symlinks the extension, agents, skills, and commands into ~/.pi/agent/.
# Run from the pi-extensions repo root: ./install.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT_SRC="$REPO_ROOT/extensions/aidlc-workflow"
EXT_DST="$HOME/.pi/agent/extensions/aidlc-workflow"
AGENTS_SRC="$EXT_SRC/agents"
AGENTS_DST="$HOME/.pi/agent/agents"
SKILLS_SRC="$EXT_SRC/skills"
SKILLS_DST="$HOME/.pi/agent/skills"
COMMANDS_DST="$HOME/.pi/agent/skills"

if [ ! -d "$EXT_SRC" ]; then
  echo "Error: $EXT_SRC does not exist. Run from $REPO_ROOT." >&2
  exit 1
fi

# 1. Symlink the extension directory.
echo "→ $EXT_DST"
mkdir -p "$(dirname "$EXT_DST")"
ln -sfn "$EXT_SRC" "$EXT_DST"

# 2. Symlink each agent.
echo "→ Agents in $AGENTS_DST"
mkdir -p "$AGENTS_DST"
for f in "$AGENTS_SRC"/*.md; do
  name=$(basename "$f")
  ln -sfn "$f" "$AGENTS_DST/$name"
  echo "    $name"
done

# 3. Symlink each skill.
echo "→ Skills in $SKILLS_DST"
mkdir -p "$SKILLS_DST"
for skill in "$SKILLS_SRC"/*/; do
  name=$(basename "$skill")
  mkdir -p "$SKILLS_DST/$name"
  ln -sfn "$skill/SKILL.md" "$SKILLS_DST/$name/SKILL.md"
  echo "    $name"
done

# 4. Symlink the standalone commands skill (decoupled from the TS extension).
#    Loads the same workflow as the TS-registered commands, but works even
#    if the TypeScript extension can't load (e.g. missing deps, wrong Node).
echo "→ commands.md (standalone)"
mkdir -p "$SKILLS_DST/aidlc-commands"
ln -sfn "$EXT_SRC/commands.md" "$SKILLS_DST/aidlc-commands/SKILL.md"

# 5. Verify.
echo ""
echo "Verification:"
ls -la "$EXT_DST" 2>&1 | head -2
ls -la "$AGENTS_DST" | grep "aidlc\|spec-writer\|planner\|implementer\|reviewer\|pr-feedback\|shipper" 2>&1 | head -10
ls -la "$SKILLS_DST" | grep "aidlc\|specify\|plan\|implement\|test\|review\|ship\|state" 2>&1 | head -10

echo ""
echo "Install complete. Restart pi to pick up the new extension."
echo ""
echo "Quick start:"
echo "  > /aidlc start \"<feature>\"    # creates branch + draft PR"
echo "  > /specify                     # write the spec"
echo "  > /plan                        # break spec into tasks"
echo "  > /implement T-001             # one task at a time, TDD"
echo "  > /test                        # run the test suite"
echo "  > /review                      # five-axis review + read PR comments"
echo "  > /ship                        # merge the PR"
