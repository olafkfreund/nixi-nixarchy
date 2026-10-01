---
status: approved
issue: 35
intent: intent/2026-09-24-35-drop-motiontuner.md
---

# Spec: Remove the motion tuner

## Design

Delete `MotionTuner.qml` and every reference to it. Nothing replaces it: the
settings path it wrote through is already the one that loads the values.

- `Ask.qml`: the `MotionTuner { ... }` instance, the `visible = false` reset in
  `removeConversation`, the two `Component.onCompleted` wirings, and
  `setKeyboardMotion()` -- whose only callers were the tuner's two handlers.
- `Conversation.qml`: `motionTunerRequested`, `motionTunerOpen`,
  `onMotionTunerOpenChanged`, the `Ctrl+,` key case in `handleCardKey`, and the
  `Shortcut`. `WlrLayershell.keyboardFocus` drops the `motionTunerOpen` term and
  keeps `harnessSelectorOpen`.
- `nix/package.nix`: drop it from the QML install list.

`clampImpulse` and `clampDeceleration` stay. `loadSettings` calls them at
`:175,177`, so a hand-written `nixi.json` is still bounded to 80-2000 and
100-5000 -- the tuner was not the only thing keeping those honest.

## Alternatives rejected

**Keep it and stop shipping it.** Half-measures leave the code, the window and
the key binding in the tree with nothing exercising them; that is the state that
produced this issue.

**Replace it with a simpler dialog.** The premise is that two numbers do not
need an editor at all. A smaller editor is still an editor.

**Document `Ctrl+,` instead.** Makes the feature discoverable and keeps all the
cost. If the tuner were worth keeping this would be right, but the decision is
that it is not.

## Risks

- **Someone used it.** The binding is undocumented -- absent from the README and
  from `docs/testing.md`'s key list -- so the exposure is low, but not zero.
  Mitigated only by the settings path continuing to work.
- **`keyboardFocus` regression.** That expression is what lets an auxiliary
  window take focus without dismissing the layer popup. Dropping one term of an
  `||` must not change behaviour for the term that remains; the harness selector
  is the runtime check.
- **A QML reference left behind breaks the card at runtime, not at build.** CI
  does not run QML. Verified by grep instead, repo-wide, for all three names.
- Host-specific risk: none.

## Verification

1. `nix flake check` -- `installCheckPhase` asserts every QML file it installs
   is present and non-empty, so a stale entry in the install list fails the
   build. That is the check that catches the `package.nix` half.
2. `python3 tools/test_nixi.py` and `node --test bridge/*.test.js` as regression
   guards.
3. `grep -rn "MotionTuner\|motionTuner\|setKeyboardMotion"` over `*.qml`,
   `*.nix`, `*.py`, `*.js` returns nothing. **This is the load-bearing check**
   -- a dangling reference in QML surfaces as a broken card with green CI, which
   this repo has already been bitten by once today.
4. Runtime, not run: the card still opens, `Super+,` still opens the harness
   selector and returns focus to the composer, and a `nixi.json` carrying
   `keyboardLineImpulse` still changes scroll behaviour.
