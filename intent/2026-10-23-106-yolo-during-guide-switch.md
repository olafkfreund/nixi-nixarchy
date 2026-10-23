---
status: draft
issue: 106
author: olafkfreund
---

# Intent: Leaving Mechanic never approves anything

## Problem

A switch to Guide only takes effect after the agent confirms the mode change. The bridge's `trust`
handler (`bridge/bridge.js` ~644) runs `await applyTrustMode(next)`, then `mergeSettings`, then
`trust = next`, then `cancelAllPendingPermissions()`. During that round trip, which can last up to
the mode-call timeout, `trust` still says `mechanic`:

- **A YOLO switch in the window passes.** `savePermissionMode` (~112) only checks
  `trust !== "mechanic"`. It persists `yolo` and runs `allowAllPendingPermissions()` (~656), which
  approves the pending cards the Guide switch was about to cancel.
- **New permission requests in the window get Mechanic's policy** (`requestPermission` ~335-347).
  If YOLO is already on, they are approved automatically, although the user has asked for Guide.

Once `trust` is Guide, YOLO is ignored (`trust-policy.js` ~167), so the exposure is limited to the
window. But the user's last word was "Guide", and nixi still approves things.

Found by agy in the #103 review (PR #105). It predates #94–#105.

## Proposed outcome

- From the moment a switch to Guide is received, nothing is approved automatically:
  - a YOLO switch is refused;
  - no request is YOLO-approved;
  - `allowAllPendingPermissions` doesn't run.
- During the window, new requests are refused the way Guide refuses them. What happens to a card
  that was already pending is open question 2. Either way, it is cancelled when the switch
  completes, as today.
- A failed switch to Guide puts back the state from before the switch, as #40 does today for the
  reported level.
- A switch to Mechanic still takes effect only once it is confirmed. Becoming more permissive stays
  late; becoming stricter becomes immediate.
- A test reproduces the window: the agent's mode call is held open, and `permission_mode: yolo` is
  sent with a card pending.

## Affected users and systems

- nixi: `bridge/bridge.js` (the trust and permission-mode handlers, `requestPermission`), bridge
  tests and the fake agent (holding the mode call open), `docs/architecture.md` (trust invariants).
- Every nixi user who uses YOLO. The companion talks through the same bridge, so the fix covers it
  too.

## Constraints

- #40 stays: a failed mode switch reports the level actually in force, and writes nothing.
- No change to the trust model itself (Guide/Mechanic, YOLO only from Mechanic).
- herdr writes keep their click-only rule (#95 branch). Don't widen any auto-approval path.

## Open questions

1. **Shape:** a flag set as soon as a switch to Guide is received, checked by every YOLO path
   (small), or one queue that handles trust and permission-mode messages in order (broader: it also
   orders other combinations)? Recommended: the flag. Only "becoming stricter" needs to be
   immediate.
2. **Hand-answered cards during the window:** may the user still click "allow" on a card that was
   pending before the Guide switch, until the switch completes? Recommended: no. Treat the window
   as Guide, and refuse the answer as if the card had already been cancelled.
