---
status: draft
issue: 39
intent: intent/2026-09-24-39-tour-filewatch-reload.md
---

# Spec: The guided tour must react to files it says it is watching

## Design

Add `onFileChanged: reload()` to the two `FileView`s in `Tour.qml` that set
`watchChanges: true` without it:

- `Tour.qml:127` -- `learningFile`, `~/.local/share/nixi/learning.json`
- `Tour.qml:139` -- the unnamed view on `~/.config/omarchy/defaults/agent`

This is the pattern already used by every other watched `FileView` in the repo,
so the change makes the file consistent with `Ask.qml:205`,
`MenuSearch.qml:522` and `MenuSearch.qml:531` rather than introducing anything
new.

Nothing else changes. Both `onLoaded` handlers already parse defensively --
`try { JSON.parse(text()) } catch { <structural default> }` at `:128-129`, and
a plain string trim at `:141` -- so a reload that catches a half-written file
falls back to the same safe state it already falls back to at startup. The
`onLoadFailed` handlers stay as they are: `learning.json` is legitimately absent
until something has been learned, and `defaultAgentSet = false` is correct when
the agent file does not exist yet.

`reload()` is Quickshell's own method on `FileView`; no new import, no new
property, no timer.

## Alternatives rejected

**Poll the files on a Timer.** Rejected: the watch already works and already
fires; only the reload is missing. A timer would add a second mechanism, burn
cycles for the shell's whole lifetime, and still be slower than the signal that
is already arriving.

**Set `blockLoading` or read the file synchronously in `applyChecks()`.**
Rejected: makes the tour's progress check a blocking filesystem read on a path
that may not exist, for no benefit over reloading on the signal.

**Have the bridge report the default agent instead.** Rejected: the tour is one
of the three features that must work with no AI and no network, so it cannot
depend on a running bridge. `harness-policy.js:179` reads the same file, but
only when an agent is being launched.

**Fix only `Tour.qml:139` (the tour-blocking one).** Rejected: `:127` has the
identical defect and the identical fix. Leaving one is how the inconsistency
arose in the first place.

## Risks

- **Reload storms.** A file written in several `write()` calls emits
  `fileChanged` more than once. Both handlers are cheap (one `JSON.parse` of a
  small object; one string trim) and idempotent, so repeated reloads are
  wasteful at worst. `learning.json` is written atomically by
  `bin/nixi-watch`'s `secure_write` (temp file plus rename), which surfaces as a
  single event.
- **Parsing a partial write.** Only reachable if some writer does not use the
  atomic pattern. The existing try/catch already handles it and the next event
  corrects it.
- **`applyChecks()` re-entrancy.** `:142` calls it on every load. It is already
  called on every load today at startup, and on every `Hyprland.onRawEvent`
  while the tour is active (`Tour.qml:101`), so it is already expected to run
  repeatedly. No new re-entrancy is introduced.
- Host-specific risk: none. This is UI-local and touches no bridge, packaging or
  trust path.

## Verification

1. **Automated.** `nix flake check` -- `checks.package` (`package.nix:203-211`)
   asserts `Tour.qml` is present and non-empty; `checks.selfcheck` runs
   `tools/test_nixi.py`, whose `test_tour_and_learning_data` validates the tour
   data this change makes reachable.
2. **Static.** `grep -c 'onFileChanged: reload()' Tour.qml` returns 2, and every
   `watchChanges: true` in the repo is followed by an `onFileChanged` within its
   block.
3. **Runtime, the actual bug.** With the shell running and Nixi open on tour
   step 1: `rm -f ~/.config/omarchy/defaults/agent`, confirm step 1 is waiting,
   then `echo claude > ~/.config/omarchy/defaults/agent`. The tour must advance
   without `omarchy-restart-shell`. Before this change it does not.
4. **Runtime, the second view.** With two conversations open, complete a
   learning topic in one and confirm the other's progress count updates without
   a restart.
