---
status: approved
issue: 196
author: olafkfreund
---

# Intent: Settings opened over a board stays next to Nixi

## Problem

With a board up, the window asks for up to 400 px of room on each side of Nixi,
as far as the screen allows. Opening Settings keeps that width, because the window
takes the largest room anything asks for, and the panel is placed from the window's
left edge. So Settings opens about 280 px to the left of its normal spot and covers
half of him. When the board's room goes, the panel jumps right, by about 280 px in
the case measured.

An open board is already hidden while a panel is open, but its room stays. A board
reduced to its small tab stays visible and clickable, and still holds 300 px of room,
so Settings sits about 28 px off even then.

While Settings is open, three more things go wrong:
- a new board is refused and closes the old one, and its text goes into the caption;
  that may explain the caption seen in #196;
- a board's timers keep running, so it can close or shrink unseen, or on the first
  moment after Settings closes;
- a live gauge stops updating.

## Proposed outcome

- Settings opens in the same spot next to Nixi, with or without a board or a tab, and
  doesn't move while it's open.
- An open board and its tab go out of the way while Settings is open, and come back as
  they were when it closes.
- A board's timers wait while Settings is open and start fresh when it closes.
- Something that happens to a board meanwhile is kept for when Settings closes:
  a live gauge shows its newest values; the newest new board replaces the old one; a
  board the server closed stays closed.
- No board text goes into the caption while Settings is open.

## Affected users and systems

Fork `olafkfreund/nixoarchy-snowflake`, `app/static/index.html`: the window-size
request, the hidden board and its timer. Everyone using the companion, on p620 and
razer.

## Constraints

- **Must:** the same for the other panels (history, plugins), and when moving from
  one panel to another.
- **Must not:** change Nixi's position, or Settings' size or resizing (#175), or how
  boards behave when no panel is open.

## Open questions

1. **What should the board do while Settings is open?** Recommended: stay hidden,
   give up its room, and return when Settings closes. Alternative: close it for
   good, which is simpler but loses what you were looking at.
2. **The fast right-click and gear click with a board up, which opened nothing.**
   Recommended: re-test after this fix, which removes the likely geometry cause, and
   close #196 if it's gone. If it isn't, it gets its own issue. Nobody has reproduced it
   yet, so it isn't promised here.

## Approval (2026-11-05)

Approved by the user, with the recommended answers to both open questions.
