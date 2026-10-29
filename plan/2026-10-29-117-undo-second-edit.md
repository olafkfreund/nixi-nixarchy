---
status: approved
issue: 117
spec: spec/2026-10-29-117-undo-second-edit.md
coders:
  1: codex
  2: codex
reviewers:
  - agy
---

# Plan: /undo works after any edit nixi backed up

## Approved decisions

- A second edit of a file in one turn persists its tool call id (save the manifest).
- `endTurn` sets `after = hashOf(path)` for every entry still `undefined`, and saves
  the manifest for every turn with entries.
- A late completion updates only entries whose `after` is `undefined`.
- Hyprland recovery: `after` is always set, so the "no completion seen" branch and the
  "could not be verified" wording are removed.
- An old manifest with an unknown `after`: undo refuses, and the message names the
  backup directory.
- All-or-nothing and "refuse if changed since" are unchanged.

## Steps

1. **`bridge/changes.js`.**
   - **(a)** `backupOne` `:84-87`: after `existing.ids.push(toolCallId)`, add
     `await saveManifest(turn);`.
   - **(b)** `endTurn` `:164-168`: after `turn = null`, if `done?.entries.length`, then
     for each entry with `after === undefined` set `entry.after = await hashOf(entry.path)`,
     then `await saveManifest(done)`. Keep the existing early return for no Hyprland
     entries after this block.
   - **(c)** `completed` late path `:158`: filter the hit to
     `e.ids?.includes(toolCallId) && e.after === undefined`.
   - **(d)** Hyprland loop `:184-192`: replace the if/else with
     `if (current !== entry.after) continue;`. Remove the `unverified` array and its
     message clause (`:179`, `:191`, `:206`).
   - **(e)** `undo` `:226-229`: when `entry.after === undefined`, return
     `{ ok:false, message: "Not undone: <path> changed since Nixi's edit, or the edit was never confirmed. The backup is in <show(dir)>." }`;
     otherwise compare to `after` as now.

   Update the header comment's undo description in one line. Wrap any `hashOf` error
   in (b) per entry so one unreadable file doesn't skip the rest (leave `after`
   undefined).
   Verify: `cd bridge && node --test`.
   Traps:
   - `endTurn` runs inside `serial`; don't call `serial` recursively.
   - `saveManifest(done)` must run before the Hyprland branch reads entries.
   - Keep `show()` for every path in messages (#42).
2. **`bridge/changes.test.js`.** Add tests:
   - two edits to one file in a turn, then the second completion arrives after
     `endTurn` → `undo` restores the original;
   - an edit with no completion, then `endTurn` → `undo` restores;
   - a file modified after `endTurn` → `undo` refuses;
   - a late completion arriving after a post-turn modification leaves `after`
     unchanged, and `undo` refuses;
   - Hyprland: an entry modified after the turn's end is not restored (use the
     existing `exec` stub pattern in this file);
   - an old manifest (write one by hand with no `after`) → refusal naming the backup
     directory.

   Also check `docs/architecture.md`'s undo paragraph and add one sentence: an edit
   is fixed at the end of the turn, and a user edit during that turn is undone with
   it.
   Verify: `node --test` all green; `nix flake check`.

## Deviations

- **Step 1(a), found by Codex during step 2:** a second edit also resets
  `existing.after` to `undefined`. Without that, a first edit that was already
  confirmed keeps its hash. `endTurn` only fills `undefined`, so after a late or missing
  second completion the file never matches and `/undo` refuses. The spec's rejected
  alternative ("reset after on a second edit … step 2 sets it at turn end anyway") was
  wrong for exactly that reason. A test was added.

## Tests

- `cd bridge && node --test`; `nix flake check`.

## Rollback

Revert the merge commit. Manifests written by the new code are readable by the old
(the same fields).
