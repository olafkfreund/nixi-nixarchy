---
status: draft
issue: 159
spec: spec/2026-11-03-159-drag-across-screens.md
coders:
  1: codex   # pure geometry helpers and their tests: small, tricky edge maths
  2: coder   # wiring the helpers into window.py's drag, dock and release paths: several functions, moderate size
  3: coder   # start-up order and saved-position name: small, same agent keeps context
  4: codex   # the follow-focus name clash and its drag guards: small, timing-sensitive
reviewers:
  - codex    # independent read of the diff against this plan
  - agy      # the spec review found nine distinct issues between them; keep both
---

# Plan: Drag Nixi from one screen to another

Code: `olafkfreund/nixoarchy-snowflake`, branch `feat/159-drag-across-screens`
from `main`. Line numbers are in `app/window.py` at `0ca82bc`. All Python;
the page doesn't change.

## Decisions (from the approved spec, with its review fixes)

- **The pure geometry lives in a new `app/screens.py`,** with no `gi`
  import. `window.py` calls it, and tests import only it. Geometries are
  `[(x, y, w, h), …]` in global layout pixels, in GDK order.
- **Hyprland drag:**
  - the grab offset is in global pixels (`off = cursor - (g.x+mx, g.y+my)`);
    after a notch pull it's `(BALL[0]+wide_shift, BALL[1])`;
  - each tick places him on the cursor's monitor with no clamp, as hover
    mode does;
  - `pmove` takes the same path and never docks.
- **Release, in order:**
  1. the dock check;
  2. otherwise `_rewide()`, extended to cards (`want_xw`, `want_h`);
  3. a clamp of the whole surface (`cur_w`, `cur_h`, `top_shift`) into
     its monitor;
  4. `_save_pos`.
- **`drag_by`:** keep an unclamped `dpos`. Clamp only at outer edges (no
  monitor beyond, at the ball's coordinate), so `over` collects there as
  today; leave shared edges unclamped. The monitor is the one under the
  ball's centre.
- **Docking:**
  - consider every edge within 40 px of the cursor, nearest first;
  - an edge is outer if the point 1 px across it, at the cursor's
    coordinate along it, is on no monitor;
  - dock on the nearest outer edge, and none if every candidate is shared;
  - layer mode only: move the surface to the cursor's monitor, with the
    margins converted, before `set_bar(edge)`;
  - X11 keeps its window move.
- **Saved position:**
  - `name` (the connector) is written when Hyprland knows it, and removed
    otherwise;
  - on load, `name` wins if it's connected; a disconnected name → the
    default spot; no name → `mon`;
  - `self.hypr` is created before `_load_pos`.
- **No mid-drag saves:** the delayed save after a notch pull skips while
  `dragging`, `pmoving` or `dpos` is set. `set_bar(None, to=…)` picks its
  monitor from `to + BALL`.
- **Follow-focus:**
  - rename `_follow(self, name)` (`:739`) to `_follow_focus`, and fix its
    caller (`:668`);
  - ignore `focusedmon` while dragging, and for 600 ms after; `aside_on`
    checks `dpos`.

## Traps

- **Two `_follow` methods:** hover's `_follow(self)` (`:1173`) shadows the
  focus one today. Rename only the focus one.
- **`_load_pos`** runs at `:350`; `self.hypr = Hypr()` is at `:400`. Move
  the latter up, not the former down: the position must be set before the
  window is shown.
- **`_place()`** calls `GtkLayerShell` unconditionally. Never call it in
  X11 mode.
- **`window.py` imports `gi`** and can `os.execv` at import time. Tests
  must not import it.
- **Nothing here touches rendering.** The live check still ends with
  `journalctl -k`.

## Steps

1. **`app/screens.py` and its tests** → codex
   - `mon_strict(geoms, x, y) -> int | None`.
   - `dock_edge(geoms, cur, cursor, reach=40) -> str | None`: the edges of
     monitor `cur` within `reach` of the cursor, nearest first; returns the
     first outer one.
   - `drag_place(geoms, cursor, off, cur) -> (i, mx, my)`: the cursor's
     monitor (falling back to `cur`), and the margins on it of
     `cursor - off`.
   - `clamp_on(geom, x, y, w, h) -> (x, y)`: margins clamped so a `w×h`
     surface fits.
   - `outer_clamp(geoms, cur, gx, gy, w, h, ball) -> (gx, gy, over)`:
     clamps the global position only at outer edges (judged at the ball's
     global centre); `over` is how far it was pushed past one.
   - `pick_monitor(saved, names, n) -> int | None`: `names` is
     `[(connector, gdk_index), …]`; returns `None` for "use the default
     spot".
   - `tests/test_drag_screens.py`, for every case in the spec's
     Verification and review-fix test lists:
     - side-by-side and offset layouts;
     - a corner where a shared edge meets an outer one;
     - a narrow middle monitor;
     - a stale name;
     - `drag_by` docking and crossing.
   - **Verify:** `python -m unittest discover -s tests -p test_drag_screens.py`.

2. **Wiring in `window.py`** → coder
   - **`_drag_loop`** (`:990-1006`): the global offset (from `drag`, or the
     ball after a notch pull), then `drag_place` each tick, then
     `_place(x, y, False, i)`.
   - **`drag_by` / `drag_end`** (`:1023-1052`): `dpos` and `outer_clamp`;
     the monitor under the ball; `over` from `outer_clamp`. Clear `dpos` at
     the end.
   - **`_drag_finished`** (`:1008-1015`) and the end of `drag_end`:
     - the dock check, then `_rewide()`, then `clamp_on` with
       `cur_w`/`cur_h`/`top_shift` via `_place(..., True)`, then save;
     - `_place`'s clamp (`:512-514`) uses `cur_h`;
     - `_rewide` (`:1017-1021`) also runs for `want_xw`/`want_h`.
   - **`_dock_if_edge`** (`:884-900`): `dock_edge` on the cursor's
     monitor. Layer mode moves to that monitor with converted margins before
     `set_bar`.
   - **`drag`** (`:843`) and **`set_bar`** (`:965-971`, `:984`):
     - choose the monitor from `to + BALL`;
     - a flag so `_drag_loop` uses the ball offset;
     - the delayed save is skipped during a drag.
   - **Verify:**
     - `python -m unittest discover -s tests` stays green;
     - `python -c "import ast; ast.parse(open('app/window.py').read())"`.
   - **Traps:** no `GtkLayerShell` calls in X11 mode; don't move
     `_load_pos` (that's step 3).

3. **Start-up order and the saved name** → coder (same agent)
   - Move `self.hypr = Hypr()` (`:400`) above the layer and position setup
     (`:338-350`).
   - **`_save_pos`** (`:480-494`): write `name`, or `p.pop("name", None)`.
   - **`_load_pos`** (`:426-437`): when `self.hypr.ok()`, use
     `pick_monitor`.
   - **Verify:**
     - the step 1 tests;
     - a tiny test that `pick_monitor` decides between a saved name and a
       GDK index;
     - the full suite.

4. **Follow-focus** → codex
   - Rename the focus `_follow` to `_follow_focus` (`:739`) and its
     `idle_add` caller (`:668`).
   - In the `focusedmon` handler, return before arming the 300 ms timer
     while `dragging`/`pmoving`/`dpos` is set, or within 600 ms of a drag's
     end (`self.drag_t_end`, set in `_drag_finished` and `drag_end`).
   - `aside_on` (`:679`) also checks `dpos`.
   - **Verify:** the full suite, plus `grep -n "def _follow" app/window.py`
     shows two distinct names.

5. **Review, PR, deploy, live check** → lead
   - The Opus reviewer, plus Codex and agy (`reviewers:`).
   - The PR, with `@codex review`. Then deploy to p620 and razer.
   - **The live check on p620 needs the user** (a real drag can't be
     faked):
     - drag him from DP-1 to DP-3 and back, and drag a panel header across;
     - drop just inside DP-3: no notch;
     - push into DP-3's right edge: he docks there;
     - restart Nixi: he's back on DP-3;
     - turn "Follow my focused screen" on: he follows focus, but not
       mid-drag;
     - `journalctl -k` is clean.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/snow-159
python -m unittest discover -s tests -p test_drag_screens.py
python -m unittest discover -s tests
```

## Rollback

Revert the squash commit, bump `nixi-companion` in `~/.config/nixos`, and
deploy. An extra `name` key in `pos.json` is ignored by older builds.
