---
status: approved
issue: 175
intent: intent/2026-11-04-175-settings-room.md
---

# Spec: A bigger, resizable Settings window and a Plugins tab

Code: `olafkfreund/nixoarchy-snowflake` `main`. Line numbers are from the code
map of 2026-11-04.

## Design

### 1. Settings asks for its own size, through the existing "size" path

Today, opening Settings sends `wide:on`, and the window grows a fixed 130 px
to the left (`WIDE = 470`, `window.py` 119–122, `set_wide` 544–592). The page
already has a general path for asking the window to grow: `sizeWindow()`
(`index.html` 3473) sends `size:W,H`, built from the largest of `cardWant`,
`sheetWant`, `popWant` and `stageWant`. `set_wide((w,h), "size")` then
splits the extra width left and right by the room on the monitor, grows
down first and then up, and clamps to the monitor (layer mode, 564–575).

- **New `setWant`**:
  - while `#set` is open, `setWant = [setW − 340 + 24, setH − 460 + 46]`, the
    extra width and height the panel needs. `setW`/`setH` is the user's size
    or the default;
  - `sizeWindow()` takes it into its max;
  - `settings(on)` stops sending `wide:on`/`wide:off` and calls
    `sizeWindow()` instead. When Settings closes, `setWant` returns to
    `[0,0]`, so the window shrinks back to what the remaining wants need. That
    is Nixi's own 340 × 460 when nothing else is open.
- **`#panel`** (History, Memory, Quick actions, the Claude Code plug-ins list)
  keeps `wide:on` and `WIDE = 470`, unchanged.
- **The panel's own box:** `#set` stops taking its width from `left/right`
  (`.pn`, 433). It gets `width: var(--setW)` and
  `height: min(var(--setH), 100vh − 46px)`, positioned at `left:12px; top:34px`
  inside the grown window. Its body scrolls (`.bd{overflow-y:auto}`, as now)
  only when the content is taller than the panel.
- **Default size:** 560 × 680. Before asking, the page caps it to the screen:
  - the width to `screen.availWidth − 40`;
  - the height to `0.85 × screen.availHeight`.

  `screen.avail*` is the monitor the webview is on. After `nixiLayout`, the
  page reads the real `innerWidth`/`innerHeight` and clamps `--setW`/`--setH`
  to what the window actually got. The window may give less near an edge, or
  in floating mode.

### 2. Floating-window mode also stays on screen

In the non-layer mode, `set_wide` grows only right and down (`L, R = 0, L + R`,
568–569; no `T`). Near the right or bottom edge, Settings would hang off
screen.

- **Change in `set_wide`, non-layer branch:** measure the monitor the window
  is on, with the same `_geom()` the layer branch uses. Clamp `R` to the room
  to the right and the extra height to the room below. The window then gets
  what fits, and the page's read-back clamp (section 1) shrinks the panel to
  match. No window moves: moving a floating window under X11 and Hyprland
  needs separate paths, and fitting is enough to keep Settings reachable.
- **Pure helper:** the L/R/T arithmetic of both branches moves into a pure
  function, `split_room(base, basey, W, H, xw, eh, mon_w, mon_h, layer)`,
  which returns `(L, R, T, extra_h)`. It is unit-testable without GTK, and
  `set_wide` calls it.

### 3. The user resizes Settings

- **Grips:** a bottom-right corner grip (a 14 × 14 `<div class="sgrip"
  role="separator" aria-label="Resize settings" tabindex="0">`) and the
  panel's right and bottom edges (6 px hit strips).
- **Dragging:**
  - pointer events with `setPointerCapture`;
  - each move sets `--setW`/`--setH`, clamped to at least 420 × 420 and at most
    the room the window can have (screen width − 40, 0.85 × screen height);
  - one `requestAnimationFrame`-throttled `sizeWindow()` per frame, then
    `sendRegion(true)`, so the click region follows the visible panel;
  - on `pointerup`, `{w,h}` is saved to `localStorage['nixi.setSize']`.
- **Keyboard:** the focused grip resizes with the arrow keys, 16 px per press
  and 64 px with Shift.
- **Reset:** double-clicking the grip, or pressing Enter on it, restores the
  default and forgets the saved size.
- **On open:** a saved size that no longer fits (another monitor, a smaller
  screen) is clamped as above. The saved value itself is kept, so it applies
  again on the bigger screen.

### 4. A Plugins tab

- **Tab bar** (`index.html` 788–794): a fifth button, `data-tab="plugins"`, with
  a puzzle icon, between Brain and More. The `.ind` indicator and `moveInd`
  (3104) already handle any number of tabs.
- **Moves:** the plugin rows leave More (895–898) for a new
  `<div class="tab" data-tab="plugins">`:
  - `#peersRow` (Other machines);
  - `#plugCons` (the consent card);
  - `#plugList`;
  - `#plugErr`;
  - `#plugReload`.

  The IDs stay, so `plugRender`, `plugConsent`, `plugLoad`, `plugAct` and the
  peers handler (3175, 3386) work unchanged.
- **More keeps** the notification switches, the ai-mirror row, Memory and
  history, the version, diagnostics, "Things you can just say" and the
  hotkeys.
- **Naming:** the radial-menu item and panel for Claude Code plugins
  (`openPanel('plugins')`, 2810, menu 2898) is relabelled **"Claude Code
  plug-ins"**, so the two can't be confused. Its behaviour is unchanged.
- **Remembered tab:** `localStorage['nixi.tab']` (3105–3107) now also accepts
  `plugins`. An unknown saved value falls back to `look`, so a bad value never
  deselects every tab.

### 5. Keyboard

- **Tab bar semantics:** `role="tablist"`, each button `role="tab"`,
  `aria-selected`, `aria-controls`, a roving `tabindex`, and each tab body
  `role="tabpanel"`.
- **New keys:** ArrowLeft/ArrowRight move to the previous or next tab
  (wrapping). Home and End go to the first and last. Each move selects and
  shows that tab.
- **Focus:**
  - opening Settings saves `document.activeElement` and focuses the selected
    tab button;
  - closing Settings (✕, Esc, a click outside, `closePanels`) restores focus to
    the saved element if it is still in the document.
- **Kept as today:** Esc closes, Ctrl+, opens, and Tab moves through the
  controls. Layer-shell keyboard `ON_DEMAND` is unchanged.

### 6. Scaling

`fit()` (3475–3478) scales the whole body only when the window is smaller than
340 × 460 (`fitK < 1`). In that case `transform` on `body` makes
`position:fixed` children use the body as their containing block. Settings
then opens with `fitK = 1`, because its window is at least the default size
or the clamped room. A test checks that the panel's on-screen rectangle
matches `--setW` × `--setH` at `fitK = 1`. On screens smaller than 340 × 460,
Settings follows the existing scaled layout. That is unchanged and out of
scope.

## Alternatives rejected

- **A separate top-level Settings window:** a second GTK window and webview
  means a second page state, token and bridge. The companion is built
  around one surface.
- **Raising `WIDE` for every panel:** History and Memory don't need the room,
  and the window would cover more of the desktop than they need.
- **GTK window resizing** (`set_resizable(True)` with the compositor's
  edges): there are no edges on a layer-shell surface. In floating mode the
  compositor would resize Nixi's whole surface, not the panel.
- **Moving the floating window to keep Settings on screen:** separate X11 and
  Hyprland paths for a rare case. Fitting to the room is enough.
- **Moving the Claude Code plug-ins list into the new tab:** it is a different
  thing (Claude Code's own plugins, through `/api/plugins`), with its own
  entry point and warning.

## Risks

- **A bigger surface covers more desktop while Settings is open.** It shrinks
  back on close. The click region follows the panel, so the uncovered parts
  stay click-through. On p620 and razer.
- **Resize throttling:** too many `size:` messages could make the compositor
  stutter. They are capped at one per animation frame, and the layer path
  only re-places when L or T changes.
- **Floating mode near an edge gives a smaller Settings** rather than moving.
  That is acceptable: the panel is reachable, and the body scrolls.
- **`sheetWant`, `cardWant` and `stageWant` combined with `setWant`:** the max
  is taken per axis, as today, so Settings with a stage card open never
  shrinks either one.
- **Mirror test** (`mirror_fit.mjs` 111–118) expects `#mirBar` on the Settings
  panel. It is still `#set`, so it should pass; it is re-run.

## Verification

- **Unit** (`tests/test_window_room.py`, new): `split_room` for layer mode:
  - centre: the extra width is split by room;
  - left edge: everything goes right;
  - right edge: everything goes left;
  - bottom: it grows up;
  - more than the monitor: it is clamped.

  For floating mode: right-only, clamped to the room on the right and below.
  `set_wide` uses it (a fake window object, no GTK).
- **Page** (`tests/settings_fit.mjs` + `test_settings_fit.py`, new; headless
  Chromium `--disable-gpu`, a `native` stub recording messages):
  - opening Settings sends `size:` with the default want and no `wide:on`; the
    panel is 560 × 680 when the viewport allows;
  - a smaller viewport clamps it;
  - closing sends a `size:` that returns to the base size;
  - five tabs; the Plugins tab holds `#plugList`, `#plugCons`, `#peersRow` and
    `#plugReload`; More no longer does;
  - arrow keys, Home and End move between tabs; opening focuses the
    selected tab; closing restores the earlier focus;
  - `nixi.tab = 'bogus'` falls back to Look;
  - dragging the grip changes `--setW`/`--setH`, sends at most one `size:`
    per frame, saves `nixi.setSize`, and clamps at 420 × 420;
  - a double-click resets; arrow keys on the focused grip resize;
  - `sendRegion` covers the panel after a resize;
  - the radial menu shows "Claude Code plug-ins".
- **Existing tests:** `stages_fit.mjs` (Settings from the map card, peers row,
  consent text), `accessories_fit.mjs` (`plugRender`), `mirror_fit.mjs` and
  `caption_fit.mjs` must still pass. `#peersRow` and `#plugList` keep their
  IDs, now inside the Plugins tab.
- **Full suite and build.**
- **Live on p620:**
  1. open Settings: it is about 560 × 680, and Look, Voice and Brain need
     little or no scrolling;
  2. drag the corner bigger and smaller, then close and reopen: the size is
     kept;
  3. double-click the grip: the size resets;
  4. the Plugins tab works (switch, consent, Edit, Reload);
  5. Nixi near the left, right and bottom edges: Settings stays on screen;
  6. closing returns Nixi to his own size, and the desktop beside him is
     clickable.

## Revisions after review (binding; these override the sections above where they differ)

Codex (gpt-6-sol) and agy (model not reported) reviewed the draft on
2026-11-04. Their findings were checked against the code, and these
revisions fix them:

1. **One size owner.** A single `panelSize()` decides what the window is
   asked for, from which of `#set` and `#panel` is open:
   - with `#set` open: `setWant` set, `wide:off`;
   - with `#panel` open: `wide:on`, `setWant` zero;
   - with neither: both cleared.

   Every path that opens or closes either one calls it: `settings()`,
   `openPanel()`, `closePanels()`, Esc, the click outside `.pn`, the radial
   menu, and the ✕. No path sends `wide:` or `size:` for panels by itself any
   more. Tests cover:
   - Settings → panel → close;
   - panel → Settings → close;
   - Settings → Esc;
   - Settings → click outside;
   - Settings with a stage card open.

   After each close, the window request returns to the remaining wants.
2. **Floating mode grows like layer mode.** `split_room` is used for both
   modes, with left and up growth.
   - In floating mode the window is moved by the left/top shift with the
     existing `_xmove` (X11) or Hyprland `movewindowpixel exact` (as
     `resizewindowpixel` is already used), and moved back on shrink.
   - The monitor is the one under the window's current global position
     (`Gdk.Display.get_monitor_at_point`), not the stored `mon_i`.
   - Tests use a non-primary monitor and each corner.
3. **Enter, Space and typing inside Settings never reach the global
   shortcuts.** `setEl`'s keydown stops propagation for every key except Esc
   and Ctrl+, (today it does so only for text inputs, 3397). The grip resets
   on double-click and on Enter, without closing Settings.
4. **The read-back clamp runs on every `resize` event and when Settings
   opens.** It clamps `--setW`/`--setH` to `innerWidth − 24` and
   `innerHeight − 46`, so a resize that arrives late, or a request that
   changed nothing (`set_wide` returning early), still ends with the panel
   inside the window. A test sends the size answer out of order.
5. **Position and shifts.** While `top_shift` or `wide_shift` is non-zero,
   saving the position, detecting the corner, moving between monitors and
   switching to hover all use the base position (the current position minus
   the shifts). This is how the existing wide shift is handled; it now
   covers T too. Tests: open Settings with upward growth, drag Nixi by the
   header, close; the saved position equals the base.
6. **Small screens and the minimum.** 420 × 420 is the minimum for dragging
   only. When the available room is smaller, Settings takes the room and its
   body scrolls, so the panel stays reachable at any scale. The fitK < 1
   case is covered by a test at 320 × 400.
7. **Other wants:** opening Settings from a stage card (the map card's
   Settings button, 2322) first collapses that stage to its tab, so
   `stageWant` and `setWant` don't jump the window in turn.
