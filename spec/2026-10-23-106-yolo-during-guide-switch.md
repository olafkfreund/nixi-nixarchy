---
status: draft
issue: 106
intent: intent/2026-10-23-106-yolo-during-guide-switch.md
---

# Spec: Leaving Mechanic never approves anything

## Design

One flag in `bridge/bridge.js`: `leavingMechanic`. It's set **synchronously** when a `trust` message
asking for Guide is received, and cleared when that switch settles, whether it succeeds or fails.
Everything that decides on approval reads an **effective trust**:

```js
const effectiveTrust = () => (leavingMechanic ? "guide" : trust);
```

### 1. The `trust` handler (~644)

When `next === "guide"`, before the `async` block:
- `leavingMechanic = true;`
- `cancelAllPendingPermissions();` This is Q2: a card pending before the switch can't be allowed in
  the window. Cancelling it at once is the same outcome Guide gives at the end today, only earlier.
  An answer that arrives later finds no pending entry, so `answerPermission` already ignores it
  (~490).

In the `async` block:
- **Success:** as today: `mergeSettings`, `trust = next`, ack. The existing
  `if (trust === "guide") cancelAllPendingPermissions()` stays; by then it is a no-op.
- **Failure (#40):** as today, `trust` is unchanged and the failed ack carries it. Nothing is
  written.
- Both paths clear `leavingMechanic` in a `finally`.

The switch to Mechanic is unchanged: it takes effect only after confirmation.

### 2. Every path that approves

- **`currentPolicy()` (~120)** uses `effectiveTrust()` instead of `trust`. During the window,
  `requestPermission` gets Guide's policy, `permission: "cancel"`, so a new request is refused
  with the Guide status line, never YOLO-approved and never shown as a card.
- **`savePermissionMode` (~112)** checks `effectiveTrust() !== "mechanic"`, so a YOLO switch in the
  window is refused with today's error ("YOLO is only available in Mechanic") and a failed ack.
  Nothing is written.
- **`allowAllPendingPermissions` (~656)** runs only after `savePermissionMode` succeeded, which
  the check above now prevents in the window. Add `if (effectiveTrust() !== "mechanic") return;`
  inside it as a second guard, so any future caller is covered too.

### 3. What a failed switch to Guide leaves

`trust` is back to (still) Mechanic, the ack says so (#40), and the cards pending before the
switch stay cancelled. They can't be "un-cancelled", because the agent already got its answer. The
agent re-asks if it still needs the tool. That's the conservative outcome, and the docs say so.

### 4. Docs

`docs/architecture.md`, trust invariants: becoming stricter takes effect when it is received, and
becoming more permissive when it is confirmed. A failed switch to Guide leaves earlier cards
cancelled.

## Alternatives rejected

- **One queue for trust and permission-mode messages:** it orders more combinations, but it makes
  a YOLO switch wait behind a slow mode call, and it needs the same "stricter now" rule anyway.
  Rejected at intent approval (Q1).
- **Set `trust = "guide"` before the mode call:** that is the #40 bug. A failure would report a
  level the session isn't in.
- **Keep earlier cards visible but refuse "allow" on them:** the card would show buttons that
  can't work. Cancelling them is clearer, and it's what Guide does anyway when the switch completes.

## Risks

- **Two trust switches in flight** (Guide, then Mechanic before the first settles): the flag clears
  when the Guide switch settles, and the later Mechanic switch takes effect when confirmed, as
  today. Their relative order is pre-existing behaviour and is not changed. It's documented as out
  of scope.
- **The #95 branch** also edits `allowAllPendingPermissions` (it skips herdr writes). There will be a
  small merge conflict. The guard added here goes first, and the herdr skip stays.
- **The companion** sends the same messages, so it gets the same behaviour. No UI change is needed:
  a cancelled card disappears through the existing path.

## Verification

- **Bridge tests (fake agent, `FAKE_AGENT_HANG=mode` holds the second mode call open):**
  - at Mechanic with a card pending: `trust: guide`, then `permission_mode: yolo`. The YOLO ack is
    `ok: false`, the card was cancelled (the agent got `cancelled`, not `allow`), and
    `nixi.json` has no `permissionMode: "yolo"`;
  - at Mechanic with YOLO on: `trust: guide` held open, then a new permission request. It is
    refused (`cancelled`), not auto-approved;
  - an answer `allow` sent for the earlier card after `trust: guide` changes nothing (the agent saw
    `cancelled`);
  - a failed switch to Guide (the held mode call times out: `NIXI_MODE_TIMEOUT_MS`, as the existing
    tests at `trust-policy.test.js:255` do) acks the old level, writes nothing, and clears the
    flag. A YOLO switch after it at Mechanic works again.
- The existing suites stay green: `node --test bridge/`, `python3 tools/test_nixi.py`,
  `nix flake check`.
- **Live (optional):** the window is too short to hit by hand. The tests carry it.
