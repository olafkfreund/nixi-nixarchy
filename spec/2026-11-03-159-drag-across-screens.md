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

## Fixes after the Codex and agy review

These override the design above where they differ. All were confirmed in
the code.

1. **`_load_pos` runs before `self.hypr` exists** (`:350` vs `:400`)
   (both). Create `self.hypr = Hypr()` before the layer and position setup,
   so a connector name can be resolved at start.
2. **Release order and the full surface** (both):
   - on release, `_rewide()` first, extended to cards (`want_xw` and
     `want_h`, not only the panel or code sheet);
   - then clamp the surface with its real size, `cur_w` and `cur_h`,
     allowing for `top_shift`;
   - then save. `_place`'s clamp uses `cur_h`, not `H`.
3. **Docking in X11 mode** (both): the monitor switch in `_dock_if_edge`
   is layer-mode only. It converts the margins to the new monitor
   (`mx + g_old.x - g_new.x`, and the same for y) before `set_bar(edge)`,
   so `bar_home` and the glide start are right. X11 keeps its window move.
4. **The probe tests the chosen edge itself, not 48 px out** (Codex: a
   narrow monitor could be overshot). Use a point 1 px across that edge,
   at the cursor's coordinate along it.
   - **Corners** (agy): consider every edge within 40 px, nearest first,
     and dock on the nearest **outer** one. A shared edge never blocks an
     outer edge in the same corner.
5. **A stale name** (both): when no name can be found, `_save_pos` removes
   `name`. `_load_pos` reads `name` only when Hyprland is available.
6. **Follow-focus is broken today** (both). `_follow(self, name)` (`:739`)
   is shadowed by hover's `_follow(self)` (`:1173`), so `_watch_focus`'s
   `idle_add(self._follow, name)` raises `TypeError`.
   - Rename the follow-focus handler to `_follow_focus`.
   - Ignore `focusedmon` events, without arming the 300 ms timer, while
     `dragging`, `pmoving` or `dpos` is set, and for 600 ms after a drag
     ends. Crossing a seam emits `focusedmon`.
   - `aside_on` checks `dpos` too.
7. **Tests without GTK** (both): the pure logic moves to a new module,
   `app/screens.py`, with no `gi` import:
   - `mon_strict(geoms, x, y)`;
   - `dock_edge(geoms, cur, cursor) → edge | None`;
   - `drag_margins(geoms, cursor, off) → (i, x, y)`;
   - `pick_monitor(saved, names, n)`;
   - `outer_clamp(...)` for `drag_by`.
   - `window.py` calls these, and `tests/test_drag_screens.py` imports
     only `screens.py`.
8. **`drag_by` docking** (agy): if the window is unclamped at outer edges,
   the pointer hits the bezel first, and `over` never grows. So clamp
   **only at outer edges**:
   - where no monitor lies beyond at the ball's coordinate, clamp as today,
     and `over` collects as today, so docking works unchanged;
   - shared edges are left unclamped, and he crosses.
9. **A notch pull's grab point** (agy): `set_bar(None, to=…)` clamps
   `to`, so an offset taken from the clamped spot would be wrong. When a
   drag starts by pulling the notch:
   - the loop's grab offset is the ball (`BALL`, plus `wide_shift`), so the
     ball stays under the cursor;
   - `set_bar` chooses the monitor from `to + BALL`, the cursor.

Tests added for these:
- a corner where a shared edge meets an outer edge → dock on the outer
  one;
- a narrow middle monitor → no false dock;
- a stale name removed on save;
- `drag_by` docking at an outer edge, and crossing a shared one;
- `focusedmon` during, and just after, a drag → no move.
