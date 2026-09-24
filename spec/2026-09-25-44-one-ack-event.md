---
status: approved
issue: 44
intent: intent/2026-09-25-44-one-ack-event.md
---

# Spec: One acknowledgement, so a reset cannot forget a kind

## The intent's first open question, answered: no extraction

The issue proposes extracting `AgentSession.qml` first, on the reasoning that
the collapse is "mechanical" once the protocol lives in one file.

**The collapse does not depend on it.** Reading the code, the work is six emits
in `bridge.js`, three property declarations, five event branches and the reset
sites in `Conversation.qml`. The extraction would move that code; it would not
make any of it simpler to change.

So the extraction is a separate refactor -- of a 2400-line file with no QML
tests -- whose risk is not justified by this change. #44's deliverable is the
collapse; `AgentSession.qml` was sequencing advice, not the goal. Doing the
smaller thing delivers the issue and leaves the extraction as its own decision.

## Design

### The bridge: one shape

```js
function ack(of, ok, extra = {}) { emit({ type: "ack", of, ok, ...extra }); }
```

`of` names the request being answered and **matches the inbound message type**,
so a reader follows one word from the card's write to the bridge's reply. Six
emits become six `ack(...)` calls carrying the same payloads they always did.

### The card: one piece of state, three derived names

```qml
property var pendingAck: ({})
readonly property bool steeringPending: pendingAck.steer === true
readonly property bool trustPending: pendingAck.trust === true
readonly property bool permissionModePending: pendingAck.permission_mode === true
```

This is the decision that keeps the change small. The three names survive as
**derived** properties, so every existing binding -- the composer's `enabled`
and `opacity`, the `setTrust`/`setPermissionMode` guards -- keeps working
untouched. The state itself has exactly one home.

Making them `readonly` is load-bearing: it means a future assignment is a
**compile-time** failure rather than a silent second source of truth.

`beginAck(kind)` / `settleAck(kind)` / `clearAcks()` replace the assignments.
Five event branches become one `ack` branch that settles first and then
switches on `of` for the per-kind side effects, which genuinely differ.

### What this buys, concretely

`restartSession()` was, after #40:

```qml
steeringPending = false
trustPending = false          // added by #40
permissionModePending = false // added by #40
```

It is now `clearAcks()`. #40's fix was "remember to reset two more"; this makes
forgetting impossible, which is the whole reason #44 exists.

## Alternatives rejected

**Extract `AgentSession.qml` first.** See above.

**Rename the three flags at every call site.** More honest about the new shape,
and it drags UI bindings into a protocol change. The derived names give the same
single-source-of-truth guarantee for a fraction of the diff.

**Keep the three booleans and add a shared reset.** Treats the symptom: three
sources of truth remain, and the next reset path can still miss one.

**One ack with no `of`.** The card must know what was answered; without it the
branch cannot settle the right kind.

## Risks

- **A missed call site leaves a dead flag.** Mitigated structurally: the derived
  properties are `readonly`, so a stray assignment fails rather than silently
  creating a second truth.
- **The test harness waits on the old names.** `run-bridge.js` blocks on
  `trust`/`permission_mode` events; if it is not updated, every trust test hangs
  to its 15s timeout rather than failing clearly.
- **CI cannot see the card.** The QML half is guarded by string assertions in
  `tools/test_nixi.py`, the repo's existing idiom and the only thing standing
  between a layout or protocol mistake and a green build.
- **No behaviour may change.** The existing 86 tests passing is the evidence
  for that, and it is necessary rather than sufficient -- they were written
  against the old shape and passing them proves only that the shape change is
  invisible.
- Host-specific risk: none.

## Verification

1. All existing bridge tests pass unchanged in intent -- they assert the
   behaviour, not the wire names, once the harness is updated.
2. New bridge tests: every request answers with `{type:"ack", of, ok}`; **none**
   of the six old event names is emitted; a hung request acks `ok:false` and
   still reports the level in force (#40's guarantee).
3. New `tools/test_nixi.py` assertions: `pendingAck` exists, all three names are
   derived from it, none is assigned directly, `restartSession` clears via
   `clearAcks()` and names no individual kind, and neither file carries an old
   event name.
4. Each of those broken and observed to fail -- including reintroducing #40 by
   resetting one kind in `restartSession`.
5. `qmllint`, `nix flake check`.
