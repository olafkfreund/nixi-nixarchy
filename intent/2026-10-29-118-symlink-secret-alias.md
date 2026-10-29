---
status: approved
issue: 118
author: olafkfreund
---

# Intent: a symlink can't be used to read a fenced secret

## Problem

nixi fences secret paths (`~/.ssh`, `~/.gnupg`, agenix, `.age` files and so on)
from agent reads at every trust level. The fence matches the *literal* path that the
agent names (`bridge/trust-policy.js:125` says so for Claude Read and OpenCode). A
symlink elsewhere, such as `~/notes/k -> ~/.ssh/id_ed25519`, is a path outside the
fence. Whether Claude's or OpenCode's own matching resolves symlinks hasn't been
measured. If neither does, the README's promise that secrets are fenced doesn't hold
for an aliased path.

## Proposed outcome

- Measured on p620: does an agent read a secret through a symlink, at Guide and at
  Mechanic, with Claude and OpenCode?
- If yes, a secret read through an alias is refused, or asks, like the direct path.
  If that can't be enforced, the docs say plainly what the fence covers.

## Affected users and systems

- All trust levels: Claude and OpenCode reads; `bridge/trust-policy.js`, tests,
  README, SECURITY.md.

## Constraints

- Creating the link needs an approved write (Mechanic), or the link already exists.
  Don't over-engineer for a case nixi can't control, but say it.
- No false sense of security: a documented limit beats a partial fence presented as
  complete.

## Open questions

- Can the bridge see the resolved path of a read in time to refuse it? (It sees
  permission requests, but Claude allows Read without asking.) The spec measures
  that first.
