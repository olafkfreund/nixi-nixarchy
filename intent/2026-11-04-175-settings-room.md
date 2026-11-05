---
status: approved
issue: 175
author: olafkfreund
---

# Intent: A bigger Settings window and a Plugins tab

## Problem

Nixi's own surface is 340 × 460 px (`app/window.py`, `W, H = 340, 460`).
Opening Settings widens it to a 470 px panel (`index.html`, where the page
asks the window to grow). That's still sized for a small popup, not a form.
Every tab scrolls:

- **More** holds the notification switches, Other machines, every plugin
  with its description, capabilities, settings path and Edit button,
  Reload, and the ai-mirror section. That is a long scroll.
- **Voice** shows the voice grid and the speech switches, and needs scrolling
  too (see #176).

Plugins have grown since #149 (consent cards, Nix status, News with settings
and YouTube clips, Other machines). They now sit at the bottom of More, mixed
with unrelated switches.

## Proposed outcome

- Settings has room. On a normal screen, Look, Voice and Brain show without
  scrolling, and More and Plugins scroll much less than now.
- **The user can resize Settings** by dragging its edge or corner, within the
  screen. The size they choose is remembered and used the next time Settings
  opens. A way back to the default size exists (double-click the grip).
- A fifth tab, **Plugins**, holds everything about plugins:
  - the list, with on/off switches, versions and sources;
  - capabilities, notes such as "Changed" or "settings file unreadable";
  - the settings path and Edit;
  - the consent card, Reload, and the Other machines switch.

  More keeps only what isn't about plugins.
- Nixi himself is unchanged when Settings is closed: same size, same place,
  same click-through area.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`: `app/window.py` (the window size
  while Settings is open), `app/static/index.html` (the Settings layout and
  tabs), and the page tests.
- p620 and razer (both run the companion); different screen sizes and
  scales.

## Constraints

- **Must:** Settings stays fully reachable on the monitor Nixi is on, in
  **both** window modes:
  - layer-shell, which can grow either way;
  - the floating-window fallback, which today grows only to the right and
    never upward (`window.py` ~561–585).

  This holds when he is near an edge, after he moves to another monitor, and
  at any display scale. A remembered size that no longer fits is clamped to
  the screen.
- **Must:** the click-through region follows the visible Settings bounds,
  including while resizing, and shrinks back when Settings closes. The page
  computes it from the Settings element (`index.html` ~3482–3510).
- **Must not:** change Nixi's size or click-through area when Settings is
  closed. He must not cover more of the desktop than today when idle.
- **Must:** keyboard use keeps working, and gets two additions.
  - Kept as today: Tab through the controls, Esc closes, and layer-shell
    takes the keyboard on demand after a click.
  - Added:
    - arrow keys move between tabs, which have no arrow handler today;
    - opening Settings focuses the selected tab;
    - closing Settings returns focus where it was.
- **Must:** nothing about plugin consent changes. The consent card, the hash
  check and "Changed — check it again" behave as now; they only move.
- Reduced motion and contrast as on the rest of Settings.

- **Scope of "Plugins":** the new tab holds the **companion plugins** that
  sit in More today (stage plugins, props, notification sorting, consent). A
  separate "Plug-ins" panel (`index.html` ~2810) manages a different list. It
  is unchanged and keeps its own entry point. Both are named so they can't
  be confused (spec).

## Open questions

1. **How big by default?** Recommended: about 560 × 680 px while Settings is
   open, capped by the screen (never more than about 85% of its height). The
   user can resize from there, between a minimum of about 420 × 420 and the
   screen. Back to Nixi's own 340 × 460 when Settings closes.
2. **Where does Other machines go?** Recommended: Plugins, because it only
   matters to plugins that read other machines.
3. **Does ai-mirror stay in More?** Recommended: yes; it isn't a plugin.
4. **Remember the open tab?** Today it is kept in `localStorage`, across
   restarts (`index.html` ~3105). Recommended: keep that, and remember the
   user's size the same way.

## Approval and reviews (2026-11-04)

- **Approved by the user**, with the change that they can resize Settings
  themselves (folded in above).
- **Codex** (gpt-6-sol). All folded in:
  - confirmed: the reachability rule must cover both window modes;
  - confirmed: arrow keys between tabs are new, not kept behaviour;
  - confirmed: the baseline Settings width is 470, not 340;
  - confirmed: the "Plugins" tab is a different list from the "Plug-ins"
    panel;
  - confirmed: the open tab is remembered across restarts, not per session;
  - confirmed: the click region must follow the panel.
- **agy:** its review was still running when the intent was approved. Its
  findings will be checked in the spec.
