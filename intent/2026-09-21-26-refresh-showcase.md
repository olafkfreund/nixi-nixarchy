---
status: draft
issue: 26
author: olafkfreund
---

# Intent: Refresh the showcase once the fixes ship

## Problem

The showcase published on 2026-09-21 (#22) is now behind the product in four
places:

| Where | Shows today | Stale because of |
| --- | --- | --- |
| Scene 2 (still, GIF, MP4, captions) | "how do I install an app?" answered with `apps.nix` + `nixarchy apply`, no panel | #23 (merged): Nixi now leads with the package manager panel |
| Scene 5 note | "click Allow; Y and N do not work yet" | #20, once fixed |
| Scene 5 note | "a long command can be cut short in the prompt" | #21, once fixed; the approval still shows a cut-off command |
| "No AI needed" note | "choosing a FAQ row does nothing yet" | #19, once fixed; the offline FAQ could become a scene of its own |

None of it can be re-recorded yet. nixarchy pins Nixi to a commit
(`flake.nix`: "Bump it deliberately; never track a branch"), and the pin is
`6b5878a` (#17). So razer, and every nixarchy machine, still runs Nixi from
before #18, #23 and whatever fixes #19–#21 land. A recording made now would
show the old behaviour.

## Proposed outcome

After #19, #20 and #21 are merged:

1. nixarchy bumps its Nixi pin once, to a commit carrying all of them, with
   the comment in `flake.nix` saying what the bump brings (its own nixarchy
   PR, as a lock bump).
2. razer is rebuilt onto that nixarchy.
3. The showcase is re-recorded on razer, the same way as #22 (cropped to the
   card, reviewed for private data), with these changes:
   - scene 2 shows the package manager answer;
   - scene 5 shows a full command in the prompt, and is answered with Y;
   - a new "No AI needed" still shows a FAQ answer;
   - the three limitation notes are removed.
4. The README, the nixi site, and nixarchy's copy of the GIF
   (`docs/img/features/nixi.gif`) are updated together.

## Affected users and systems

- Readers of the README, the nixi site and nixarchy's AI page.
- nixarchy: `flake.nix` and `flake.lock` (the pin), and
  `docs/img/features/nixi.gif`.
- **razer: a system rebuild.** That changes a machine you use, so it needs
  your go-ahead at the time, not only approval of this intent.

## Constraints

- The same privacy rule as #22: card-only crops, no terminal with calendar
  or mail, every frame reviewed.
- The same size budget as #22 (GIF < 5 MB, MP4 < 8 MB, stills < 250 KB).
- Recorded against released behaviour only: nothing is recorded until the
  pin is bumped and razer runs it.

## Open questions

1. Is widening #26 from "scene 2" to "refresh after #19–#21" what you want,
   or should #26 stay scene 2 only, with a separate issue for the rest?
2. May the nixarchy pin bump and razer's rebuild be part of this task, or do
   you want to do those yourself?
