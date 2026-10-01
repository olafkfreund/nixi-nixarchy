---
status: approved
issue: 35
author: olafkfreund
---

# Intent: Remove the motion tuner

## Problem

`MotionTuner.qml` is a 236-line Canvas physics-curve editor, reachable only by
`Ctrl+,`, that edits exactly two numbers: `keyboardLineImpulse` and
`keyboardDeceleration`.

`nixi.json` already sets both. `Ask.qml:175,177` loads them from the watched
settings file and clamps them through `clampImpulse`/`clampDeceleration`. So the
tuner is a second writer of two values the config file already owns, reachable
by an undocumented key, carrying a Canvas renderer and its own window to do it.

## Proposed outcome

- The two scroll-motion values remain settable, clamped, and applied live, via
  `~/.config/omarchy/nixi.json` -- the mechanism that already exists.
- `Conversation.qml` loses a signal, a property, a change handler, a key case
  and a shortcut; `Ask.qml` loses an instance, three wiring lines and an
  orphaned setter.
- Roughly 270 lines go.

## What is actually lost, stated plainly

**A live visual editor with a preview curve.** Someone tuning these values now
edits a JSON file and watches the result, rather than dragging a handle and
seeing the curve redraw. That is a real reduction for anyone who used it.

This is a product decision, not a cleanup: the feature works. The user has
decided the maintenance surface is not worth a tuner for two numbers, and this
records that decision rather than dressing it as dead-code removal.

## Affected users and systems

- Anyone who used `Ctrl+,`. The binding is not in the README and the key case is
  not listed in `docs/testing.md`'s scroll-key line, so discovery was low.
- `MotionTuner.qml` (deleted), `Ask.qml`, `Conversation.qml`,
  `nix/package.nix`'s QML install list.

## Constraints

- The values must keep working from `nixi.json`, including live reload and
  clamping. Removing the editor must not remove the setting.
- `clampImpulse`/`clampDeceleration` stay: `loadSettings` still uses them, so a
  hand-edited file cannot set an absurd value.
- No other window may lose keyboard focus handling --
  `WlrLayershell.keyboardFocus` referenced the tuner alongside the harness
  selector and must keep working for the latter.

## Open questions

None. The decision is made; the mechanism it leaves behind already exists and
is already the one the tuner wrote through.
