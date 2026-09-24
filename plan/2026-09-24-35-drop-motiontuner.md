---
status: approved
issue: 35
spec: spec/2026-09-24-35-drop-motiontuner.md
---

# Plan: Remove the motion tuner

## Steps

1. `Ask.qml`: remove the `MotionTuner {}` instance, the `motionTuner.visible`
   reset, and the two `Component.onCompleted` wirings.
2. `Ask.qml`: remove `setKeyboardMotion()` -- orphaned once step 1 lands.
3. `Conversation.qml`: remove the signal, the property, the change handler, the
   `Ctrl+,` key case and the `Shortcut`; reduce `keyboardFocus` to
   `harnessSelectorOpen`.
4. `nix/package.nix`: drop `MotionTuner.qml` from the QML install list.
5. `git rm MotionTuner.qml`.
6. Grep repo-wide for all three names; expect nothing.

## Tests

```bash
grep -rn "MotionTuner\|motionTuner\|setKeyboardMotion" --include=*.qml --include=*.nix --include=*.py --include=*.js .
python3 tools/test_nixi.py
node --test bridge/*.test.js
nix flake check --print-build-logs
```

All four run and pass; the grep returns nothing. 269 deletions against 2
insertions.

`clampImpulse`/`clampDeceleration` verified still called from `loadSettings`,
so `nixi.json` values stay bounded without the tuner.

## Rollback

`git revert`. The file returns and the wiring with it. No state, no migration:
`nixi.json` keeps the same two keys either way, which is the point -- the
settings path never depended on the editor.

## Not covered

Runtime behaviour. CI does not run QML, so the grep in step 6 is doing the work
a test would elsewhere. The card opening, focus returning from the harness
selector, and a hand-set `nixi.json` changing scroll feel all still want a human
at a desk.
