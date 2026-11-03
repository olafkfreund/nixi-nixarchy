---
status: draft
issue: 159
intent: intent/2026-11-03-159-drag-across-screens.md
---

# Spec: Drag Nixi from one screen to another

All changes are in `app/window.py` (nixoarchy-snowflake). Line numbers are
at `main` `0ca82bc`. The intent's open questions were approved as
suggested:

- no clamp while dragging; clamp into the destination monitor on release;
- he lands where you drop him;
- the notch itself doesn't cross screens.

## What's there today (checked)

- **Coordinates.** Hyprland's cursor (`hypr.cursor()`) and GDK monitor
  geometry (`m.get_geometry()`) are both in global layout pixels. Hover
  mode already mixes them: `_follow` (`:1173-1213`) calls
  `_place(x-g.x, y-g.y, False, i)` with `i, g = _mon_at(cursor)` 120 times a
  second.
- **p620's layout:** DP-1 (0, 0) and DP-3 (2560, 0), both 2560×1440 at
  scale 1.
- **`_place(x, y, clamp, mon)`** (`:507-519`): switches the layer surface's
  monitor when `mon` differs, then clamps (if asked) to that monitor's
  `width - cur_w` and `height - H`, and sets the margins.
- **`_drag_loop`** (`:990-1006`, Hyprland): `ox+cx-sx, oy+cy-sy` in the
  *current* monitor's margins, with `clamp=True`.
- **`drag_by`** (`:1023-1032`, no global cursor): clamped deltas; the
  overflow collects in `over`, and `drag_end` (`:1034-1052`) docks at
  40 px or more.
- **`_dock_if_edge`** (`:884-900`): the nearest edge of the cursor's
  monitor, within 40 px. It's used by `_drag_finished` and by X11's
  `_watch_release` (`:871`).
- **`_save_pos` / `_load_pos`** (`:480-494`, `:426-437`): they save `mon`
  (a GDK index), `x` and `y`, plus `mons[name] = [x, y]` when Hyprland is
  available.
- **`set_bar(None, to=(c-BALL))`** (`drag` `:843`, `:965-970`): it picks
  the monitor from the window's top-left corner (`to`), not the cursor.
  When `was` is set, it schedules `_save_pos` 410 ms later (`:984`), which
  can fire mid-drag.

## Design

### 1. Hyprland: the drag follows the cursor across monitors (`_drag_loop`)

- **At the start,** record the grab offset in global pixels:
  `gx0 = g.x + mx`, `gy0 = g.y + my`, so `off = (sx - gx0, sy - gy0)`.
- **Each tick:**
  - `i, g = _mon_at(cx, cy)`, the cursor's monitor, as in hover mode;
  - then `_place(cx - off.x - g.x, cy - off.y - g.y, False, i)`, with no
    clamp.
  - He stays glued to the cursor at the same grab point, and the surface's
    monitor switches when the cursor crosses. That's the same call hover
    mode makes, so it's proven not to stall.
- **The panel-header drag** (`pmove`) uses the same loop, so it crosses
  too. It still never docks.
- **On release** (`_drag_finished`):
  1. the dock check (§3) runs first;
  2. if he doesn't dock, `_place(mx, my, True)` clamps him wholly inside
     the monitor he's on (`cur_w` wide, `H` tall, as `_place` already does);
  3. then `_save_pos` and `_rewide`, as today.

### 2. No global cursor: `drag_by`

- **During the drag, keep an unclamped global position:** `self.dpos`,
  started from `g.x + mx`, `g.y + my`, and moved by each `dx, dy`.
- **The monitor** is the one under his ball's centre:
  `_mon_at(dpos.x + wide_shift + BALL[0], dpos.y + BALL[1])`. Place him on
  it with no clamp.
- **`over`** becomes how far the ball's centre lies **beyond an outer
  edge**, meaning outside every monitor along that axis. It's 0 while the
  centre is over any monitor.
- **`drag_end`:** dock if `over` reaches 40 px, as today; otherwise clamp
  into his monitor and save.

### 3. Dock only at outer edges (`_dock_if_edge`, shared with X11)

- **A new helper, `_mon_strict(x, y)`:** the monitor index containing the
  point, or `None` (unlike `_mon_at`, which falls back to the current
  monitor).
- **After choosing the nearest edge** within 40 px, as today, probe 48 px
  past that edge, in the outward direction, from the cursor. If the probe
  point is on another monitor, return without docking: he passes through.
- **Partly shared edges** come out right with no special case, because the
  probe uses the cursor's own coordinate along the edge.
- **When he does dock,** `set_bar(edge)` docks him on the cursor's monitor.
  Before calling it, move the surface to the cursor's monitor
  (`_place(..., mon=i)`), so dropping 1–39 px inside the next screen
  against a real outer edge docks on *that* screen.

### 4. Saved position by connector name (`_save_pos` / `_load_pos`)

- **Save** also writes `name` (the connector, e.g. `DP-3`) when Hyprland
  is available, from `_hmons()`, which `_save_pos` already uses for
  `mons`.
- **Load:**
  - `name` present and connected → that monitor's GDK index;
  - `name` present but not connected → the default spot, bottom-right of
    monitor 0;
  - no `name` (an older file, or another compositor) → `mon` as today.
- `x` and `y` are then clamped into that monitor, as today.

### 5. Saves never land mid-drag

- **The delayed save** after pulling the notch away (`:984`) skips if a drag
  is running (`self.dragging`, or `dpos` set). The drag's own end saves
  the final spot.
- **`set_bar(None, to=…)`** from `drag`: it chooses the monitor from the
  cursor `c`, not from `to` (the window's top-left). It places at
  `to - g.origin` on that monitor.

### 6. Unchanged

- Voice, `nixi-companion monitor …` (`go_monitor`), follow-focus, which
  never moves him mid-drag (it checks `dragging`; `dpos` is added to the
  same check), and hover mode.
- X11 mode's drag, apart from §3's docking rule.

## Alternatives rejected

- **Clamping on the current monitor while dragging, and switching on
  release.** He'd stop at the border, then jump. The intent rules that out.
- **Clamping on the cursor's monitor during the drag.** He'd jump by his
  own width at the border.
- **One big layer surface spanning all monitors.** Layer-shell surfaces
  belong to one output, and that would also break click-through regions.
- **Saving only `mons[name]`.** It's a per-monitor memory, not "where he
  was". A separate `name` keeps both.

## Risks

- **Mixed scales.** Both sources are layout pixels, as hover relies on.
  p620 is scale 1 on both monitors, so mixed scales aren't verified live.
  The unit tests cover an offset, differently sized layout with fake
  geometry.
- **A surface's monitor switching** while the pointer is held: the same as
  hover mode, which works on p620. The live check confirms it with a real
  drag.
- **An unclamped position mid-drag can put part of him off-screen**
  briefly, at an outer edge. He's clamped back on release, as in hover.
- **Hosts:** p620, which has two monitors. Razer is single-screen: only
  the docking and saved-position paths apply there.

## Verification

- **Unit tests** (`tests/test_drag_screens.py`), on the window logic with
  fake monitors. Build a minimal `Overlay`-like object, or call the pure
  helpers once they're factored out, without GTK. Geometries: side by side
  `[0,0,2560,1440]` + `[2560,0,2560,1440]`, and offset
  `[0,0,1920,1080]` + `[1920,200,2560,1440]`.
  - **Drag:** a cursor path crossing x=2560 gives `_place` calls with
    `mon` switching from 0 to 1 at the crossing, the same grab offset, and
    no clamp. The release clamps inside monitor 1.
  - **Docking:**
    - the cursor at x=2555 (DP-1's right edge, shared): no dock;
    - at x=5115 (DP-3's right edge, outer): dock right on monitor 1;
    - offset layout, the cursor on the left monitor's right edge at
      y=100 (no monitor beyond at that height): dock;
    - at y=600 (shared): no dock.
  - **`drag_by`:** deltas carrying the ball's centre over the border switch
    the monitor; pushing 40 px past the outer right edge docks.
  - **Saved position:** a save on DP-3 writes `name: "DP-3"`; a load with
    reversed GDK order still picks DP-3; a disconnected name falls back to
    the default spot.
  - **The delayed notch save** is skipped while `dragging` is true.
- **The full suite** (`python -m unittest discover -s tests`) stays green.
- **Live on p620,** after deploy:
  - drag him from DP-1 onto DP-3 and back, and drag a panel header across;
  - drop just inside DP-3: no notch;
  - push into DP-3's far right edge: he docks on DP-3;
  - restart Nixi: he reappears on DP-3;
  - `journalctl -k` is clean.

## Open questions

None. The intent's three were approved as suggested.
