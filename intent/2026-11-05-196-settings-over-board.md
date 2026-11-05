---
status: draft
issue: 196
author: olafkfreund
---

# Intent: Settings opened over a board stays next to Nixi

## Problem

With a board up, the window has 400 px of room on each side of Nixi. Opening
Settings keeps that width, because the window takes the largest room anything
asks for, and the panel is placed from the window's left edge. So Settings opens
about 280 px to the left of its normal spot and covers half of him. When the
board's room goes, the panel jumps 280 px right.

The board isn't even visible at that point: it's already hidden while a panel is
open. Only its room stays.

## Proposed outcome

- Settings opens in the same spot next to Nixi, with or without a board up.
- The board goes out of the way while Settings is open, including its small tab,
  and comes back as it was when Settings closes.
- A board doesn't time out unseen behind Settings.
- Nothing jumps when a board's content changes, such as toggling "Other machines".

## Affected users and systems

Fork `olafkfreund/nixoarchy-snowflake`, `app/static/index.html`: the window-size
request, the hidden board and its timer. Everyone using the companion, on p620 and
razer.

## Constraints

- **Must:** the same for other panels (history, plugins) if they have this problem.
- **Must:** a board updated while hidden shows the newest content when it returns.
- **Must not:** change Nixi's position, or Settings' size or resizing (#175).
- **Must not:** touch the two oddities filed with #196 unless they turn out to
  share this cause.

## Open questions

1. **What should the board do while Settings is open?** Recommended: stay hidden,
   give up its room, and return when Settings closes. Alternative: close it for
   good, which is simpler but loses what you were looking at.
2. **The two oddities in #196** (a caption that lags after toggling; one fast
   right-click and gear click with a board up that opened nothing). Recommended: leave them
   open under #196 until someone can reproduce them, and rename nothing.
