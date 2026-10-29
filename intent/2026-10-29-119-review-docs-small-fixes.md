---
status: approved
issue: 119
author: olafkfreund
---

# Intent: docs say what the code does, and small review fixes

## Problem

The 2026-10-29 review found four small mismatches:

1. A Mechanic to Guide switch inside one conversation leaves read-only shell
   commands runnable until the next chat. `docs/architecture.md:254` records it,
   but the README and the card's Guide description don't. The user is told Guide
   changes nothing.
2. `docs/architecture.md:349` says learned facts are written at Guide;
   `bridge/bridge.js:555` skips them there (#51).
3. The herdr audit line (`bridge/herdr-policy.js:21`, `auditSend`) doesn't join an
   argv-array command, so Codex's sends are logged garbled.
4. Every reply is labelled `role: "Claude"` (`Conversation.qml:1001`, `:1018`,
   `:1116`), whatever agent answered.

## Proposed outcome

- README and the card say that switching to Guide is complete from the next
  conversation, and how to get it now (start a new chat).
- The architecture doc matches the learned-facts code.
- sends.log records Codex sends with the right pane and text.
- Replies carry the agent that wrote them, where a label is shown or stored.

## Affected users and systems

- README, docs/architecture.md, `Conversation.qml` (Guide description, role
  label), `bridge/herdr-policy.js` and its test.

## Constraints

- Wording only where it's docs; no change to trust behaviour here.
- `Conversation.qml` is also touched by #120: keep the edits small to avoid conflicts.

## Open questions

- Should a Mechanic to Guide switch offer to start a new chat? That's a behaviour
  change, so it's out of scope here unless approved.
