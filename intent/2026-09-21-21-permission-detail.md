---
status: draft
issue: 21
author: olafkfreund
---

# Intent: A permission prompt shows what is being approved

## Problem

Mechanic's promise, in the README, is that "every change the agent wants is
shown in the card and needs your yes". The prompt does not show the change:

- **Commands are cut off.** On razer on 2026-09-21, the write that added a
  key binding came up as a few lines ending `>> ~/.config/hypr/bindings.lua &&…`.
  Whatever followed `&&` was invisible to the person approving it. The dialog's
  text is `maximumLineCount: 5` with `elide: Text.ElideRight`
  (`Conversation.qml`, the permission card).
- **Edits show only a path.** An edit request reads `Edit
  /home/…/bindings.lua`, with no old or new text.

The cause is one line in the bridge. `requestPermission` (`bridge/bridge.js`)
forwards only `params.toolCall.title` (falling back to `name`). The ACP tool
call also carries `rawInput` (for a shell tool, the full command) and
`content`, which for an edit holds a `diff` item with `path`, `oldText` and
`newText`. Both are dropped before they reach the card.

This is a consent problem, not a cosmetic one. What the person approves
should be what runs. It is made worse by a second observation from the same
run: in Mechanic, Claude asks before every read-only `grep`/`ls`/`Read` (five
or six prompts before a one-line edit), which trains people to click Allow
without reading.

## Proposed outcome

- A command prompt shows the whole command. A long one scrolls inside the
  dialog; it is never cut off.
- An edit prompt shows the file and what changes in it (old and new text, or
  a diff), limited to a size the card can show, and says clearly when it has
  been shortened and by how much.
- A write of a whole file shows its path and its new content, the same way.
- The README and site note about truncated prompts (#21) is removed.

## Affected users and systems

- Mechanic users with any agent, since all three send ACP tool calls.
- `bridge/bridge.js` (what is forwarded), `Conversation.qml` (the dialog),
  and bridge tests. The notes in `README.md` and `docs/index.html`.

## Constraints

- **Guide is untouched.** Guide cancels before anything is shown.
- **YOLO is untouched.** It auto-approves; it shows no prompt.
- Nothing from the agent is rendered as rich text or markup. Commands and
  diffs are shown as plain, monospace text, because they are untrusted input.
- The dialog must stay usable on a 1080p laptop; the detail scrolls rather
  than growing past the card.
- It must work when an agent sends only a title: then the title is shown, as
  today.

## Open questions

1. **The read-only prompt flood** is a separate problem, and it may not be
   Nixi's to fix. It comes from Claude's `default` mode, which Mechanic maps
   to. Should this task also auto-allow tool calls that ACP marks as
   read-only (`kind: "read"`/`"search"`), or leave that to its own issue?
2. How large may the detail get before it is cut, with the cut stated?
