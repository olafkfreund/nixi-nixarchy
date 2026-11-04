---
status: approved
issue: 175
spec: spec/2026-11-04-175-settings-room.md
coders:
  1: codex   # window geometry in both modes: small, tricky arithmetic and moves
  2: agy     # large page change: the size owner, the Settings box and its clamp
  3: agy     # large mechanical page change: the Plugins tab, naming, keyboard
  4: codex   # resize grips: pointer, keyboard and throttle logic
reviewers:
  - codex    # second model on the diff, read-only (codex review --base origin/main)
  - agy      # second model on the size transitions and keyboard, read-only
---

# Plan: A bigger, resizable Settings window and a Plugins tab

## Approved decisions (from the spec and its binding revisions)

- **Code:** `olafkfreund/nixoarchy-snowflake`, branch `feat/175-settings-room`
  from `main`, worktree `../nixoarchy-snowflake-175`. Line numbers are from
  the code map; re-find them by the quoted names.
- **Size owner:** `panelSize()` in `index.html` decides the window request:
  - `#set` open → `setWant = [setW − 340 + 24, setH − 460 + 46]` and
    `wide:off`;
  - `#panel` open → `wide:on`, `setWant = [0,0]`;
  - neither → both cleared.

  `sizeWindow()` (3473) takes `setWant` into its per-axis max. Every
  open/close path calls `panelSize()`, and nothing else sends `wide:` or
  `size:` for panels:
  - `settings()` (3099);
  - `openPanel()` (2792);
  - `closePanels()` (2785);
  - Esc (3597);
  - the click outside `.pn` (3590);
  - the radial menu;
  - ✕ (3330).
- **The Settings box:** `#set` gets `width: var(--setW)` and
  `height: min(var(--setH), 100vh − 46px)` at `left:12px; top:34px`. The body
  scrolls when needed. `#panel` is unchanged.
  - The default is 560 × 680, capped to `screen.availWidth − 40` and
    `0.85 × screen.availHeight`.
  - The read-back clamp to `innerWidth − 24` and `innerHeight − 46` runs on
    every `resize` event and when Settings opens.
  - Opening Settings from a stage card (2322) first collapses the stage to
    its tab.
- **The window, `split_room(base, basey, W, H, xw, eh, mon_w, mon_h)`:** a
  pure function returning `(L, R, T, extra_h)`.
  - Extra width is split by the room on each side; height grows down first,
    then up; everything is clamped to the monitor.
  - It is used by `set_wide` (544–592) in **both** modes.
  - **Floating mode:**
    - the monitor is `Gdk.Display.get_monitor_at_point` at the window's
      current global position;
    - left and top growth moves the window, with `_xmove` on X11 or
      Hyprland `movewindowpixel exact` beside the existing
      `resizewindowpixel`;
    - it moves back on shrink.
  - **Position:** while `wide_shift` or `top_shift` is non-zero, saving the
    position, detecting the corner, moving between monitors and switching to
    hover use the base position (current minus shifts).
- **Resize:**
  - a corner grip `.sgrip` (14 × 14, `role="separator"`, `aria-label="Resize
    settings"`, `tabindex=0`) plus 6 px right and bottom edge strips;
  - pointer capture; the size is clamped to at least 420 × 420 and at most
    the screen cap (the minimum applies to dragging only; with less room,
    Settings fills it and scrolls);
  - one rAF-throttled `sizeWindow()`, then `sendRegion(true)`, per frame;
  - the size is saved to `localStorage['nixi.setSize']` on `pointerup`;
  - keyboard on the grip: arrows resize 16 px, 64 px with Shift;
  - a double-click or Enter on the grip resets to the default and forgets
    the saved size;
  - a saved size that doesn't fit is clamped on open but kept in storage.
- **The Plugins tab:**
  - a fifth button, `data-tab="plugins"`, between Brain and More;
  - `#peersRow`, `#plugCons`, `#plugList`, `#plugErr` and `#plugReload` move
    from More (895–898) into `<div class="tab" data-tab="plugins">`, with the
    same IDs;
  - the radial-menu item and the `openPanel('plugins')` title become "Claude
    Code plug-ins";
  - `nixi.tab` accepts `plugins`; an unknown value falls back to `look`.
- **Keyboard:**
  - `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, `aria-controls` and a
    roving `tabindex`;
  - ArrowLeft/ArrowRight wrap, and Home/End select and show;
  - opening Settings saves `document.activeElement` and focuses the selected
    tab, and closing (every path) restores it if it is still connected;
  - `setEl`'s keydown stops propagation for every key except Esc and Ctrl+,,
    so Enter, Space and typing never reach `showAsk` or the global
    shortcuts.

## Steps

Each step is one commit on `feat/175-settings-room`, made by the lead after
checking. Tests run from `tests/`. Name the step in the commit.

**1. Window geometry** — codex
- `app/window.py`:
  - `split_room()`, a pure module-level function;
  - `set_wide` (544–592) uses it in both modes;
  - floating mode: the monitor at the window's position, and the move by
    L/T on X11 (`_xmove`) and on Hyprland (`movewindowpixel exact`), back on
    shrink;
  - base-position handling for `top_shift` where the position is saved,
    the corner detected and hover switched (find each use of `wide_shift`
    and add `top_shift` to the same arithmetic).
- Tests: `tests/test_window_room.py` (new):
  - `split_room`:
    - centre, left edge, right edge, bottom (grows up), more than the
      monitor (clamped);
    - floating mode on a non-primary monitor offset (`mon_x` ≠ 0);
  - `set_wide` with a fake window object (no GTK), checking which move
    calls it makes per mode;
  - the saved position equals the base after an upward-grown open → drag →
    close.
- Check: `python3 -m unittest test_window_room test_drag_screens`.
- Traps:
  - `window.py` imports GTK at module level; put `split_room` where the test
    can import it without a display (or guard the import), as
    `test_drag_screens` does for `screens`;
  - layer mode's existing behaviour must stay identical for `wide:on`.

**2. The size owner and the Settings box** — agy
- `app/static/index.html`:
  - `panelSize()`, `setWant` in `sizeWindow()`, and every open/close path
    routed through it;
  - the `#set` CSS variables, the default cap, and the read-back clamp on
    `resize` and on open;
  - the stage collapse when Settings opens from a stage card.
- Tests: `tests/settings_fit.mjs` + `tests/test_settings_fit.py` (new;
  headless Chromium `--disable-gpu`; a `native` stub recording messages):
  - opening sends `size:` with the default want and no `wide:on`;
  - the box is 560 × 680 in a large viewport and clamped in a small one;
  - transitions: Settings → panel → close, panel → Settings → close,
    Esc, the click outside, and with a stage card open. After each, the last
    request returns to the base or to the remaining want;
  - a late `resize` (the viewport changed after open) re-clamps;
  - at 320 × 400 (fitK < 1), Settings fills and scrolls.
- Check: `python3 -m unittest test_settings_fit test_stages_fit test_mirror_fit test_caption_fit`.
- Traps: headless only; `#panel` keeps `wide:on`; `sendRegion` still
  measures `#set`.

**3. The Plugins tab, naming and keyboard** — agy
- `app/static/index.html`:
  - the fifth tab button and the tab body;
  - the five IDs moved;
  - the tab ARIA roles and arrow/Home/End handling;
  - `nixi.tab` fallback;
  - focus save and restore in `panelSize()`'s open/close;
  - `setEl` keydown isolation;
  - "Claude Code plug-ins" in the radial menu and the panel title.
- Tests (in `settings_fit.mjs`):
  - five tabs; Plugins holds the five IDs, and More doesn't;
  - arrows, Home and End move between tabs;
  - opening focuses the tab, and closing restores focus;
  - `nixi.tab='bogus'` falls back to Look;
  - Enter on a tab or a button inside Settings doesn't call `showAsk` and
    doesn't close;
  - the menu label.
- Plus the existing `accessories_fit.mjs` (`plugRender`) and `stages_fit.mjs`
  (peers row, consent text) still pass.
- Check: `python3 -m unittest test_settings_fit test_accessories_fit test_stages_fit`.
- Traps: keep the IDs; the consent flow and hash are untouched.

**4. Resize grips** — codex
- `app/static/index.html`:
  - `.sgrip` and the edge strips;
  - the pointer handling with capture;
  - the clamp, the rAF throttle, saving, reset on double-click or Enter,
    and the arrow keys.
- Tests (in `settings_fit.mjs`):
  - a synthetic drag changes `--setW`/`--setH`, sends at most one `size:` per
    frame, saves `nixi.setSize`, and clamps at 420 × 420;
  - a double-click resets; Enter resets without closing; arrows resize;
  - a saved size bigger than the viewport opens clamped, and storage keeps
    the original;
  - `sendRegion` covers the resized panel.
- Check: `python3 -m unittest test_settings_fit`.
- Traps: `pointerup` outside the window (capture); no `size:` flood.

**5. Review, PR, deploy, live check** — lead
- The full suite from `tests/`, plus `nix build .#nixi-companion`.
- Reviews:
  - a fresh Opus agent (this plan plus `git diff origin/main...HEAD`);
  - `codex review --base origin/main`;
  - agy `--mode plan` on the size transitions, both window modes and the
    keyboard.

  Fix, re-run, commit.
- PR, `@codex review`, merge.
- Bump `nixi-companion` in a nixos_config worktree, then a PR with
  `@codex review`, then CI, then merge.
- Deploy from a clean worktree (`nh os switch .`), announced on the agent
  bus; restart the companion with the live Hyprland signature.
- Live on p620, with control through ai-mirror (the user approves):
  1. open Settings: it is about 560 × 680;
  2. drag the corner: it resizes, and is kept after close and reopen;
  3. double-click the grip: it resets;
  4. the Plugins tab works;
  5. Nixi at the left, right and bottom edges: Settings stays on screen;
  6. close: Nixi is back to his size, and the desktop beside him is
     clickable;
  7. the arrow keys move between tabs.

## Tests

| Command (from `tests/`) | Expected |
|---|---|
| `python3 -m unittest discover -s .` | all pass |
| `nix build .#nixi-companion` (repo root) | builds |
| `python3 -m unittest test_settings_fit test_window_room` | the new checks pass |

## Rollback

Revert the merge commit in the fork, or roll back the `nixi-companion` bump.
Saved sizes in `localStorage` are ignored by older builds.

## Deviations (made during implementation)

- **Step 1:**
  - `side` is a `(left, right)` pair, which keeps the room the code panel
    and the bar need on both sides;
  - the window stores its physical top-left corner, so the base position is
    that corner **plus** the shifts (the revisions said "minus").

## Revisions after review (binding; these override the steps above where they differ)

Codex (gpt-6-sol) and agy (model not reported) reviewed the draft. Each
finding was checked against `window.py` and `index.html`.

1. **`split_room` lives in a new GTK-free module, `app/room.py`.**
   `window.py` imports `gi`/GTK/WebKit at load (29, 75), so a helper inside it
   can't be imported by a test without a display. The signature is
   `split_room(x, y, w, h, xw, eh, side, mon)`:
   - `x, y` is the window's base position in global coordinates;
   - `side` is the left room that code, bar or panel already need;
   - `mon` is the monitor rect `(mx, my, mw, mh)`, including its origin.

   It returns `(L, R, T, extra_h)`. `window.py` imports it, and the tests
   import `room` directly.
2. **Base position, by function.** Step 1 names exactly where the base
   (current position minus the `L`/`T` shifts) must be used:
   - `_moved` (floating, which stores the current position);
   - `_save_xpos`;
   - `set_hover`;
   - `go_monitor`;
   - the corner detection;
   - `_place` (layer).

   Floating mode subtracts the shifts in `_moved` before storing. A test
   covers each path with a fake window.
3. **The Hyprland move:** use the existing `_xmove()`, which already calls
   `Hypr.move()` → `movewindowpixel exact` (`window.py` 919, 231). No new
   Hyprland call is needed.
4. **Wanted size ≠ shown size.**
   - `setW`/`setH` (the user's or the default) is what `setWant` requests,
     and it is never reduced by the read-back clamp.
   - The shown box is `width: min(var(--setW), 100vw − 24px)` and
     `height: min(var(--setH), 100vh − 46px)`, so the clamp is pure CSS.
   - Dragging changes `setW`/`setH` directly. The window can therefore grow
     on open and during a drag.
5. **From a stage card:** the Settings button (2322) calls `stageHide(true)`,
   which collapses to the tab, instead of `stageClose()`, before opening
   Settings.
6. **More transitions in step 2's tests:**
   - Settings → Memory/History (the `data-open` buttons, 3351);
   - Quick actions → Settings (2870);
   - **an out-of-order size answer**: a stale `size:` acknowledgement or a
     `resize` that arrives after a newer request leaves the box matching
     the latest request.
7. **Region checks run with `?native=1`**, so `sendRegion()` isn't a no-op
   (947, 3482), with a stubbed `window.webkit.messageHandlers.nixiui`.
8. **At fitK < 1** (320 × 400), the test asserts only that Settings is
   reachable and its body scrolls. The pixel size isn't checked, because
   `transform` changes the containing block.
9. **Small items for step 3:**
   - the Plugins tab button gets the puzzle icon;
   - moving the plugin rows keeps their `.row` wrapper (895–898);
   - the `nixi.tab` fallback also applies in `settings(true, tab)` when
     called with an unknown tab;
   - arrow keys on a focused `.sgrip` call `preventDefault`, so the body
     doesn't scroll (step 4).
