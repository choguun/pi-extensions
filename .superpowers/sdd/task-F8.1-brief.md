## Task F8.1: Copy receiving-code-review skill verbatim

**Files:**
- Create: `extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md`

**Step 1: Copy from superpowers**

```bash
cp ~/.pi/agent/git/github.com/obra/superpowers/skills/receiving-code-review/SKILL.md \
   extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md
```

**Step 2: Verify byte-identical**

Run:
```bash
diff ~/.pi/agent/git/github.com/obra/superpowers/skills/receiving-code-review/SKILL.md \
     extensions/aidlc-workflow/skills/receiving-code-review/SKILL.md
```
Expected: no diff output.

**Step 3: Install symlink**

Run: `bash install.sh 2>&1 | grep receiving`
Expected: see symlink at `~/.pi/agent/skills/receiving-code-review`.

---

