---
status: approved
issue: 120
author: olafkfreund
---

# Intent: three small robustness fixes from the review

## Problem

1. **Stale lock takeover** (`bridge/always.js:72-77`). Between checking that the
   store's lock is older than 10 s and renaming it aside, its owner can release it
   and another process can take a fresh one. The rename then removes the *fresh*
   lock, and two writers run at once. #103 exists to prevent exactly that.
2. **An aborted file search keeps scanning** (`bridge/files.js:185-220`). Typing
   `@foo` then `b` aborts the first search, but the aborted `plocate` returns empty
   and the code goes on to two `fd` scans of the home directory.
3. **A panel notice leaks into the chat** (`Conversation.qml:1251`). Removing a
   remembered approval from the panel can print "No remembered approval n." into the
   open conversation.

## Proposed outcome

- Two writers never hold the store at once, even across a stale takeover.
- An aborted search stops and starts no new scans.
- Panel actions print nothing into the conversation.

## Affected users and systems

- `bridge/always.js`, `bridge/files.js`, `Conversation.qml`, tests.

## Constraints

- No new dependencies; keep #103's write rules.
- `Conversation.qml` is also touched by #119: keep the change to the one line.

## Open questions

None.
