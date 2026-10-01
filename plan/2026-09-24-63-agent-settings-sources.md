---
status: approved
issue: 63
spec: spec/2026-09-24-63-agent-settings-sources.md
---

# Plan: The agent must not be able to rewrite the rules that govern it

Approved: `settingSources: ["user"]` in the Claude `newSession` meta. `user`
rather than `[]` so the person's own configuration survives. No write-side deny
-- redundant once the source is not read, and a denylist of one.

Measured before writing this, not inferred:

| | default sources | `--setting-sources user` |
|---|---|---|
| `CLAUDE.md` tutor brief | loaded | **still loaded** |
| project `.claude/settings.json` | **honoured** | not honoured |

## Steps

1. `bridge/bridge.js:255-265`: add `settingSources: ["user"]` to the
   `claudeCode.options` object, beside `settings`.
   -> verify by step 2.
2. `bridge/trust-policy.test.js`: assert via `runBridge` that the Claude
   `newSession` meta carries `settingSources: ["user"]`, and that Codex and
   OpenCode receive no `claudeCode` meta at all (they already assert the
   latter; extend rather than duplicate).
3. Break it and watch the assertion fire.

## Tests

```bash
node --test bridge/*.test.js
nix flake check --print-build-logs
```

Runtime, not run: with the card running, a `~/.config/nixi/.claude/settings.json`
granting a permission must have no effect, and the tutor must still answer from
`CLAUDE.md`.

## Known gap, not implied to be done

**Codex and OpenCode are not covered.** This closes the Claude path only. Their
adapters take different options and were not examined, and the #52 enumeration's
lesson was that fixing one instance invites the next. Recorded on #63 as a
follow-up rather than left to look finished.

## Rollback

`git revert`. One key in one object; nothing persisted, nothing migrated. After
a revert the agent's project settings load again, which is the old behaviour.
