---
status: draft
issue: 175
author: olafkfreund
---

# Intent: A bigger Settings window and a Plugins tab

## Problem

Settings opens in the companion's own window, which is 340 × 460 px
(`app/window.py`, `W, H = 340, 460`). That was sized for Nixi himself, not for
a form. Every tab scrolls:

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

- **Must:** the bigger Settings fits on the screen Nixi is on, at any scale,
  and moves inward rather than off the edge.
- **Must not:** change Nixi's size or click-through area when Settings is
  closed. He must not cover more of the desktop than today when idle.
- **Must:** keyboard use keeps working: Tab through the controls, arrow keys
  between tabs, Esc closes, focus is kept.
- **Must:** nothing about plugin consent changes. The consent card, the hash
  check and "Changed — check it again" behave as now; they only move.
- Reduced motion and contrast as on the rest of Settings.

## Open questions

1. **How big?** Recommended: about 560 × 680 px while Settings is open,
   capped by the screen (it never takes more than about 85% of the height),
   and back to 340 × 460 when Settings closes.
2. **Where does Other machines go?** Recommended: Plugins, because it only
   matters to plugins that read other machines.
3. **Does ai-mirror stay in More?** Recommended: yes; it isn't a plugin.
4. **Remember the open tab?** Recommended: yes, for the session only, as
   today.
