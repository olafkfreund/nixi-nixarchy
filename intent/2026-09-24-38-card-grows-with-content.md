---
status: approved
issue: 38
author: olafkfreund
---

# Intent: The card should grow with the conversation

## Problem

#49 made the card follow the *display*. It still does not follow its *content*.

`Conversation.qml` clamps the card to `Style.space(540)` wide and
`Style.space(560)` tall. The height already grows with content up to that
ceiling; the width never grows at all. So a long prompt, a fenced code block or
a wide table wraps at 540px, and a long answer scrolls inside a 560px card on a
1440p or 2160p panel that has room to spare.

This is the other half of #38. The display axis shipped in #49; this is the
content axis the issue asked for first.

## Proposed outcome

- A short exchange keeps today's compact card. Nothing changes for the common
  case.
- Content that genuinely needs room -- a long prompt, a code block, a table --
  gets a wider card, and the change animates rather than snapping.
- The height ceiling follows the panel rather than a fixed number, so a long
  answer uses the screen it is on.
- Pinned mode is unchanged.

## Affected users and systems

- Every user, on every conversation long enough to matter.
- `Conversation.qml` only -- the card's geometry and the points where message
  text enters the model.

## Constraints

- **The width must never depend on a measured height.** Widening reduces
  wrapping, which shortens the card, which would narrow it again: a binding
  loop that oscillates. CI does not run QML, so a loop ships green and shows up
  as a visibly flickering card. Whatever drives the width has to be computed
  from the content itself.
- Nothing may flap at a threshold. A card that widens and narrows as an answer
  streams in is worse than one that never widens.
- Must not exceed the screen. The existing `parent.width - gapsOut * 2` bound
  stays as the outer clamp.
- Must compose with #49's `fontScale` term rather than replacing it.
- Pinned mode takes the whole panel and must keep doing so.

## Open questions

None that block. The threshold for "needs room" is a judgement rather than a
fact, and is recorded in the spec with its reasoning so it can be tuned.
