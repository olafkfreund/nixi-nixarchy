---
status: approved
issue: 40
intent: intent/2026-09-24-40-trust-pending-wedge.md
---

# Spec: Changing trust must never become permanently impossible

Approved scope: the **narrow fix**. Collapsing the three request/ack/error
triples into one ack event is the root cause and is deliberately out of scope
here; it is tracked separately and is better done once `AgentSession.qml` exists.

## Design

Three changes.

**1. Reset both gates in `restartSession()` (`Conversation.qml:1104-1113`).**

Add `trustPending = false` and `permissionModePending = false` alongside the
existing `steeringPending = false`. `restartSession()` is the only path that
keeps a `Conversation` object alive across a dead bridge, so it is the only
place the stale flags can still be read.

`close()` (`:207`) is deliberately **not** changed. It ends by emitting
`closed()` (`:236`), which `Ask.qml:394` wires to `removeConversation()` and
`Qt.callLater(conversation.destroy)`. The object is destroyed and its flags are
never read again. Adding the resets there would look like the fix while fixing
nothing, which is how this bug was first mis-diagnosed.

**2. Time out the ACP mode change (`bridge/bridge.js:355`).**

`applyTrustMode()` awaits `connection.setSessionMode(...)` with no timeout. Wrap
it in a `Promise.race` against a timer, following the pattern already used in
`shutdown()` (`:375-391`), which races SIGTERM/wait/SIGKILL against 350/500/150ms
timeouts. On expiry, emit `trust_error` so the existing UI path (`:1077`) clears
the gate and shows a message.

The timeout must not claim a trust level the session is not actually in. On
expiry the bridge reports the mode it can still verify, so the badge and the ACP
session cannot disagree. This also addresses the ordering problem in the same
function: `bridge.js:417-422` assigns `trust = next` *before* `applyTrustMode()`,
so a failure currently reports the already-updated value. Apply the mode first,
then persist and publish.

**3. Tell the user when a trust command cannot be delivered
(`Conversation.qml:905-908`, `:956-963`).**

`submit()` clears `prompt.text` before calling `setTrust`, and `setTrust`
returns silently when `!agent.running || !bridgeReady` or when the gate is set.
Set `statusText` on each of those early returns so the command does not simply
vanish. Prompts are already queued and replayed via `queuedPrompt` (`:935`);
trust commands are not, and this spec does not add a queue -- a message is
enough and is far less state.

## Alternatives rejected

**Collapse the three ack triples now.** The correct long-term fix and explicitly
deferred by the approver. It touches `bridge.js` and `Conversation.qml` together
and removes six event types; doing it under a bug fix would make the regression
surface much larger than the bug.

**Queue trust commands like prompts.** Rejected: adds a second queue and a
replay path to fix a case that a one-line status message covers. The user can
retype `/mechanic` once the bridge is up.

**Clear the gates on a UI-side timer.** Rejected: treats the symptom. The bridge
knows whether the request was answered; the UI would be guessing, and a timer
that fires while the bridge is merely slow would desynchronise the two.

**Reset the flags in `close()` as well, defensively.** Rejected: dead code. The
object is destroyed immediately after. It would encode a false belief about
where the bug lives.

## Risks

- **Timeout too aggressive.** An agent mid-turn may legitimately defer a mode
  change. Too short a timeout produces spurious `trust_error` messages and
  trains the user to ignore them. Mitigation: the timeout releases the gate but
  reports the unchanged mode, so a late success is not misrepresented; value to
  be set in the plan and exercised by a test.
- **Ordering change in `applyTrustMode`.** Moving the ACP call before the
  persist changes what is written when the call fails -- which is the point, but
  `bridge/trust-policy.test.js` asserts on what the bridge sends at `newSession`
  and on trust transitions, so those assertions must be re-read rather than
  assumed to still hold.
- **Status text is a shared channel.** `statusText` is overwritten by the next
  `text`/`tool` event of a running turn, which is exactly the weakness noted for
  the steering-error path. For trust commands the bridge is not ready or not
  answering, so no turn is streaming, and the message survives. Worth confirming
  in the runtime check rather than assuming.
- Host-specific risk: none; no packaging or module change.

## Verification

1. **Automated.** `node --test bridge/*.test.js`. Add to
   `bridge/trust-policy.test.js`, which already drives the real bridge against a
   real ACP agent via `testing/run-bridge.js`: a case where the fake agent never
   answers `setSessionMode` must emit `trust_error` within the timeout and leave
   the reported trust matching the session's actual mode. `testing/fake-agent.js`
   needs a never-answer branch.
2. **Automated.** `nix flake check` for the package and self-check.
3. **Runtime, gate 1.** Open the card, `/mechanic`, kill the bridge child
   mid-switch, `Start new session`, then `/mechanic` again. It must take effect.
   Before this change it is a silent no-op.
4. **Runtime, gate 2.** With a harness that defers session-mode changes, confirm
   `/mechanic` either applies or reports an error, and that the badge never shows
   a level the session is not in.
5. **Runtime, feedback.** Open the card and type `/mechanic` within the first
   400ms, before `bridgeReady`. A status message must appear rather than the
   command disappearing silently.

## Follow-up (not this change)

File an issue for collapsing `trust`/`permission_mode`/`steering` into one
`{type: "ack", of, ok, message}` event, to be done after `AgentSession.qml` is
extracted. That removes six event types, three booleans and three reset paths,
and eliminates the class of defect this spec patches in one instance.
