---
status: draft
issue: 40
author: olafkfreund
---

# Intent: Changing trust must never become permanently impossible

## Problem

`/mechanic`, `/guide` and the YOLO badge can all become silent no-ops for the
rest of a conversation, with no error shown and no way back short of destroying
the session.

`trustPending` (`Conversation.qml:53`) and `permissionModePending` (`:49`) are
one-way gates: `setTrust()` (`:956`) and `setPermissionMode()` (`:965`) both
return immediately while the flag is set. The flags are cleared only by a
`trust` / `trust_error` / `permission_mode` / `permission_mode_error` event
(`:1065-1081`).

Two ways to get stuck:

1. `restartSession()` (`:1104-1113`) is the one path that keeps the same
   `Conversation` object alive across a dead bridge. It resets `sessionLost`,
   `queuedPrompt`, `steeringSupported` and `steeringPending` -- and not these
   two. So a bridge that dies mid-change leaves them set forever.

2. No crash required: `bridge.js:355` `applyTrustMode()` awaits
   `connection.setSessionMode(...)` with no timeout. An ACP agent that never
   answers -- hung, or holding the request until the turn ends -- means neither
   event is ever emitted, and `trustPending` stays true on an otherwise healthy
   bridge.

The failure is silent in the worst way: `submit()` clears `prompt.text` at
`:906` before calling `setTrust`, so the user watches `/mechanic` vanish from
the composer and nothing happens. No status line, no error.

`close()` (`:207`) also omits both resets, but that is harmless and is not the
bug: it ends by emitting `closed()` (`:236`), which `Ask.qml:394` wires to
`removeConversation()` and `Qt.callLater(conversation.destroy)`. The object is
destroyed, so its stale flags are never read again. A fix applied to `close()`
would leave the bug fully intact.

## Proposed outcome

- After a session restart, trust and permission-mode controls work again.
- An agent that never answers `setSessionMode` surfaces an error and releases
  the gate, rather than wedging it.
- A trust command that cannot be delivered tells the user so, instead of
  disappearing.

## Affected users and systems

- Anyone whose agent hangs or whose bridge dies mid-switch -- most likely during
  a long tool call, which is exactly when someone reaches for `/guide`.
- `Conversation.qml` (`restartSession`, and the feedback path in `submit`) and
  `bridge/bridge.js` (`applyTrustMode`).
- Security-relevant: the wedge can strand a user in Mechanic when they are
  trying to return to Guide.

## Constraints

- The fix must be in `restartSession()`, not `close()` -- see above.
- A timeout must not silently downgrade trust. Failing to reach Mechanic is
  acceptable; silently appearing to be in Guide while the session is still in
  Mechanic is not. On timeout the reported state must match the session's
  actual mode.
- Must not break the existing `trust_error` path or its test coverage in
  `bridge/trust-policy.test.js`.

## Open questions

1. What timeout for `setSessionMode`? A few seconds is generous for a local ACP
   round-trip, but an agent mid-turn may legitimately defer. Approver to decide
   whether the timeout fires regardless or only while idle.
2. Should the three hand-rolled request/ack/error triples (`trust`,
   `permission_mode`, `steering`) be collapsed into one ack event as part of
   this, or tracked separately? Three copies of one pattern is why two of the
   three forgot to reset; collapsing is a deletion rather than an abstraction,
   but it widens this change.
