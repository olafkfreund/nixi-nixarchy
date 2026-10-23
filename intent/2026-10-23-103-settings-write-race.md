---
status: approved
issue: 103
author: olafkfreund
---

# Intent: A settings change never undoes another one

## Problem

`~/.config/omarchy/nixi.json` has two writers (`docs/architecture.md`, "Durable state and privacy"):
the **bridge** owns `trust` and `permissionMode`, and the **card** (`Ask.qml`) owns the display
keys (font scale, search, file commands, agent, model, effort). The architecture says each must
*merge* rather than replace. Today neither fully does:

- **The card writes from a stale copy.** `flushSettings()` writes
  `Object.assign({}, settingsOnDisk, {…its keys…})`, where `settingsOnDisk` is the last copy it
  loaded, 200 ms after any change (`settingsSaveTimer`). The `FileView` reloads on change, but a
  bridge write that lands after the card's last load and before its flush is overwritten with the
  old value. That is how a `/mechanic` (or `/guide`) from the companion, or from the bridge
  itself, can be silently undone by a font-size change.
- **The card also writes `permissionMode`**, a bridge-owned key, from its own copy
  (`persistedPermissionMode`). A YOLO switch done through the bridge can be reverted the same way.
- **The bridge's merge isn't atomic.** `mergeSettings()` reads, merges and writes in place, with
  no temp-file-and-rename. Two bridges (several conversations, or the card plus the companion)
  can interleave, and a crash mid-write can leave a truncated file. `loadSettings` then reads it
  as Guide, which fails safe for trust but drops every other setting.

Found by the Opus reviewer on #97. It predates #94–#102, but the companion added a second
conversation that writes `trust`, which makes it more likely.

## Proposed outcome

- A trust or permission-mode change made anywhere (card, companion, bridge) is never undone by an
  unrelated settings write.
- The card never writes keys it doesn't own. Each writer re-reads the file at write time and
  changes only its own keys.
- Writes are atomic (temp file + rename), so a crash can't leave a half-written `nixi.json`.
- A test reproduces the race today and passes after the fix.

## Affected users and systems

- nixi: `Ask.qml` (the settings flush), `bridge/bridge.js` (`mergeSettings`), possibly
  `bin/nixi_safeio.py` (existing safe-write helpers, #60), tests (`tools/test_nixi.py`, bridge
  tests), `docs/architecture.md`.
- Every nixi user, card and companion alike.

## Constraints

- The ownership split stays as documented (bridge: `trust`, `permissionMode`; card: display,
  agent, model and effort keys). If a key's owner is unclear, the spec decides and documents it.
- No new runtime dependency. Prefer the existing safe-IO approach (#60) where it fits QML and
  Node.
- File mode stays 0600. `nixi.json` keeps being readable by older versions (no format change).

## Open questions

1. **Ownership of `permissionMode`:** the bridge only (the card asks the bridge, as it already does
   for trust), or shared with the card through a re-read-and-merge? (Recommended: bridge only.)
2. **How strict the card's write must be:** re-read just before writing and merge its own keys
   (simple), or stop writing the shared file and keep display keys in a separate card-only file?
   (Recommended: re-read and merge, plus atomic writes. A second file adds a migration.)

Resolved at approval (2026-10-23): the approver accepted the proposed answers. Q1:
`permissionMode` is bridge-only. Q2: the card re-reads just before writing, merges only its own
keys, and all writes are atomic.
