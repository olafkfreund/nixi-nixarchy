---
status: draft
issue: 196
intent: intent/2026-11-05-196-settings-over-board.md
---

# Spec: Settings opened over a board stays next to Nixi

## Design

While a panel is open, a board stops asking for room. That one rule puts Settings back in
its normal spot, because the window is then only as big as Settings wants. The board's
state stays as it was, so it comes back when the panel closes.

All of it is in `app/static/index.html`. "A panel is open" means `body.pnl`, which
`panelSize` sets for Settings and the history and plugins panel. `panelSize` sets it before it
calls `sizeWindow`, so the order is already right.

**1. `sizeWindow`:** with `body.pnl`, `stageWant` and `popWant` count as zero. Both show things
that `body.calm` already hides. `cardWant` and `sheetWant` still count. Because the wants
themselves are kept, closing the panel restores the board's room with no extra state, and
`stgSize` calls during a panel can't move anything.

**2. CSS:** add `body.calm #stgTab` and `body.calm #chalk` to the rule that already hides `#stg`.
`sendRegion` skips elements with no size, so the hidden tab takes no clicks.

**3. A new board during a panel:** `stageShow` starts with
`if(document.body.classList.contains('pnl')){ stgHeld=ev; return; }`, before it touches the
current board or its gauge. The newest one wins. Returning `undefined` means `onEvent` doesn't
put its text in the caption.

**4. When the panel closes:** in `panelSize`'s closing branch, after `sizeWindow`, if `stgHeld`
is set, take it and show it through the same path as a live `stage` event. Its normal gates
then apply, including the caption fallback (hidden, the bar, hover, fullscreen, locked,
listening, an approval), so `onEvent`'s two lines become one function, `stageIn(ev)`.

**5. A board the server closes during a panel:** `stageClosedByServer` also clears `stgHeld`.

**6. Timers:** `stageTick` starts with
`if(document.body.classList.contains('pnl')){ stgUse=stgQuiet=now; return; }`. They wait, and
the board gets its full time after the panel closes. This covers the 20 s, 30 s and gauge 120 s limits.

**7. Gauges:** nothing to add. `stageVisSync` already reports the board as not shown under
`body.calm`, and `gaugeLoop` pauses rather than stops. When the panel closes, the next refresh
brings the newest values, within one `GAUGE_MS`. `gaugeUpdate` still applies because `stgState`
stays `open`.

The panel-to-panel case works by the same rule, since `body.pnl` stays set.

## Alternatives rejected

- **Close the board when Settings opens:** simpler, but loses what you were looking at. The user
  chose to keep it.
- **Anchor Settings to Nixi inside the wide window:** keeps 800 px of empty, click-through room
  for a hidden board, and needs a second placement rule for panels.
- **Zero `stageWant` on open and restore it on close:** needs saved state and misses `stgSize`
  calls made during the panel. Ignoring it in `sizeWindow` needs neither.
- **A queue of boards held during a panel:** only the newest one matters when you come back.

## Risks

- **Test `6g` in `tests/settings_fit.mjs`** asserts the old combined `size:300,266`. It becomes
  `size:244,266`, and its closing assertion stays `size:300,0`.
- **A window resize when Settings closes over a large board:** the room comes back at that point,
  as it would when any board opens. Nixi doesn't move on screen, since `set_wide` shifts the page.
- **A held board can be old** if Settings stays open a long time. It still shows, with fresh timers.
- **`index.html` is shared** with #178 and #188, which another session is merging today. Merge main
  before starting.
- **The fast right-click and gear click** isn't promised fixed: nobody has reproduced it. It's only
  re-tested, as approved.

## Verification

**Page tests in `tests/settings_fit.mjs`** (headless, `--disable-gpu`), each checked to fail without
its change:

- open board, then Settings: last message `size:244,266`, and `setEl`'s left is its normal value;
  closing gives `size:800,0`, the board is `open` and visible;
- tab, then Settings: `size:244,266`, the tab has no size; closing gives `size:300,0`, the tab is back;
- `stgSize(0)` during Settings sends no change of width;
- a `stage` event during Settings: no caption text, the old board untouched; closing shows the new
  one; two events: the newest; `stage_close` afterwards: none shown;
- `stageTick` with an old `stgUse` during Settings: still open, `stgUse` fresh, and on closing it
  doesn't close on the next tick;
- history panel: same size rule, and moving from Settings to the panel keeps the board hidden.

Also `test_stages_fit`, `test_accessories_fit`, and the full suite.

**Live on p620:**

- ask for a board, then open Settings with the gear: same spot as without a board, Nixi uncovered;
- toggle "Other machines" with Settings open: nothing moves;
- close: the board returns, or stays closed if the server closed it;
- wait 40 s in Settings, close: the board is still up;
- with a board up, right-click then gear a second later, a few times.
