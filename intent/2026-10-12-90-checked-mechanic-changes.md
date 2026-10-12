---
status: draft
issue: 90
author: olafkfreund
---

# Intent: Mechanic's backup, check and undo should not depend on the agent remembering

## Problem

In Mechanic, a change is safe afterwards only if the agent follows step 5 of
`skills/nixi/SKILL.md`: back up each file first (`cp X X.bak-nixi`), verify the
change took effect, and report the one-line undo. These are instructions to a
model. Nothing in the bridge enforces them, so each can fail without anyone
noticing:

- **No backup.** The agent edits without copying first. The user approved the
  edit, the edit is wrong, and there is nothing to go back to.
- **The backup is overwritten.** There is one `.bak-nixi` slot per file. A second
  change to the same file, in the same session or a later one, overwrites the
  first backup with the already-changed file. "Undo the first change" is then
  impossible, and the backup looks valid while holding the wrong version.
- **No check.** A Hyprland edit with a syntax error loads with errors, or not at
  all, and the agent reports success. The user finds out from a broken desktop,
  not from the card.
- **Undo restores over the user's later edits.** "Now undo it" copies the backup
  back without checking whether the file has changed since. Anything the user
  edited by hand afterwards is lost.

Mechanic is the trust level where Nixi changes a newcomer's machine. A newcomer
is the person least able to recover a broken `~/.config/hypr/` by hand, and the
one most likely to believe "done, and here is how to undo it".

## What exists elsewhere

jburchel/omarchy-assistant (reviewed 2026-10-12) puts this in code, not in the
prompt. The model only proposes changes. A small engine backs up before writing,
writes atomically, runs `hyprctl reload` and `hyprctl configerrors`, and puts
everything back automatically if the check fails. It keeps a history, and refuses
an undo if the file's sha256 no longer matches what it wrote.

Its full design does not fit Nixi. Nixi's agent edits through its own tools,
approved one request at a time in the card (#20, #50, #53), and that model is
settled. What fits is the idea: **the safety steps happen because the code runs
them, not because the agent remembered to.**

The parts are already here. Before the bridge answers a permission request, the
request carries the diff and the target path (`bridge/permission-detail.js`
renders `item.path`, `oldText` and `newText`). The bridge holds that moment and
can act before saying yes. `bin/nixi_safeio.py` already does private, atomic,
symlink-safe writes.

## Proposed outcome

- Every file change approved in Mechanic has a backup, made before the change
  lands, that a later change cannot overwrite.
- After a change to the Hyprland config, Nixi checks that Hyprland still loads
  it, and the card says plainly if it does not, with the backup already put back
  or one step away.
- "Undo" works whether or not the agent remembered anything. It refuses, with a
  reason, when the file has changed since Nixi wrote it, instead of overwriting
  the user's later edits.
- Guide is unchanged: it changes nothing, so it has nothing to back up.

## Affected users and systems

- Mechanic users, on every approved file edit.
- `bridge/bridge.js` (the permission answer path), probably a new bridge module
  next to `files.js` and `media.js`, and its tests plus `bridge/testing/`.
- `skills/nixi/SKILL.md` step 5, which tells the agent to make its own backups
  today.
- `Conversation.qml` if undo becomes a card command or a result line.
- A new state directory under `~/.local/share/nixi/` (or `~/.local/state/`).

## Constraints

- The per-request approval flow stays as it is (#20, #50, #53). This adds work
  around an approved write. It does not change what is asked or how.
- Must not slow down or block an approved write when the safety step itself fails
  (disk full, unreadable file) without telling the user. Failing silently is the
  problem being fixed.
- Backups can hold private config, so they must be private (0700/0600), never
  follow symlinks, and have a bounded size, like `LEARNED.md` already is.
- Must work for all three agents (`claude`, `codex`, `opencode`), or say clearly
  which ones it covers. They do not all report edits the same way.
- Files home-manager manages are symlinks into `/nix/store`. An agent cannot edit
  them, and Nixi must not "back up" a store path as if it were the user's file.
- No new runtime dependency.

## Open questions

1. **Scope: file edits only, or shell commands too?** Edits arrive as diffs with
   a path, so they can be backed up. A shell command (`nixarchy pkg add`,
   `hyprctl keyword`, `cp`) cannot be backed up in general. Package and service
   changes already have NixOS generations as their undo. Proposal: edits only,
   and say so.
2. **Check what, beyond Hyprland?** `hyprctl configerrors` covers the main case.
   JSON files (`shell.json`) can be parsed. Terminal and other configs have no
   cheap check. Hyprland and JSON only, to start?
3. **Restore automatically on a failed check, or ask?** Automatic is safer for a
   newcomer. Asking keeps the user in control and lets the agent fix its own
   mistake. omarchy-assistant restores automatically.
4. **How does the user undo?** A `/undo` card command that needs no agent, the
   agent calling something the bridge provides, or both?
5. **What happens to the `cp X X.bak-nixi` instruction?** Remove it from the
   skill once the bridge does this, or keep it as a second layer for agents the
   bridge cannot cover?
6. **How long is history kept?** For the session, for N changes, or for N days?
