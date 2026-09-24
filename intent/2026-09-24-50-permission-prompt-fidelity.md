---
status: approved
issue: 50
author: olafkfreund
---

# Intent: The permission card must show what will run, and not be answered unseen

## Problem

In Mechanic the permission card is the only thing between an agent's request and
the user's machine. Everything else -- the trust levels, the session modes, the
secret-path rules -- is enforcement the user never sees. The card is where a
human actually decides. Three things weaken it, and all three are about
perception rather than enforcement.

**It loses argument boundaries.** `bridge/permission-detail.js:15` renders an
argv array with `join(" ")`, so an argument containing a space is
indistinguishable from two arguments. `["rm", "-rf", "/tmp/a b"]` shows as
`rm -rf /tmp/a b`, which reads as two paths and is one. The agent receives the
array; the user approves the string.

**It silently drops fields.** `:14` returns only `rawInput.command` when that is
a string, discarding every other key. Narrow today, because Bash's rawInput is
essentially command plus description -- but it is a shown-versus-executed gap in
precisely the wrong place, and it will widen quietly as tools gain fields.

**It can advance before it is read.** `Conversation.qml:1115-1125` calls
`showNextPermission()` synchronously inside `answerPermission()`, so request N+1
appears the instant N is answered: same card, same geometry, Allow in the same
pixel. Bare `Y`/`N` are armed by `permissionKeysLive` (`:75`), which means only
"a request is pending and the prompt box is empty". There is no minimum display
time and no re-arm delay, so keyboard autorepeat from a held `Y`, or an ordinary
double-click, approves the next request before it renders. The card already
warns "N more permission requests queued"; nothing stops the keystroke.

The queue itself is correct and is not the problem: an incoming request never
preempts the displayed one, the bridge re-looks-up the pending entry by id, and
switching to Guide cancels everything pending on both sides. Only the timing and
the rendering are wrong.

## Proposed outcome

- What the card shows is unambiguous about what will run: argument boundaries
  are visible, and a field carried beside `command` is not invisible.
- A permission request cannot be answered before it has been on screen long
  enough to read.
- Approving a queue of requests still feels like answering questions rather than
  fighting the UI -- the fix must not make ordinary use tedious, or it will
  train the same reflex it exists to prevent.

## Affected users and systems

- Every Mechanic user, on every tool call that asks.
- `bridge/permission-detail.js` and its test; `Conversation.qml`'s permission
  card and its keyboard shortcuts.
- Security-relevant: this is the approval boundary, so a mistake here is worse
  than the bug.

## Constraints

- Must not change what is *enforced* -- only what is shown and when it can be
  answered. The bridge's permission handling stays as it is.
- Must not break the existing truncation behaviour or its `CAP_BYTES` /
  `CAP_LINES` bounds; the detail is agent-controlled and must stay bounded.
- The card renders detail as PlainText and must continue to: nothing here may
  introduce markup interpretation on agent-supplied text (see #42).
- A settle window must not be long enough to be felt as lag on a single
  request.

## Open questions

1. How should argv be rendered -- shell-quoting (readable, familiar, but a
   quoting scheme the user must trust) or JSON (unambiguous, uglier)? This is a
   judgement about which the user is more likely to read correctly under time
   pressure, and the approver should settle it.
2. What settle duration? Long enough to prevent autorepeat and a double-click,
   short enough not to feel broken. A concrete number wants deciding rather than
   defaulting.
3. Should the settle window apply to the mouse buttons as well as the keyboard,
   or only the keys? A double-click on Allow is the mouse equivalent of
   autorepeat, so probably both -- but disabling a visible button is more
   noticeable than disarming an invisible shortcut.
4. Which `rawInput` fields are worth showing? An allowlist needs a list, and it
   should be driven by what tools actually carry rather than invented.
