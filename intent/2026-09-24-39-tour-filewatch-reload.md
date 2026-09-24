---
status: draft
issue: 39
author: olafkfreund
---

# Intent: The guided tour must react to files it says it is watching

## Problem

Tour step 1 asks the user to choose a default agent, then waits for
`~/.config/omarchy/defaults/agent` to appear. It waits forever.

`Tour.qml:139` sets `watchChanges: true` on that `FileView` but never pairs it
with `onFileChanged: reload()`. In Quickshell 0.3.1 `watchChanges` emits
`fileChanged`; it does not itself reload. `loaded` fires once, at startup, and
never again. So `defaultAgentSet` stays `false`, `applyChecks()` never runs, and
the tour cannot advance past its first step until the whole shell restarts.

`Tour.qml:127` (`learningFile`, `~/.local/share/nixi/learning.json`) has the
same omission, so learning progress written by another conversation is not
picked up either.

This is an inconsistency rather than a misreading of the API: the three other
`FileView`s in the repo all pair it correctly -- `Ask.qml:205`,
`MenuSearch.qml:522` and `MenuSearch.qml:531`.

The comment at `Tour.qml:134-135` states the intent that the code does not meet:
"the file is watched rather than read once".

The tour is one of the three features the README leads with as needing no AI and
no network, so a newcomer following the documented first-run path hits a dead
end in the feature meant to introduce them to the system.

## Proposed outcome

- Writing `~/.config/omarchy/defaults/agent` while the tour is on step 1
  advances the tour, without restarting the shell.
- Learning progress written by one conversation is visible to another.
- The repo's `FileView` usage is consistent: anything watched is reloaded.

## Affected users and systems

- Every new nixarchy user who runs the guided tour -- the primary onboarding path.
- `Tour.qml` only. No bridge, packaging or trust-model change.

## Constraints

- Must not convert these to polling; the watch is the right mechanism.
- Must keep the existing `onLoadFailed` behaviour (`learning.json` is legitimately
  absent until something has been learned, and an empty state is correct).
- Must not reload so eagerly that a partially written file is parsed as final;
  both load sites already guard with try/catch and a structural default, which
  should be preserved.

## Open questions

None. The fix is the same two-line pattern already used three times elsewhere in
this repo.

## Note on baseline

Line numbers refer to `refactor/35-dead-code-cleanup`, which is 18 commits ahead
of `master` and is where this work is based. The same omission exists on `master`
at `Tour.qml:134` and `:147`.
