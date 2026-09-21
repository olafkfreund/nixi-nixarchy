---
status: draft
issue: 20
author: olafkfreund
---

# Intent: Y and N answer a permission prompt

## Problem

In Mechanic, a **Permission required** dialog labels its buttons `N Deny` and
`Y Allow`. Pressing Y or N does not answer it. The letter is typed into the
composer behind the dialog, and the dialog stays open. Only clicking works.
This happened to both the person at razer's keyboard and the test driver on
2026-09-21.

The cause is in `Conversation.qml`. The `Shortcut { sequence: "Y" }` and
`"N"` items (around lines 1405 and 2944, for the overlay and the pinned
window) are window-level shortcuts. The composer `prompt` is a `TextArea` with
`Keys.priority: Keys.BeforeItem`. It keeps focus and stays enabled while the
agent waits, because Claude supports steering (`enabled: !root.waiting ||
(root.steeringSupported && …)`). A focused text field takes printable keys
before a shortcut sees them, so the shortcut never fires.

Besides being annoying, this is a trust problem. A dialog that says "Y Allow"
and then does not allow teaches people to stop believing its labels. It also
leaves a stray letter in what they type next.

## Proposed outcome

- While a permission prompt is showing, Y allows and N denies, in the overlay
  and in a pinned window, and neither letter reaches the composer.
- When no prompt is showing, Y and N type normally, as now.
- Escape and the buttons keep working as they do.
- The README and site note "Y and N do not work yet" (#20) is removed.

## Affected users and systems

- Mechanic and YOLO users, and any agent that asks for permission (Claude,
  Codex, OpenCode).
- `Conversation.qml`; the notes in `README.md` and `docs/index.html`.

## Constraints

- Must not break steering: typing a follow-up while the agent works must keep
  working when no prompt is up.
- Must not let a key held from typing answer a prompt by accident: a Y
  already being typed when the dialog appears must not count as consent. The
  spec decides how.
- Verified on a real desktop in both the overlay and a pinned window.

## Open questions

1. **Accidental consent.** Should Y only count after the dialog has been up
   for a short moment (for example 300 ms), or only when the composer is
   empty, so that a sentence being typed cannot approve something?
2. What should Return do while a prompt is up? Today it reaches the composer
   and calls `submit()`, which sends whatever is typed there as a steering
   message behind the dialog. Options: do nothing while a prompt is up, or
   mean the highlighted button (Allow).
