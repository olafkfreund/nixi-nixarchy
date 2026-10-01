---
status: approved
issue: 44
spec: spec/2026-09-25-44-one-ack-event.md
---

# Plan: One acknowledgement, so a reset cannot forget a kind

Scope decided in the spec: **the collapse, without extracting
`AgentSession.qml`.** The collapse does not depend on it, and the extraction is
a 2400-line refactor with no QML tests whose risk this change does not justify.

## Steps

1. `bridge/bridge.js`: add `ack(of, ok, extra)`; convert all six emits.
2. `Conversation.qml`: `pendingAck` plus three `readonly` derived names.
3. `Conversation.qml`: `beginAck` / `settleAck` / `clearAcks`; convert every
   assignment.
4. `Conversation.qml`: five event branches to one `ack` branch.
5. `restartSession()`: three resets to `clearAcks()`.
6. `bridge/testing/run-bridge.js`: wait on `ack` with a matching `of`.
7. `bridge/trust-policy.test.js`: read the ack shape; add the three new cases.
8. `tools/test_nixi.py`: `test_one_ack_shape`.
9. Break each new assertion and watch it fail.

## Tests

```bash
node --test bridge/*.test.js      # 89: 86 existing + 3 new
python3 tools/test_nixi.py
qmllint Conversation.qml          # rc 0
nix flake check --print-build-logs
```

Each guard broken and observed to fail:

| broken | message |
|---|---|
| `restartSession` resets one kind (= reintroducing #40) | `restartSession does not clear the ack state` |
| a flag made a plain property again | `trustPending is no longer derived from pendingAck -- the state has split again` |
| bridge emits a second shape | `the bridge still emits type: "trust"` |

## Deviations

**One, mine, and it cost a run.** My first attempt replaced the assignments
before the event branches, and the four-space pattern
`    steeringPending = false` matched *inside* the eight-space occurrences in
the branches, corrupting them so the branch anchors no longer matched. The
script asserted and aborted before writing, so nothing was damaged -- but the
lesson is to order replacements from the deepest indentation outward when
editing by string match.

Also: two test call sites were missed on the first pass -- one
`permission_mode_error` assertion, found only because the suite failed. The
"none of the six old names is emitted" test exists partly so a missed site
cannot pass quietly.

## Rollback

`git revert`. The wire format changes, so bridge and card must revert together
-- they always ship together from the same store path, so there is no
mixed-version window in practice. No persisted state: `pendingAck` lives for the
life of a conversation and is never written anywhere.

## Not covered

The card itself. CI does not run QML, so `test_one_ack_shape` is standing in for
a test that cannot exist here. A human still needs to confirm `/mechanic`,
`/guide`, the YOLO badge and steering all work, and that the composer still
greys while a steer is in flight.
