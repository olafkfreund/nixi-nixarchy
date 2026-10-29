---
status: approved
issue: 117
author: olafkfreund
---

# Intent: /undo works after any edit nixi backed up

## Problem

`/undo` restores the files an agent changed in a turn, but only if nothing changed
since. Two paths make it refuse forever ("changed since Nixi's edit"), even though
nobody touched the file (`bridge/changes.js`):

- **A second edit of the same file in one turn** records its tool call only in
  memory (`:84-87`). If its completion arrives late, after the turn closed, it's
  lost, and the stored "after" hash is the first edit's.
- **An edit whose completion never arrives** (the turn is cancelled, or the adapter
  omits it) leaves "after" unknown. Undo then compares the file to the *before* hash
  (`:226`), which an edited file can never match.

Codex also flagged the related case where the Hyprland recovery path restores an
unverified entry, and could overwrite a later user edit (`:183`).

## Proposed outcome

- `/undo` restores a turn whose files hold exactly the agent's last edit, including
  repeated edits and late or missing completions.
- `/undo` and automatic recovery still never overwrite a change made after the
  agent's edit. When nixi can't tell, it refuses and says where the backup is.

## Affected users and systems

- Mechanic users who let agents edit files: `bridge/changes.js` and its tests.

## Constraints

- Keep all-or-nothing and "refuse if changed since".
- Never restore over bytes nixi can't attribute to the agent.

## Open questions

- With a missing completion, is "the file differs from before" enough to treat the
  current bytes as the agent's edit? It isn't safe if the user edited too. The spec
  decides.
