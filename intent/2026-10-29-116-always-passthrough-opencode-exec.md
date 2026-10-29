---
status: approved
issue: 116
author: olafkfreund
---

# Intent: no standing "yes" leaks past nixi's trust model

## Problem

The 2026-10-29 cross-model review found two ways a standing permission escapes
the rules nixi promises (README "Trust", SECURITY.md).

1. **"Always" for requests nixi won't remember.** The card hides "always" only for
   edits, herdr writes and chained commands (`bridge/bridge.js:400-407`). For a shell
   command that `rememberable()` rejects (a secret path, another working directory)
   or a read of a secret path, the button still shows. Clicking it forwards
   `allow_always` to the adapter (`:650-659`). Claude then keeps its own rule, which
   can be a wildcard, for the rest of the session, and `/always` can't see or revoke it.
2. **OpenCode can write the paths that run code unattended.** Claude's agent writes
   to systemd user units, Omarchy hooks, extensions and plugins, `~/.local/bin/nixi-*`
   and `~/.claude` settings and hooks are *denied* (`EXEC_WRITE_PATHS`). For OpenCode
   they are only "ask" (`bridge/trust-policy.js:73`), and YOLO answers "ask" with yes.
   An OpenCode agent in YOLO could install a systemd unit. This isn't documented as
   a residual.

## Proposed outcome

- The card never offers "always" for something nixi will not keep in its own store
  (shell commands), except the non-shell kinds #114 deliberately left alone
  (fetch, MCP tools).
- A secret read is never answered "always" by anyone.
- OpenCode is denied writes to the same unattended-execution paths as Claude, in
  every mode including YOLO.

## Affected users and systems

- Mechanic and YOLO users of Claude and OpenCode. Codex can't be fenced from paths
  (#97), so it's unchanged.
- `bridge/bridge.js`, `bridge/trust-policy.js`, tests, SECURITY.md.

## Constraints

- No widening anywhere. Guide is unchanged.
- #114's decision stands: non-shell kinds keep forwarding `allow_always` unless the
  spec finds one that reaches a secret.
- OpenCode's pattern syntax isn't Claude's: the spec must map each path and test it.

## Open questions

- For a non-rememberable shell command: hide "always", or show it and answer once?
  Hiding is clearer; the spec will propose that.
