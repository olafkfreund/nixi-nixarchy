---
status: draft
issue: 159
author: olafkfreund
---

# Intent: Drag Nixi from one screen to another

Code: the companion (`nixoarchy-snowflake`), mostly `app/window.py`.
Artifacts: this repo.

## Problem

- **A drag can't take Nixi to another monitor.** The user tried to drag him
  onto another screen on p620 and couldn't, and asked whether that's by
  design. It isn't: it's a gap.
- **Why, on Hyprland (layer-shell):**
  - a layer surface belongs to one monitor at a time;
  - the drag loop follows the global cursor, but places him with
    `_place(..., clamp=True)` on the *current* monitor only
    (`app/window.py:1004`), so he stops at its edge;
  - `drag_by` (compositors with no global cursor, such as sway) clamps the
    same way (`:1023-1028`).
- **Pushing towards the other screen docks him instead.** After a drop,
  `_dock_if_edge` (`:884`) docks him as a notch if the cursor is within
  40 px of the nearest edge of its monitor, even when that edge is shared
  with another screen.
- **What works today:**
  - voice ("move to the other screen");
  - `nixi-companion monitor next|prev|focused|<name>`;
  - "Follow my focused screen" in Settings.
  - None of these is a drag.

## Proposed outcome

1. **He follows the drag across screens.** While you drag him, he moves
   onto whichever monitor the cursor is on and keeps following it, with no
   jump at the border.
2. **He stays where you drop him,** and starts there next time. The saved
   position remembers the new monitor, as `monitor next` already does, and
   that monitor's spot is remembered too.
3. **Docking still works on real outer edges.** Pushing him into an edge
   with no screen beyond it still docks him as a notch. An edge shared with
   another monitor lets him through instead of docking.
4. **Nothing else changes:** the voice command, `nixi-companion monitor`,
   following the focused screen, hover mode, the docked notch, and window
   (X11) mode.

## Affected users and systems

- **Everyone with more than one monitor,** on Hyprland (layer-shell)
  first, which is p620 today. Compositors without a global cursor (the
  `drag_by` path) get the same rules where the cursor's monitor can be
  known.
- **`app/window.py`:** `_drag_loop`, `drag_by`, `_place`, `_dock_if_edge`,
  `_save_pos`, and the monitor helpers `_monitors`, `_mon_at` and
  `_hmons`.
- **Not the page:** dragging is handled by the window.

## Constraints

- **No flicker or lost drag** when he changes monitor in the middle of a
  drag. If switching the surface's monitor stutters, he may switch on
  release instead, as long as he still visibly follows the cursor across.
- **He stays wholly on one monitor** at rest, as today; he can't be dropped
  half on one screen.
- **Mixed sizes and positions:** monitors of different resolutions or
  scales, or that are offset or stacked, must work. The positions come from
  GDK and Hyprland, as `_hmons()` already joins them.
- **GPU safety:** this is window logic, so nothing changes in rendering.
  The live check on p620 still ends with `journalctl -k`.
- **The `follow_focus` setting** must not fight a drag; it already never
  moves him mid-drag, and that stays.

## Open questions

1. **Switch mid-drag, or on release?** My suggestion: mid-drag, so he
   follows the cursor; on release only if the live test stutters.
2. **Where does he land on the new screen?** My suggestion: exactly where
   you drop him, clamped inside that monitor. Not the remembered spot,
   which `monitor next` keeps using.
3. **The docked notch:** can you drag the notch itself to another screen?
   My suggestion: no change. Pulling the notch away already pops him out as
   a blob, and the blob can then be dragged across.
