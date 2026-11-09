---
status: approved
issue: 225
---

# Plan: companion size, everything smaller (default 60%)

Issue #225. Intent and spec are folded into this plan at the user's request (2026-11-09: "Approve and build"), recorded
here so review can check the diff against it.

## Why

The user, 2026-11-09: Nixi, his code sheet, cards and chips "take too much space on the screen, all of them, all the
time". Make them smaller.

## Decisions (approved by the user, 2026-11-09)

1. **One zoom for the whole companion window**, not per-element CSS: character, code sheet, cards, chips and panels
   shrink together and keep their layout.
2. **Default 60%.** Settings → Look gets a Size control (60, 75, 85, 100 %), stored as `size` in the config
   (float, clamped 0.5-1.0). Unset means 0.6.
3. Changing it applies without the user restarting Nixi by hand (relaunching the window from the app is fine).

## Steps

1. **Zoom in the native window** (snowflake `app/window.py`, plus server config/info and the Settings row).
   coders: codex (small, tricky: every page-px value crossing into window px must be scaled; reason: many coupled
   constants).
   - WebKit zoom `z` = size; the window's base size is `W*z × H*z`; every page-CSS-px value that window.py receives
     (input region rects, room requests for the sheet / cards / bar, drag and ball positions) and every page-px
     constant window.py uses (`CODE_SIDE`, `BAR_SIDE`, `WIDE`, notch offsets such as 170/230/68) are multiplied by `z`
     where they meet window pixels; values sent to the page are divided by `z`.
   - The page needs no px changes: its innerWidth stays 340 CSS px.
   - Settings → Look: "Size" with 60/75/85/100 %; saving it applies live.
   - Tests: a unit test for the px conversion helpers (region, room) at z=0.6; the existing fit tests stay green
     (they run headless at z=1). → verify: `cd tests && python3 -m unittest discover -p 'test_*.py'`.
2. **Deploy and look** (lead): nixos_config nixi-companion bump, p620 and razer; screenshot at 60%: he, the sheet
   beside him and a card all fit, clicks land (a card button, the chip).

reviewers: [codex] (PR review)

## Rollback

Set Size to 100% in Settings (same as before), or revert the PR.

## Deviations

(none yet)
