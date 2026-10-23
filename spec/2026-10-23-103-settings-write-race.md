---
status: approved
issue: 103
intent: intent/2026-10-23-103-settings-write-race.md
---

# Spec: A settings change never undoes another one

## Design

### Ownership (documented in `docs/architecture.md`)

| Key | Writer |
|---|---|
| `trust`, `permissionMode` | **bridge only** (`mergeSettings`) |
| `fontScale`, `searchDebounceMs`, `keyboardLineImpulse`, `keyboardDeceleration`, `fileOpenCommand`, `fileEditCommand`, `useHyprlandShortcutSubmap`, `repoSearchDepth`, `agent`, `model`, `reasoningEffort` | **card only** (`Ask.qml`) |
| `askBeforeReading` and any key neither writer knows | preserved by both, written by neither |

`permissionMode` is already changed through the bridge (the card sends `permission_mode`, the
bridge persists it and acks, and the card mirrors the ack into `persistedPermissionMode`,
`Ask.qml:393-395`). Dropping it from the card's write loses nothing and closes a revert path.

### 1. The card re-reads before it writes (`Ask.qml` ~155-235)

- `flushSettings()` no longer writes immediately. It sets `flushPending = true` and calls
  `settingsFile.reload()`.
- `onLoaded`: if `flushPending`, parse the fresh text into `settingsOnDisk` **without** applying
  it to the card's properties. A disk value must not overwrite the font size the user just
  changed. Then write `Object.assign({}, fresh, {…card-owned keys only…})` and clear
  `flushPending`. Otherwise `loadSettings(text())` runs as today, for external changes picked up
  by `watchChanges`.
- `onLoadFailed` with `flushPending` (no file yet): write the card-owned keys only.
- `permissionMode` and `trust` are never in the card's object.
- The `FileView` already has `atomicWrites: true`. Keep it.
- **Remaining window:** a bridge write that lands between the card's re-read and its `setText`.
  That's a single QML event-loop turn, not 200 ms plus. It is documented as the residual, and the
  bridge side (2) makes its own writes atomic.

### 2. The bridge writes atomically (`bridge/bridge.js` `mergeSettings` ~97-110)

- Read, merge `patch`, write to `nixi.json.tmp-<pid>-<n>` with mode 0600, then `rename` over
  `nixi.json`. That is atomic on the same filesystem, so a crash leaves the old file or the new
  one, never half of one.
- Serialise the bridge's own calls with a promise chain, so two `mergeSettings` in one bridge
  can't interleave.
- **Across processes** (two bridges: the card and the companion): each re-reads before its write,
  and writes atomically. The residual is two bridges writing within the same few milliseconds.
  The last writer wins on its own key only, because each merges a fresh read.

### 3. Docs

`docs/architecture.md`, "Durable state and privacy": the ownership table, re-read-before-write,
atomic writes, the residual window.

## Alternatives rejected

- **A separate card-only settings file:** removes the overlap entirely, but needs a migration and
  two files to back up. The intent chose re-read-and-merge.
- **A lock file:** both writers would need it. QML `FileView` has no lock primitive, and a stale
  lock after a crash would block writes. Atomic writes plus fresh merges make the residual
  harmless.
- **The card writing `permissionMode` after a re-read:** still two writers for one key. The bridge
  already owns it.

## Risks

- **The re-read path changes when card settings reach disk:** after a reload, roughly the same
  200 ms debounce plus one file read. Tests must check that a write still happens and contains
  the card's new value.
- **`onLoaded` now serves two purposes** (external change vs. a flush re-read). A bug here could
  drop a user change or apply a stale one. The tests cover both.
- **Rename across filesystems:** the temp file goes in the same directory as `nixi.json`, so they
  share a filesystem.

## Verification

- **Bridge test:** a fake card writes `{fontScale: 1.4, permissionMode: "yolo"}` to disk; the bridge
  `mergeSettings({trust: "mechanic"})`. The result keeps `fontScale` 1.4 and `permissionMode` and
  sets `trust`. The temp file is gone afterwards and the mode is 0600. Concurrent
  `mergeSettings({trust})` and `mergeSettings({permissionMode})` in one bridge both persist.
- **Card (source-level, `tools/test_nixi.py`, as for other QML checks):**
  - `flushSettings` triggers `reload()` and not `setText` directly;
  - the card's write object contains no `permissionMode` and no `trust`;
  - the flush path doesn't call `loadSettings` on the fresh text.
- **Live:** in the card, switch to Mechanic through the companion (`/mechanic`), then change the
  font size in the card within a second. `nixi.json` still says `mechanic` and has the new font
  size. This repeats the race scenario from #103, which loses today.
- **Throughout:** `node --test bridge/`, `python3 tools/test_nixi.py`, `nix flake check` green.
