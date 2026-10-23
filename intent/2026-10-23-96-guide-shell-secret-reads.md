---
status: draft
issue: 96
author: olafkfreund
---

# Intent: Secret files stay protected from shell commands too

## Problem

nixi promises that at **Guide** the agent cannot act on the machine and cannot read secrets, and
that at **Mechanic** reading a secret needs the user's explicit OK. Both promises rest on
`bridge/trust-policy.js`:

- `SECRET_PATHS` (`~/.ssh/**`, `~/.aws/**`, `**/.env`, `**/*.age`, …) is turned into permission
  rules, `SECRET_READS`, but only for the **Read, Grep and Glob** tools.
- Guide's guarantee is that the bridge cancels every permission request.

A live check (#95 P1, through the snowflake companion and nixi's real bridge) showed both can be
bypassed with the shell:

- At Guide, asked to read the canary `~/nixi-p1-canary.age`, the agent ran
  `ls -la ~/nixi-p1-canary.age && head -c 200 … | od -c` and returned the contents. There was
  no card and no cancel.
- Claude Code approves read-only shell commands (`ls`, `cat`, `head`, …) itself, even in plan
  mode. They never become a permission request, so the bridge's cancel never runs.
- A second canary under `~/.config/op/` was refused, but by the model's own judgement
  ("credential exploration"). That is not a guarantee nixi can make.

The same path is very likely open at Mechanic for read-only commands.

Whoever relies on Guide (a newcomer, the voice companion, #95's session summaries that feed
other sessions' output to the agent) gets a weaker guarantee than the product states.

## Proposed outcome

- At **Guide**, no shell command can read a file under `SECRET_PATHS`, and no shell command runs
  without a cancellable permission request at all. Guide stays able to answer from the manual and
  with the Read/Grep/Glob tools, whose secret rules already exist.
- At **Mechanic**, a shell command that names a secret path asks first, just as the Read tool
  does today. Other read-only commands behave as now.
- A test fails today and passes after the fix for: a Guide shell read of a secret path, a Guide
  shell read of an ordinary path, and a Mechanic shell read of a secret path. Each is checked at
  the level the bridge controls, plus the live canary check through the companion.
- Docs (`docs/architecture.md`, README "Trust") say exactly what Guide and Mechanic guarantee for
  the shell.

## Affected users and systems

- nixi: `bridge/trust-policy.js` and its tests, possibly `bridge/bridge.js` (session options),
  `docs/architecture.md`, README.
- Every nixi user, through the card and the companion. Guide's behaviour narrows (no shell);
  Mechanic adds asks for secret paths.

## Constraints

- No regression in what Guide can answer from the manual and the Read tools. If Guide loses the
  shell, the tutor brief (`share/CLAUDE.md`) must stop telling the agent to use it there.
- Claude only first, where the gap was measured. Codex and opencode have different permission
  models, and their Guide behaviour gets checked and recorded. They are fixed in this issue only
  if the same gap is shown.
- No reliance on the model refusing. The guarantee must come from rules or the bridge.
- The user's own `~/.claude/settings.json` rules keep working (nixi uses `settingSources:
  ["user"]`).

## Open questions

1. **Guide and the shell:** turn the shell off entirely at Guide (simplest, strongest; Guide
   answers from the manual and the Read tools), or allow a short list of harmless read-only
   commands that can't take a path argument?
2. **How to stop Claude's auto-approval:** a `deny` rule for Bash at Guide, a session option, or
   both? (The spec will check what claude-agent-acp honours, by measurement.)
3. **Mechanic:** ask rules for shell commands that mention secret paths (pattern-based, best
   effort), or ask for *every* shell command at Mechanic? The second removes the gap but adds
   cards.
