---
status: approved
issue: 63
author: olafkfreund
---

# Intent: Close #63 for the two adapters it never examined

## Problem

#63 was filed against Claude Code: the bridge starts the agent with
`cwd = ~/.config/nixi` (`bridge/bridge.js:42-45`), that directory is unmanaged,
and Claude Code reads project-level settings and `PreToolUse` hooks from its
working directory. One approved write there let the agent grant itself standing
permissions.

#66 fixed that, for Claude, by sending `settingSources: ["user"]` -- removing
the capability rather than policing the path.

Nixi ships three adapters. **Codex and OpenCode were never examined.** The same
question has never been asked of them:

- Does `codex-acp` read any configuration from `cwd`?
- Does `opencode` read project-level config from `cwd` that could override the
  permissions Nixi sends via `OPENCODE_CONFIG_CONTENT`?

Until that is answered, #66 closed one third of the issue and the issue reads as
though it closed all of it. That is worse than an open issue, because it looks
finished.

## Proposed outcome

The question is answered for both adapters, empirically against the real CLIs
rather than by reading alone, and:

- where a capability is exposed and can be removed from outside, it is removed,
  the same way #66 removed Claude's;
- where it is exposed and cannot be removed from outside, that is stated plainly
  with its evidence, rather than patched with something that looks like coverage;
- where it is not exposed, the negative result is recorded with the evidence that
  establishes it.

A negative result properly established closes this issue. A fix is not the only
acceptable answer -- an unexamined adapter is.

## Affected users and systems

`bridge/bridge.js` (adapter launch), `bridge/trust-policy.js`
(`opencodePermissions`), and anyone running Nixi with `NIXI_AGENT=codex` or
`NIXI_AGENT=opencode`. Guide users most of all: Guide's safety guarantee is
that the bridge cancels every permission request it receives, which is worth
nothing for an operation that never produces a request.

## Constraints

- Must not weaken what the **person** configured. #66's rule holds: constrain
  what the agent can do to itself, leave the user's own global config alone.
- Must not invent a config key that silently fails to match. A rule that does
  not bind looks like coverage while providing none, which is worse than an
  honest gap.
- Claims must be verified against the real CLI where a CLI can verify them, and
  anything only read must be labelled as read rather than proved.

## Open questions

None for the approver. The investigation's result decides the shape of the fix,
and the constraint above already says what to do with each possible result.
