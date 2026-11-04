---
status: approved
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
- **On Hyprland (layer-shell)** a layer surface belongs to one monitor at a
  time:
  - `_drag_loop` follows the global cursor, but places him with
    `_place(..., clamp=True)` on the *current* monitor only
    (`app/window.py:1004`, `:507-514`), so he stops at its edge;
  - the panel-header drag (`pmove` → `drag(panel=True)`, `:818-855`) uses
    the same loop and has the same limit.
- **On layer-shell compositors with no global cursor** (the `drag_by` path,
  `:1023-1032`), each move is clamped too. Pushing past the edge collects in
  `over`, and `drag_end` (`:1034-1046`) docks him once it passes 40 px.
- **Pushing towards the other screen docks him, or docks him on the wrong
  screen.** On release, `_dock_if_edge` (`:884-900`) docks him if the
  *cursor* is within 40 px of the nearest edge of the cursor's monitor,
  even when that edge is shared with another screen.
  - Release 1–39 px inside the next screen, and he docks on the old
    screen's matching edge.
  - Release further in, and he stays stuck at the old screen's edge.
  - X11 (window) mode shares `_dock_if_edge` (`:871`), so it also docks
    wrongly on a shared border.
- **The pattern already exists.** Hover mode switches monitors mid-movement
  on Hyprland: it calls `_place(x, y, False, i)` with the monitor under the
  cursor and no clamp (`_follow`, around `:1207`).
- **What works today:**
  - voice ("move to the other screen");
  - `nixi-companion monitor next|prev|focused|<name>`;
  - "Follow my focused screen" in Settings.
  - None of these is a drag.

## Proposed outcome

1. **He follows the drag across screens,** on Hyprland and on the `drag_by`
   path alike, for both his own drag and the panel-header drag.
   - While you drag, he moves onto the monitor the cursor (or, on
     `drag_by`, his own unclamped position) is over, and keeps following.
   - He never jumps by his own width or height at the border.
2. **He stays wholly on one monitor where you drop him:** clamped inside
   that monitor, including when the window is widened for a panel or a
   card.
3. **He starts there next time.** The saved position names the monitor by
   its **connector name** (e.g. `DP-1`), not a GDK index, so reordered or
   unplugged monitors can't reopen him on the wrong screen. With an unknown
   name, he falls back as today. That monitor's spot is remembered, as
   `monitor next` already does.
4. **Docking still works on real outer edges.** Pushing into an edge where
   no monitor lies beyond *at that point* still docks him as a notch.
   - Where an edge is shared with another monitor, he passes through.
   - On mismatched or offset monitors, only the shared span counts as
     shared.
   - This also fixes X11 mode's wrong docking on a shared border.
5. **Nothing else changes:** the voice command, `nixi-companion monitor`,
   following the focused screen, hover mode, the docked notch, and X11 mode
   apart from the docking fix.

## Affected users and systems

- **Everyone with more than one monitor.** Hyprland (layer-shell) first,
  which is p620 today; then other layer-shell compositors (`drag_by`). X11
  only gets the docking fix.
- **`app/window.py`:**
  - the drags: `drag`, `_drag_loop`, `drag_by`, `drag_end`,
    `_drag_finished`;
  - placement: `_place`, the wide-window handling (`cur_w`, `wide_shift`,
    `_rewide`);
  - docking: `_dock_if_edge`;
  - saved positions: `_save_pos`, `_load_pos`;
  - pulling the notch away: `set_bar(None, to=…)` and its delayed
    `_save_pos`;
  - the monitor helpers `_monitors`, `_mon_at` and `_hmons`.
- **Not the page:** it only sends `drag`, `pmove`, `dragby` and `dragend`.

## Constraints

- **The drag never stalls or drops** when he changes monitor. Like hover
  mode, the drag places him without clamping while it runs, switches the
  surface's monitor when he crosses, and clamps him into the destination
  monitor on release.
- **Mixed resolutions, scales and positions** must work: offset or stacked
  monitors, and different scales. Mapping cursor and margin coordinates
  across scales isn't solved by `_hmons()` today. It only matches monitor
  origins, so it's a required check, not an assumption.
- **A save during a drag must not record a half-finished position:** for
  example, the 410 ms delayed save after pulling the notch away.
- **GPU safety:** this is window logic, so nothing changes in rendering.
  The live check on p620 still ends with `journalctl -k`.
- **The `follow_focus` setting** never moves him mid-drag, as today.

## Open questions

1. **Clamp during the drag, or only on release?** My suggestion: like hover
   mode, no clamp while dragging, and clamp into the destination monitor on
   release. The other option, clamping as he goes, makes him jump by his
   own width at the border.
2. **Where does he land on the new screen?** My suggestion: exactly where
   you drop him, clamped inside that monitor. Not the remembered spot,
   which `monitor next` keeps using.
3. **The docked notch:** can you drag the notch itself to another screen?
   My suggestion: no change. Pulling it away pops him out as a blob, and
   the blob can then be dragged across.

## Review (Codex and agy, read-only)

Confirmed in the code, and fixed in this draft:

- **The "switch on release" fallback** contradicted "visibly follows" (both).
  Hover mode already switches monitors mid-movement without clamping
  (agy), so open question 1 is now about clamping.
- **The `drag_by` path** needed its own outcome. GDK monitor geometry is
  available there too (both).
- **Saving a GDK monitor index** can reopen him on the wrong screen after
  monitors are reordered. The saved position now uses the connector name
  (Codex).
- **The panel drag (`pmove`), the widened window, and the delayed save**
  after pulling the notch away were missing (both).
- **`_dock_if_edge` uses the cursor's monitor:** dropping just inside the
  next screen docks him on the *old* screen. X11 shares the same function
  (agy).
- **Partly shared edges** on mismatched monitors (agy). And `_hmons` doesn't
  convert between scales (Codex).
