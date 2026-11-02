---
status: approved
issue: 146
spec: spec/2026-11-02-146-bridge-follows-trust.md
---

# Plan: Every nixi bridge follows the trust level you set

Repo: `nixi-nixarchy`, branch `fix/146-bridge-follows-trust`, from master
`927183e`. The lead implements it: there are two editing steps in two files,
below the managed handoff threshold.

## Approved decisions (copied from the spec)

- **Watch the folder.** `watch(settingsDir)` from `node:fs`, keeping only
  `filename === "nixi.json"`. Saves rename a new file over the old one, so a
  watch on the file itself goes dead.
  - Started in `start()` right after `loadSettings()`, closed on exit.
  - Debounced to 150 ms, then `followSettings()`.
  - If the watch fails, one `diagnostic`, and the bridge works as today.
- **`followSettings()` reads the file:**
  - missing file (ENOENT) → the target is Guide and ask;
  - unreadable, or not a JSON object → no change, and one `diagnostic` until
    the file reads cleanly again.
- **Order of work:**
  1. If a stdin `trust` or `permission_mode` switch is still in progress, mark
     a re-read as pending and return. Run once more when the switch settles.
  2. Apply the trust level:
     - **Codex:** emit `fatal` with "Trust changed to <level> — start a new
       conversation", then exit.
     - **To Guide:**
       - `leavingMechanic++`;
       - `cancelAllPendingPermissions()`;
       - `applyTrustMode("guide")` when there's a session;
       - `trust = "guide"`;
       - `leavingMechanic--` in `finally`.

       If the mode change fails, the bridge stays effectively at Guide, with a
       `diagnostic`.
     - **To Mechanic:** `applyTrustMode("mechanic")`, then
       `trust = "mechanic"`. If it fails, a `diagnostic`, and the bridge stays
       at Guide.
     - No file write and no `ack`.
  3. Apply the permission mode:
     - YOLO → ask: at once.
     - ask → YOLO: only if `effectiveTrust() === "mechanic"`. Then
       `permissionMode = "yolo"` and `allowAllPendingPermissions()`.
  4. Emit `{"type":"settings","trust","permissionMode","source":"file"}`. It
     isn't emitted when nothing changed.
- **What stays as it is:** `askBeforeReading` (start-up only), the stdin
  switch messages (their order, acks and errors), and `loadSettings()`.
- **Companion:** no code change.

## Steps

**1. `bridge/bridge.js`: follow the file**
- **Imports:** `watch` from `node:fs`.
- **Track switches in progress.** A `stdinSwitching` counter, raised in the
  `trust` handler (`:881`) and the `permission_mode` handler (`:915`), and
  lowered in their `finally` (add a `finally` to `permission_mode`).
  - When the counter returns to 0 with `followPending` set, call
    `followSettings()`.
- **`followSettings()`** as above. Keep it beside `loadSettings` (`:98`),
  with a one-line comment giving the why (#146).
- **Start and stop the watch** in `start()` (`:498`): after `loadSettings()`,
  `watcher = watch(settingsDir, …)`. Debounce with `setTimeout` /
  `clearTimeout`. Close it where the bridge already cleans up before exit.
- **Verify:** `node --check bridge/bridge.js`, plus step 2.
- **Traps:**
  - `settingsDir` may not exist on a first run. Create it with
    `mkdirSync(..., {recursive: true})` before watching, as `mergeSettings`
    does, or skip the watch with a diagnostic.
  - Never write the file from `followSettings`.

**2. `bridge/settings-follow.test.js` (new): the spec's nine cases**
- **Harness:** `runBridge` from `./testing/run-bridge.js`. A function in
  `messages` gets `{ home, events }`. Write
  `<home>/.config/omarchy/nixi.json` there (check the harness's
  `settingsDir`), then wait about 400 ms for the debounce.
- **Triggering a permission request:** use the fake agent's existing triggers,
  for example the `PLEASE_HERDR` prompt from `herdr-bridge.test.js` or a
  plain edit trigger. Check `bridge/testing/fake-agent.js` for which prompt
  asks for permission. Assert whether a card appears and what the outcome is.
- **Verify:** `node --test bridge/settings-follow.test.js`, then
  `node --test bridge/*.test.js` (all pass).
- **Trap:** the worktree needs `bridge/node_modules`. Symlink it from the main
  checkout and never commit the link.

**3. Review, PR, deploy, live check**
- **Review:** a fresh Opus review of the diff against this plan.
- **PR:** to nixi-nixarchy. CI must be green, then merge.
- **Deploy:** bump `nixi` in nixos_config, build p620, open and merge the PR,
  pull, post on the agent bus, run `AGENT_BUS_ANNOUNCED=1 just deploy`, then
  `nixi-companion restart`. This restart is the last one ever needed for a
  trust change.
- **Live:** the check in the spec's Verification. The user switches YOLO in
  the card; a scratch-file edit through the companion follows each switch,
  with no restart. The lead drives the requests through the companion's API.

## Tests

| Check | Expected |
|---|---|
| `node --test bridge/settings-follow.test.js` | the nine cases pass |
| `node --test bridge/*.test.js` | the full bridge suite passes (257 + new) |
| CI on the PR | green |
| Live on p620 | the companion's cards follow the card's switch with no restart |

## Rollback

Revert the merge in nixi-nixarchy, bump `nixi` in nixos_config, deploy p620,
and run `nixi-companion restart`. Bridges then read trust at start only, as
before. That's safe, just stale.
