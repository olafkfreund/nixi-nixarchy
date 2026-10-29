---
status: draft
issue: 117
intent: intent/2026-10-29-117-undo-second-edit.md
---

# Spec: /undo works after any edit nixi backed up

## Design

All changes are in `bridge/changes.js`.

1. **A second edit is persisted.** In `backupOne` (`:84-87`), when the file is already
   in this turn, push the tool call id **and** `await saveManifest(turn)`. A late
   completion then finds the id on disk.
2. **Every entry gets an "after" when the turn ends.** At the start of `endTurn`
   (`:164`), before the Hyprland check, every entry of the closing turn with
   `after === undefined` gets `after = await hashOf(entry.path)`, and the manifest is
   saved for every turn with entries, not only Hyprland ones.

   The turn has ended, so every tool the agent ran in it has run. The bytes on disk
   now are the agent's last edit, plus at most what the user changed *during* the
   turn: the same window a completion event already has today.

   *Decided (intent open question):* nixi doesn't guess from "differs from before" at
   undo time. It fixes "after" at turn end, the last moment it can be attributed to
   the agent. A file still equal to `before` gets `after = before` (the agent didn't
   write it), and undo restores nothing harmful.
3. **A late completion never overwrites a turn-end hash.** In `completed`'s
   late-manifest path (`:153-161`), only entries with `after === undefined` are
   updated. With step 2 that is only manifests written before this change. A
   completion arriving minutes later would otherwise record a later user edit as
   the agent's.
4. **Hyprland recovery uses the verified "after".** With step 2, `entry.after` is
   always set when `endTurn`'s Hyprland check runs. Its "no completion seen" branch
   (`:188-192`) and the "could not be verified" wording go. A file that differs from
   `after` is left alone, as today, which closes Codex's case of overwriting a later
   edit.
5. **Old manifests** (written before this change, `after` unknown): undo refuses as
   today, but the message names the backup directory, so the user can restore by
   hand: "Not undone: X changed since Nixi's edit, or the edit was never confirmed.
   The backup is in <dir>."

All-or-nothing and "refuse if changed since" are unchanged.

## Alternatives rejected

- **At undo time, treat "differs from before" as the agent's edit:** it would restore
  over a later user edit with no evidence. The intent rules that out.
- **Reset `after` on a second edit:** it loses the verified first hash for no gain,
  since step 2 sets it at turn end anyway.

## Risks

- **A user edit during the turn, to a file the agent also edited,** is counted as
  part of the agent's edit and undone with it. That's the same exposure a
  completion event has today. Documented in `docs/architecture.md`'s undo section.
- `endTurn` does one extra hash per entry and one manifest write per turn: no
  measurable cost (files are at most 1 MiB).

## Verification

- `changes.test.js`:
  - two edits to one file in a turn, then the second completion arrives late → undo
    restores;
  - an edit with no completion → undo restores after the turn ends;
  - a file changed after the turn ended → undo refuses;
  - a late completion after a post-turn user edit doesn't make undo overwrite it;
  - Hyprland recovery leaves a file changed since the turn's end alone;
  - an old manifest with no `after` → refused, and the message names the backup.
- `node --test` all green; `nix flake check`.
