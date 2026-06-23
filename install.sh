#!/bin/bash
# Install script for the pi-extensions repo.
# Symlinks extensions, agents, skills, and commands into ~/.pi/agent/.
# Run from the repo root: ./install.sh
#
# Each extension under extensions/<name>/ gets symlinked to
# ~/.pi/agent/extensions/<name>. Extensions that ship agents/ and skills/
# subfolders get those symlinked too. A standalone commands.md inside the
# extension folder is exposed as a fallback skill at
# ~/.pi/agent/skills/<name>-commands/SKILL.md so the workflow remains
# usable even if the TypeScript extension fails to load.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
EXTENSIONS_DIR="$REPO_ROOT/extensions"
AGENT_DIR="$HOME/.pi/agent"
EXT_DST_DIR="$AGENT_DIR/extensions"
AGENTS_DST="$AGENT_DIR/agents"
SKILLS_DST="$AGENT_DIR/skills"

if [ ! -d "$EXTENSIONS_DIR" ]; then
	echo "Error: $EXTENSIONS_DIR does not exist. Run from $REPO_ROOT." >&2
	exit 1
fi

# Track which extensions we've installed for the verification step.
INSTALLED_EXTENSIONS=()

# -----------------------------------------------------------------------------
# Per-extension install.
# -----------------------------------------------------------------------------

for EXT_SRC in "$EXTENSIONS_DIR"/*/; do
	name=$(basename "$EXT_SRC")
	[ "$name" = "node_modules" ] && continue

	EXT_DST="$EXT_DST_DIR/$name"
	AGENTS_SRC="$EXT_SRC/agents"
	SKILLS_SRC="$EXT_SRC/skills"
	COMMANDS_SRC="$EXT_SRC/commands.md"

	echo "→ Extension: $name → $EXT_DST"
	mkdir -p "$(dirname "$EXT_DST")"
	ln -sfn "$EXT_SRC" "$EXT_DST"

	# Agents (optional).
	if [ -d "$AGENTS_SRC" ]; then
		echo "  → Agents in $AGENTS_DST"
		mkdir -p "$AGENTS_DST"
		for f in "$AGENTS_SRC"/*.md; do
			[ -f "$f" ] || continue
			agent_name=$(basename "$f")
			ln -sfn "$f" "$AGENTS_DST/$agent_name"
			echo "    $agent_name"
		done
	fi

	# Skills (optional).
	if [ -d "$SKILLS_SRC" ]; then
		echo "  → Skills in $SKILLS_DST"
		mkdir -p "$SKILLS_DST"
		for skill in "$SKILLS_SRC"/*/; do
			[ -d "$skill" ] || continue
			skill_name=$(basename "$skill")
			mkdir -p "$SKILLS_DST/$skill_name"
			ln -sfn "$skill/SKILL.md" "$SKILLS_DST/$skill_name/SKILL.md"
			echo "    $skill_name"
		done
	fi

	# Standalone commands.md as a fallback skill (optional).
	if [ -f "$COMMANDS_SRC" ]; then
		echo "  → commands.md (standalone fallback)"
		mkdir -p "$SKILLS_DST/${name}-commands"
		ln -sfn "$COMMANDS_SRC" "$SKILLS_DST/${name}-commands/SKILL.md"
	fi

	INSTALLED_EXTENSIONS+=("$name")
	echo ""
done

# -----------------------------------------------------------------------------
# Verification.
# -----------------------------------------------------------------------------

echo "Verification:"
for name in "${INSTALLED_EXTENSIONS[@]}"; do
	if [ -L "$EXT_DST_DIR/$name" ]; then
		echo "  ✓ $EXT_DST_DIR/$name → $(readlink "$EXT_DST_DIR/$name")"
	else
		echo "  ✗ $EXT_DST_DIR/$name (not a symlink!)"
	fi
done

echo ""
echo "Install complete. Restart pi to pick up the new extensions."

echo ""
echo "Quick start:"
echo "  AIDLC workflow:"
echo "    > /aidlc start \"<feature>\"    # creates branch + draft PR"
echo "    > /specify                     # write the spec"
echo "    > /plan                        # break spec into tasks"
echo "    > /implement T-001             # one task at a time, TDD"
echo "    > /test                        # run the test suite"
echo "    > /review                      # five-axis review + read PR comments"
echo "    > /ship                        # merge the PR"
echo ""
echo "  Multi-session:"
echo "    > /who                         # show this session's id, name, cwd"
echo "    > /sessions                    # list other live pi sessions"
echo "    > /send <ref> <message...>     # deliver a task to another session"
echo "    Then in the LLM:"
echo "    > Use the pi_sessions and pi_send tools to delegate across sessions."
