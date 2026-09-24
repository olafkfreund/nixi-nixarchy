---
status: approved
issue: 50
spec: spec/2026-09-24-50-permission-prompt-fidelity.md
---

# Plan: The permission card shows what will run, and cannot be answered unseen

Approved decisions, carried over so this file stands alone:

- **argv renders with POSIX shell quoting, applied only to arguments that need
  it.** `["rm","-rf","/tmp/a b"]` -> `rm -rf '/tmp/a b'`. Chosen over JSON
  because it needs no translation step from the reader, and minimal quoting
  keeps the common case byte-identical while making a quote a signal.
- **No `rawInput` allowlist.** `command` first, then every remaining key as
  pretty JSON. An allowlist makes the next tool's new field invisible, which is
  the bug being fixed.
- **Autorepeat is suppressed structurally**: `autoRepeat: false` on the `Y`/`N`
  shortcuts, `event.isAutoRepeat` returns in the composer. Exact, and does not
  race Hyprland's 600 ms `repeat_delay`.
- **Settle window is 400 ms**, Qt's own `mouseDoubleClickInterval`, and it
  **disables the buttons as well as the keys** -- the durable choices are
  mouse-only after #58, and a greyed button is useful feedback.
- **Two #58 regressions are fixed in the same diff**, because the settle window
  is meaningless without them: `enqueuePermission` drops `options`, and the
  composer still calls `answerPermission(bool)`.

## Steps

1. `bridge/permission-detail.js`: add `SHELL_SAFE` / `shellQuote`, and rewrite
   `rawInputText` to destructure `command` off `rawInput`, render it (string
   as-is, array shell-quoted, anything else as JSON) and append the remaining
   keys as pretty JSON.
   -> verify by step 2.

2. `bridge/permission-detail.test.js`: argv with a space; with an embedded
   single quote; with an empty element; an all-safe argv byte-identical to
   today; `command` plus siblings shown together; a non-string non-array
   `command`. Prove each fails against the old `join(" ")` / early-return.
   -> verify by `node --test bridge/*.test.js`.

3. `Conversation.qml:1017-1022` + `:1072`: `enqueuePermission` takes and stores
   `options`, and the handler passes `event.options`. (#58 regression 1.)
   -> verify by step 9 and runtime check 2.

4. `Conversation.qml:1534`: the composer's permission branch returns on
   `event.isAutoRepeat`, and answers with `root.optionIdForKind("allow_once")` /
   `("reject_once")` instead of a boolean. (#58 regression 2 + autorepeat.)
   -> verify by step 9 and runtime check 1.

5. `Conversation.qml:851-858`: add `autoRepeat: false` to both `Y`/`N`
   shortcuts. Keep each `Shortcut` block free of nested braces -- the selfcheck
   matches them with `Shortcut\s*\{[^}]*\}`.
   -> verify by step 9.

6. `Conversation.qml:48` + `:77`: add `property bool permissionSettled: false`
   and require it in `permissionKeysLive`.
   -> verify by step 9.

7. `Conversation.qml:1024-1027` + `clearPermissions`: `showNextPermission()`
   clears `permissionSettled` and restarts a `Timer { interval: 400 }` when a
   request is shown (stops it when none is); `clearPermissions()` clears both.
   `answerPermission()` refuses while `!permissionSettled` -- one guard, where
   all three answer paths already route through.
   -> verify by step 9 and runtime check 1.

8. `Conversation.qml:2261-2279`: the option buttons get
   `enabled: root.permissionSettled` **and** an opacity bound to it (see
   Deviations).
   -> verify by step 9 and runtime check 2.

9. `tools/test_nixi.py`: extend `test_permission_keys_guard` for the composer's
   option id and `isAutoRepeat`, and add `test_permission_settle_window()`
   asserting the flag, the timer, the interval, the `answerPermission` guard,
   the shortcuts' `autoRepeat: false`, the buttons' `enabled`, and that
   `enqueuePermission` carries `options`. Say in the test that these are source
   assertions and that the 400 ms itself needs a GUI.
   -> verify by `python3 tools/test_nixi.py`, and by deleting each guard in turn
   and watching the assertion fire.

## Tests

```bash
node --test bridge/*.test.js         # 78 before, all pass after
python3 tools/test_nixi.py
nix flake check --print-build-logs   # package + selfcheck + hm-module-eval
```

Runtime, after rebuild and `omarchy-restart-shell`:

1. **The actual complaint.** In Mechanic, queue two requests; hold `Y` through
   the first -- the second must still be on screen. Double-click Allow with one
   queued -- likewise. CI cannot do either.
2. **No regression.** One request answered by `Y`, by `N`, and by each of the
   agent's buttons; the buttons are visible at all (regression 1) and the 400 ms
   is not felt.
3. **Rendering.** A Bash call whose argument contains a space shows it quoted,
   and its `description` is visible below the command.

## Deviations, found during implementation

**1. `enabled` alone is invisible, so the buttons also bind opacity.** The spec
justifies extending the settle window to the mouse partly on the greyed button
being *feedback* -- the visible signal that this is a new question. `Button`
comes from `qs.Ui` and is a `BorderSurface` with a `MouseArea`; `enabled: false`
propagates and does block the click, but the component paints **no disabled
state at all**, so the card would have looked identical while refusing clicks --
which is the "broken app" reading the spec argued against. Step 8 therefore also
sets `opacity: root.permissionSettled ? 1 : 0.45`, and the selfcheck asserts it,
so the claim the decision rests on is itself checked. One line; the alternative
was to drop the justification, which would have left the decision unargued.

## Rollback

`git revert` the implementation commit. Every change is stateless -- rendering
and timing only; no bridge permission logic, no persisted state, nothing the
agent remembers.

- If only the settle window proves wrong in use, steps 5-9 can be reverted
  while keeping 1-4, which leaves the rendering fixed and the #58 regressions
  fixed.
- Reverting steps 3-4 alone is **not** safe: it restores a card with no buttons.
