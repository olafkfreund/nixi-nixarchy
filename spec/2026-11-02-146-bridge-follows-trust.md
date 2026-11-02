---
status: approved
issue: 146
intent: intent/2026-11-02-146-bridge-follows-trust.md
---

# Spec: Every nixi bridge follows the trust level you set

## Design

All changes are in `bridge/bridge.js`. Line numbers are at `master`
`927183e`.

### 1. Watch the folder, not the file

- **What to watch:** `watch(settingsDir)` from `node:fs`, keeping only events
  whose `filename` is `nixi.json`. It must be the folder:
  - `mergeSettings` (`:110`) replaces the file with `rename()`, so a watch on
    the file itself goes dead after the first write;
  - editors save the same way.
- **When to start it:** in `start()` (`:498`), right after `loadSettings()`.
  Close it on exit.
- **Debounce:** wait 150 ms after the last event, then call
  `followSettings()`. A burst of writes becomes one read.
- **If the watch fails** (for example, the folder is missing): emit a
  `diagnostic` and carry on as today. The bridge still works; it just doesn't
  follow the file.

### 2. `followSettings()`: read, compare, apply

1. **Read the file the way `loadSettings` does** (`:98`). Then:
   - **Missing file (`ENOENT`):** the target is Guide and ask. That's the
     strictest level, and the same default as a fresh start.
   - **Unreadable, or not a JSON object:** change nothing. A broken file
     never loosens anything. Emit one `diagnostic`, at most once until the
     file reads cleanly again.
2. **Skip while a switch is in progress.** If a `trust` or `permission_mode`
   switch that came in on stdin hasn't settled yet, mark that a re-read is
   pending and return. When that switch settles, run `followSettings()` once
   more.
   - This keeps the card's own flow exactly as it is (#40, #106).
   - The bridge's own write then reads back as the same values, so nothing
     happens.
3. **The target trust differs from the current `trust`:**
   - **Codex:** emit `fatal` with "Trust changed to <level> — start a new
     conversation", then exit, the same thing a Codex bridge does today for a
     switch to Mechanic (`:851-854`). The client starts a fresh bridge, which
     reads the file.
   - **To Guide:**
     - `leavingMechanic++`, then `cancelAllPendingPermissions()`, so it bites
       on receipt (#106);
     - `applyTrustMode("guide")` if a session exists;
     - set `trust = "guide"`;
     - `leavingMechanic--` in `finally`.
     - If `applyTrustMode` fails, stay at the stricter level: an
       `effectiveTrust()` of Guide for this bridge, and a `diagnostic`. Never
       stay looser than the file says.
   - **To Mechanic:**
     - `applyTrustMode("mechanic")`, then `trust = "mechanic"`;
     - on failure: a `diagnostic`, and `trust` stays Guide.
   - **No write and no `ack`.** The file already says this; the change wasn't
     requested on stdin.
4. **Apply the permission mode** (only after trust is settled):
   - **YOLO → ask:** set `permissionMode = "permission"` at once.
   - **ask → YOLO:** only if `effectiveTrust() === "mechanic"`. Then set
     `permissionMode = "yolo"` and `allowAllPendingPermissions()`, the same as
     the card's own switch (`:915-918`). At Guide, a YOLO in the file is
     ignored, because YOLO needs Mechanic.
5. **Tell the client.** Emit `{"type":"settings","trust":…,"permissionMode":…,"source":"file"}`.
   It's a new, additive event type, and clients that don't know it ignore it.

### 3. What stays the same

- **`askBeforeReading` still applies from the next session** (`:83-87`). It's
  fixed when the agent starts, as documented.
- **The stdin `trust` and `permission_mode` messages** keep their order, acks
  and errors.
- **`loadSettings()` at start is unchanged.**

### 4. The companion

- **No code change is needed.** Its `stage_trust()` reads the same file, and
  its bridge now follows that file, so the board's footer and the bridge
  agree.
- **The companion's `run_bridge`** ignores unknown event types, so the new
  `settings` event is harmless. Checked: it only handles text, tool,
  permission, notice, status, done, error, fatal and diagnostic.

## Alternatives rejected

- **The companion restarts its bridge when the file changes.** That fixes one
  client. The card's own bridge, a second card, or a file edited by hand would
  still drift. The bridge is the one place that covers them all.
- **Re-read the file before every permission request.** That's simpler, but a
  request already waiting wouldn't be cancelled by a switch to Guide, and it
  adds a read to every request.
- **Polling every few seconds.** It wakes the CPU for nothing, which the intent
  rules out, and it's slower.
- **Watching the file instead of the folder.** It goes dead after the first
  atomic rename.

## Risks

- **A switch made in the card arrives twice: on stdin, and from the watch.**
  Handled by §2.2: the watch waits while a switch is in progress, then reads
  the same values.
- **`fs.watch` is unreliable on some filesystems** (network mounts).
  `~/.config` is local here. If the watch never fires, the bridge behaves as it
  does today, and the start-up read still works.
- **Two bridges flip-flopping.** Only stdin switches write the file; following
  the file never writes, so there's no loop.
- **Codex exits mid-conversation.** That only happens on an actual trust
  change, the same as today's switch to Mechanic.
- **Host:** p620, for the live check.

## Verification

- **Tests** in `bridge/settings-follow.test.js`, using the
  `bridge/testing/run-bridge.js` harness. A function in `messages` writes
  `nixi.json` in the test's home folder, as `herdr-bridge.test.js` does.
  - **Out of YOLO:** start at Mechanic and YOLO, then write `permissionMode:
    "permission"`. The next permission request shows a card instead of being
    allowed.
  - **To Guide:** start at Mechanic, then write `trust: "guide"`. A request
    that is waiting is cancelled, and the next one is cancelled with no card.
  - **To Mechanic:** start at Guide, then write Mechanic. The next request
    shows a card.
  - **YOLO in the file while at Guide:** ignored; requests are still
    cancelled.
  - **An invalid or half-written file** (bad JSON): nothing changes, and one
    `diagnostic` is emitted.
  - **The file is deleted:** the bridge moves to Guide and ask.
  - **A switch made on stdin:** the `ack` order and values are as today; the
    watch's re-read changes nothing, and no duplicate `settings` event appears.
  - **Codex:** a change in the file emits `fatal` and exits.
  - **Cost:** while the file is unchanged, there are no reads or events.
- **The full bridge suite passes:** `node --test bridge/*.test.js`.
- **Live on p620:**
  - with the companion running, switch the card from Mechanic and ask to
    YOLO;
  - ask the companion for a scratch-file edit: no card;
  - switch back to ask, and ask again: a card;
  - all without restarting the companion.
