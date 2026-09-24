---
status: draft
issue: 39
spec: spec/2026-09-24-39-tour-filewatch-reload.md
---

# Plan: The guided tour must react to files it says it is watching

Approved decisions, carried over so this file stands alone:

- Add `onFileChanged: reload()` to the two `FileView`s in `Tour.qml` that set
  `watchChanges: true` without it. Nothing else changes.
- Keep both `onLoaded` try/catch guards and both `onLoadFailed` handlers exactly
  as they are.
- No timer, no polling, no bridge involvement -- the tour must keep working with
  no AI and no network.

## Steps

1. `Tour.qml:127` (`learningFile`, `~/.local/share/nixi/learning.json`): add
   `onFileChanged: reload()` inside the same `FileView` block, after
   `watchChanges: true`.
   -> verify by `grep -A6 'id: learningFile' Tour.qml` showing both
   `watchChanges: true` and `onFileChanged: reload()`.

2. `Tour.qml:139` (the view on `~/.config/omarchy/defaults/agent`): same
   addition.
   -> verify by `grep -c 'onFileChanged: reload()' Tour.qml` returning `2`.

3. Confirm no other watched view in the repo is still missing the pairing.
   -> verify by checking each `watchChanges: true` in `Tour.qml`, `Ask.qml` and
   `MenuSearch.qml` has an `onFileChanged` within its block; expected total
   across the repo is 5 watched views, 5 reload handlers.

## Tests

```bash
# 1. Both handlers present, repo-wide pairing intact
grep -c 'onFileChanged: reload()' Tour.qml            # expect 2
grep -rc 'watchChanges: true' *.qml | grep -v ':0'    # Tour 2, Ask 1, MenuSearch 2

# 2. The QML still parses and the package still builds its assertions
nix flake check --print-build-logs
# expect: checks.package passes (package.nix:203-211 asserts Tour.qml non-empty),
#         checks.selfcheck passes (tools/test_nixi.py, incl. test_tour_and_learning_data)

# 3. Bridge tests unaffected, run as a regression guard
node --test bridge/*.test.js                          # expect all pass
```

Runtime check, which is the only one that exercises the actual bug. On a machine
running the rebuilt plugin, after `omarchy-restart-shell`:

```bash
mv ~/.config/omarchy/defaults/agent /tmp/agent.bak    # if present
# open Nixi, start the tour; step 1 asks for a default agent
echo claude > ~/.config/omarchy/defaults/agent
```

Expected: the tour advances past step 1 within a second, with no shell restart.
Before this change it stays on step 1 indefinitely. Restore with
`mv /tmp/agent.bak ~/.config/omarchy/defaults/agent`.

Second runtime check, for `learningFile`: with two conversations open, complete a
learning topic in one; the other's progress count updates without a restart.

## Rollback

`git revert` the implementation commit. The change is two lines in one file with
no migration, no persisted state and no packaging effect, so reverting restores
the previous behaviour exactly -- including the bug.

If the revert is needed because reloads prove too frequent on some machine, the
narrower fallback is to keep `onFileChanged: reload()` on `Tour.qml:139` only
(the tour-blocking one) and drop it from `learningFile`. That keeps the
user-visible fix and halves the reload surface.
