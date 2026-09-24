---
status: draft
issue: 40
spec: spec/2026-09-24-40-trust-pending-wedge.md
---

# Plan: Changing trust must never become permanently impossible

Approved decisions, carried over so this file stands alone:

- **Narrow fix only.** Collapsing the three request/ack/error triples into one
  ack event is the root cause but is explicitly deferred to a follow-up issue,
  to be done after `AgentSession.qml` is extracted.
- The reset goes in **`restartSession()`**, not `close()`. `close()` emits
  `closed()` (`Conversation.qml:236`) which `Ask.qml:394` wires to
  `removeConversation()` -> `Qt.callLater(conversation.destroy)`, so the object
  is destroyed and its flags are never read again. A reset there would look like
  a fix and change nothing.
- `applyTrustMode()` applies the ACP mode **first**, then persists and publishes,
  so a failure cannot report a trust level the session is not in.
- A timeout releases the gate but must never misreport the mode.

## Steps

1. `Conversation.qml:1104-1113` `restartSession()`: add `trustPending = false`
   and `permissionModePending = false` beside the existing
   `steeringPending = false`.
   -> verify by `sed -n '1104,1116p' Conversation.qml` showing all three resets.

2. `bridge/bridge.js:355` `applyTrustMode()`: wrap
   `await connection.setSessionMode(...)` in a `Promise.race` against a timer,
   following the existing pattern in `shutdown()` (`:375-391`, which races
   350/500/150ms). Use **8000ms**: generous for a local ACP round-trip, short
   enough that a wedge is noticed within one interaction. On expiry, reject so
   the existing catch path emits `trust_error`.
   -> verify by the new test in step 6 failing before this step and passing
   after.

3. `bridge/bridge.js:417-422`: reorder so `applyTrustMode()` completes before
   `trust = next` is assigned and before `mergeSettings({trust: next})` persists.
   On failure, neither the in-memory value nor the file changes, and the emitted
   `trust_error` carries the mode still in force.
   -> verify by a test asserting that after a failed mode change, the bridge's
   reported trust equals the pre-change value.

4. `Conversation.qml:956-963` `setTrust()`: on each early return, set
   `statusText`. Two distinct messages: gate set -> "Still switching trust…";
   `!agent.running || !bridgeReady` -> "The agent is still starting — try again
   in a moment."
   -> verify by the runtime check in Tests.

5. `Conversation.qml:965-972` `setPermissionMode()`: same treatment for the YOLO
   badge path.
   -> verify by clicking the badge before `bridgeReady` and seeing a message
   rather than nothing.

6. `bridge/testing/fake-agent.js`: add a branch that accepts `_session/set_mode`
   and never answers, selectable by an env var or a session flag, so the timeout
   is reachable from a test.
   -> verify by the new test in `bridge/trust-policy.test.js` driving it.

7. `bridge/trust-policy.test.js`: add two cases -- (a) an unanswered
   `setSessionMode` emits `trust_error` within the timeout and leaves the
   reported trust unchanged; (b) a *successful* switch still persists and
   reports the new trust, guarding against step 3 breaking the happy path.
   -> verify by `node --test bridge/trust-policy.test.js`.

8. Open the follow-up issue for collapsing the three ack triples, referencing
   this issue as the instance that motivated it.
   -> verify by the issue existing and being linked from #40.

## Tests

```bash
# Unit + behavioural. The harness runs the REAL bridge against a real ACP
# agent over stdio (bridge/testing/run-bridge.js), so these assert what the
# bridge actually sent, not what it intended.
node --test bridge/*.test.js
# expect: all pass, including the two new trust-policy cases

nix flake check --print-build-logs
# expect: checks.package, checks.selfcheck, checks.hm-module-eval all pass
```

Runtime checks, after rebuild and `omarchy-restart-shell`:

1. **The wedge, via a dead bridge.** Open the card, type `/mechanic`, kill the
   bridge child before it acks, click `Start new session`, then `/mechanic`
   again. Expected: it takes effect. Before this change it is a silent no-op for
   the life of the shell.
2. **The wedge, via a hung agent.** With a harness that never answers
   `setSessionMode`, type `/mechanic`. Expected: an error appears within ~8s and
   the control works again afterwards. The badge must still show the level the
   session is actually in.
3. **Feedback before ready.** Open the card and type `/mechanic` within the
   first 400ms, before `bridgeReady`. Expected: a status message, not a silently
   vanished command.
4. **No happy-path regression.** `/mechanic` then `/guide` on a healthy bridge
   both apply, the badge follows, and the level survives a restart.

## Rollback

`git revert` the implementation commit. Three considerations:

- The QML changes (steps 1, 4, 5) are additive and carry no state; reverting is
  clean.
- The `bridge.js` reorder (step 3) changes **when** `nixi.json` is written, not
  its schema, so no on-disk migration exists to undo. A `nixi.json` written by
  the new code is readable by the old.
- If only the timeout proves wrong (too aggressive on a slow harness), revert
  step 2 alone and keep steps 1, 3, 4, 5. The `restartSession()` reset is the
  larger half of the fix and is independent of the timeout.
