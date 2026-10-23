---
status: approved
issue: 103
spec: spec/2026-10-23-103-settings-write-race.md
---

# Plan: A settings change never undoes another one

## Approved decisions (from the spec, so this file stands alone)

- **Ownership:**
  - **bridge only:** `trust`, `permissionMode`;
  - **card only:** `fontScale`, `searchDebounceMs`, `keyboardLineImpulse`,
    `keyboardDeceleration`, `fileOpenCommand`, `fileEditCommand`,
    `useHyprlandShortcutSubmap`, `repoSearchDepth`, `agent`, `model`, `reasoningEffort`;
  - **both preserve** every other key (for example `askBeforeReading`).
- **The card:** `flushSettings()` sets `flushPending` and `reload()`s. `onLoaded`, when
  `flushPending` is set, parses the fresh text into `settingsOnDisk` without applying it to the
  card's properties, then writes the fresh copy plus the card-owned keys only.
  - `onLoadFailed` with `flushPending` writes the card-owned keys only.
  - External changes (`watchChanges`) still go through `loadSettings`.
  - `permissionMode` and `trust` are never in the card's object.
  - `atomicWrites: true` stays.
- **The bridge:** `mergeSettings` reads, merges, writes `nixi.json.tmp-<pid>-<n>` (0600) and
  renames it over the file, serialised in one bridge by a promise chain.
- **Residual windows** (documented): a bridge write within the card's single event-loop turn
  between re-read and write; two bridges writing within milliseconds. In both cases each merges a
  fresh read, so only a writer's own key is affected.
- **Branch:** `fix/103-settings-write-race` from `master` (independent of the other PRs).
  Worktree: `/mnt/code/Source-home/GitHub/nixi-nixarchy-103`.

## Who does what

One `coder`, named "settings", for T1–T3. The lead does T4 (live) and T5 (reviews), and commits
each step.

## Steps

**T1. Bridge: atomic, serialised `mergeSettings`** (`bridge/bridge.js` ~97-110; a new test, either
`bridge/settings.test.js` or in `trust-policy.test.js` through `testing/run-bridge.js`)
- Implement as decided. Keep `mkdir(settingsDir, { recursive: true })`. Clean up the temp file if
  the rename fails.
- Tests:
  - With `nixi.json` = `{fontScale: 1.4, permissionMode: "yolo", askBeforeReading: true}`, the
    bridge's trust switch persists `trust` and keeps the other three.
  - No `nixi.json.tmp-*` is left behind.
  - The mode is 0600.
  - A trust switch and a permission-mode switch sent back to back both persist (serialisation).
- Verify: `node --test bridge/`.

**T2. Card: re-read before write, owned keys only** (`Ask.qml` ~155-235)
- Implement as decided. Factor `cardOwnedSettings()`, which returns the object of card-owned keys,
  so the key list lives in one place. Remove `permissionMode` from what the card writes.
  `persistedPermissionMode` stays as a mirror of the bridge's ack.
- Update `tools/test_nixi.py` `test_settings_keep_bridge_keys` (it currently asserts the old
  `Object.assign({}, settingsOnDisk` line) and add checks:
  - `flushSettings` calls `settingsFile.reload()` and doesn't `setText` directly;
  - the written object comes from `cardOwnedSettings()`, which contains no `permissionMode` and
    no `trust`;
  - the flush branch of `onLoaded` doesn't call `loadSettings`.
- Verify: `python3 tools/test_nixi.py`.
- Traps: `onLoadFailed` (first run) must still write. Don't break `settingsLoaded` gating. Keep
  the 200 ms debounce.

**T3. Docs** (`docs/architecture.md`, "Durable state and privacy"): the ownership table,
re-read-before-write, atomic writes, the residual windows. Replace the "two writers … each must
merge" paragraph with the precise rule.

**T4. Live verification (lead).**
- **The race:** with the card open, switch to Mechanic through the companion (`/mechanic`, or
  write trust through the bridge), then change the card's font size within a second. `nixi.json`
  keeps `trust: mechanic` and has the new `fontScale`.
- **The other direction:** change the font size, then switch trust. Both stick.
- Restore the user's font scale and trust afterwards. The card runs from nixi's installed plugin,
  so this branch's card needs a build (`nix build .#nixi`) and a way to load it. If the installed
  card can't be swapped without a rebuild of the user's system, verify the bridge half live and
  the card half by its source tests, and say so.

**T5. Review (lead):** Codex `review --base master`, agy, and a fresh Opus reviewer. Fix confirmed
findings and record them here.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` | all pass |
| `python3 tools/test_nixi.py` | pass |
| `nix flake check` | pass |
| Live T4 | as listed (or as far as the installed card allows, stated) |

## Rollback

Revert the merge. The old race comes back. No data format changed.
