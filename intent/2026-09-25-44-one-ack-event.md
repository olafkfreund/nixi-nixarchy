---
status: approved
issue: 44
author: olafkfreund
---

# Intent: One acknowledgement, so a reset cannot forget a kind

## Problem

The bridge answers three of the card's requests with three near-identical
request/ack/error triples:

| request | success | failure | the card's flag |
|---|---|---|---|
| `trust` | `trust` | `trust_error` | `trustPending` |
| `permission_mode` | `permission_mode` | `permission_mode_error` | `permissionModePending` |
| `steer` | `steered` | `steering_error` | `steeringPending` |

Six event types, three booleans, three reset paths -- and **two of the three
forgot to reset**. That is #40: `restartSession()` cleared `steeringPending` and
neither of the others, so after a bridge died mid-change the trust and YOLO
controls were silent no-ops for the life of the conversation.

#40 was fixed by adding the two missing resets. That is the fix you make when
the shape is wrong: it works, and it leaves the next person one more line to
forget. The bug class is "three copies of one pattern", and the class is what
this addresses.

## Proposed outcome

- One acknowledgement shape for every request the card makes, naming what it
  answers.
- One piece of in-flight state on the card, so clearing it cannot clear one kind
  and miss another.
- #40's failure becomes structurally impossible rather than fixed by vigilance.
- No behaviour change: every existing guard, status line and disabled-button
  binding behaves exactly as before.

## Affected users and systems

- No user-visible change if this is done right. That is the bar.
- `bridge/bridge.js` (six emits), `Conversation.qml` (three flags, five event
  branches, every reset site), `bridge/testing/run-bridge.js` (waits on acks),
  `bridge/trust-policy.test.js` (asserts on the event names).

## Constraints

- **Existing bindings must keep working.** `steeringPending` is read by the
  composer's `enabled` and `opacity`; a rename would touch UI that has nothing
  to do with this change.
- Inbound message names (`trust`, `permission_mode`, `steer`) do **not** change.
  This is about the answers, not the requests.
- The #40 guarantee must survive: a failed request still reports the level
  actually in force, never the one asked for.
- CI does not run QML. Whatever holds this together has to be checkable without
  a running card, or it is not held together at all.

## Open questions

1. Does this need `AgentSession.qml` extracted first, as the issue suggests?
   The issue says the collapse is "mechanical" once the protocol lives in one
   file -- but the extraction is a separate refactor of a 2400-line file with no
   QML tests, and the collapse may not depend on it. Settle this before
   starting, because the answer changes the size of the change by an order of
   magnitude.
2. Should the three flag names survive at all, or be replaced at every call
   site? Survival is less churn; replacement is more honest about the new shape.
