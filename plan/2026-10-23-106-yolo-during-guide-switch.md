---
status: approved
issue: 106
spec: spec/2026-10-23-106-yolo-during-guide-switch.md
---

# Plan: Leaving Mechanic never approves anything

## Approved decisions (from the spec, so this file stands alone)

- **The window:** a switch to Guide awaits the agent's mode call (`applyTrustMode`) before
  `trust = next`. Until then nixi treated the session as Mechanic: a YOLO switch passed, it
  approved pending cards, and new requests got Mechanic's (or YOLO's) policy.
- **One flag, `leavingMechanic`:**
  - set synchronously when a `trust` message asking for Guide arrives;
  - cleared in a `finally` when that switch settles (success or failure).
  - `const effectiveTrust = () => (leavingMechanic ? "guide" : trust);`
- **On receiving a switch to Guide:** set the flag, then `cancelAllPendingPermissions()` at once.
  An `allow` sent later for such a card finds no pending entry and is ignored (`answerPermission`
  already returns early).
- **`currentPolicy()`** uses `effectiveTrust()`, so new requests in the window get Guide's
  `"cancel"`.
- **`savePermissionMode`** checks `effectiveTrust() !== "mechanic"`, so YOLO in the window is refused
  with today's error and a failed ack, and nothing is written.
- **`allowAllPendingPermissions`** returns early unless `effectiveTrust() === "mechanic"`, as a
  second guard.
- **#40 unchanged:** a failed switch writes nothing and acks the level in force. Cards cancelled at
  receipt stay cancelled; the agent re-asks if it still needs the tool.
- **The switch to Mechanic is unchanged:** it takes effect only once confirmed.
- **Out of scope:** the relative order of two trust switches in flight (pre-existing).
- **Branch:** `fix/106-yolo-during-guide-switch` from `master`. Worktree:
  `/mnt/code/Source-home/GitHub/nixi-nixarchy-106` (`bridge/node_modules` is a symlink to the main
  checkout).

## Who does what

The plan edits 4 files, so it goes to one `coder`, named "guide", for P1–P3. The lead reviews,
commits each step, and does P4 (reviews).

## Steps

**P1. The flag** (`bridge/bridge.js`)
- Near `let trust` (~87): `let leavingMechanic = false;` and `effectiveTrust()`, with a one-line why
  (#106).
- `savePermissionMode` (~112-118): `trust !== "mechanic"` → `effectiveTrust() !== "mechanic"`.
- `currentPolicy()` (~120-122): pass `effectiveTrust()` instead of `trust`.
- `allowAllPendingPermissions` (~579): first line `if (effectiveTrust() !== "mechanic") return;`.
- The `trust` handler (~631-650):
  - when `next === "guide"`, set `leavingMechanic = true` and call `cancelAllPendingPermissions()`
    before the `(async () => {…})()`;
  - clear the flag in that block's `finally`, only if this message set it (a local
    `const leaving = next === "guide"`).
  - Keep the #40 order: mode call, then `mergeSettings`, then `trust = next`, then the ack.
- Verify: `node --test bridge/` (existing tests green).
- Traps:
  - Don't set `trust` early (that's the #40 bug).
  - `applyTrustMode(next)` must still be called with the target.
  - `currentPolicy()` also feeds `mcpServers` at session start. The flag is never set then, so
    there is no change.

**P1 result:** as planned (the `coder` agent). Two deviations:
- The flag is cleared by a `.finally` chained after the existing `.catch`, not a `finally` inside the
  block. It runs right after the ack, with no input between them.
- (lead) It is a **count** (`leavingMechanic++` / `--`), not a boolean. With two switches to Guide in
  flight, the first to settle would otherwise reopen the window while the second still waits.

**P2. Tests** (`bridge/trust-policy.test.js`, near the #40 tests ~250;
`bridge/testing/run-bridge.js` ~102)
- Harness: function steps get `write` (write one NDJSON message to the bridge's stdin without
  waiting) and `until`:
  `await message({ home, events, until, write: (m) => child.stdin.write(JSON.stringify(m) + "\n") })`.
  This is the same line as PR #105, so the merge is identical.
- `FAKE_AGENT_HANG: "mode"` holds every mode call after the first (the first is at session start),
  so a `trust: guide` stays in its window. Add `NIXI_MODE_TIMEOUT_MS` where the test needs the
  switch to end.
- Tests:
  1. **Settings `{trust: "mechanic"}`, hang:** `write` a `prompt` "PLEASE_WRITE" and wait for its
     `permission` event, then `write` `trust: guide` and `permission_mode: yolo`. Expect:
     - the YOLO ack is `ok: false`;
     - the agent log shows the permission outcome `cancelled`;
     - `settingsAfter.permissionMode !== "yolo"`.
  2. **Settings `{trust: "mechanic", permissionMode: "yolo"}`, hang:** `write` `trust: guide`, then
     a `prompt` "PLEASE_WRITE". The request is refused (outcome `cancelled`, a "Guide · not run"
     status), not YOLO-approved.
  3. **As 1, then `write` a `permission` answer** with the card's allow option id. The agent still
     saw `cancelled`, and nothing was written to `~/probe`.
  4. **Settings `{trust: "mechanic"}`, hang, `NIXI_MODE_TIMEOUT_MS: "300"`:** `trust: guide` fails
     (ack `ok: false`, `trust: "mechanic"`, `settingsAfter.trust` stays `"mechanic"`). After it, a
     `permission_mode: yolo` succeeds (the flag was cleared).
  - Check how the fake agent logs permission outcomes (`bridge/testing/fake-agent.js` ~86-110) and
    assert on what it records. Don't add new fake-agent modes unless one is needed.
  - Each test must fail with P1 reverted (run them once against `git stash` of P1, or reason it in
    the report).
- Verify: `node --test bridge/`.

**P2 result:** 4 new tests (the `coder` agent). Tests 1–3 fail with P1 reverted. Test 4 passes either
way, because it guards that the flag is cleared and that #40 holds. Deviations:
- Test 3 asserts only the agent's `cancelled` outcome, since the fake agent writes no file.
- Test 1 waits for the turn's `done` so the agent log has the outcome.
- **No test for the count:** `FAKE_AGENT_HANG=mode` holds every mode call, so the fake agent can't
  settle just one of two overlapping switches.

**P3. Docs** (`docs/architecture.md`, "Permission invariants" ~55): becoming stricter takes effect
when it is received, and becoming more permissive when it is confirmed. A switch to Guide cancels
pending cards at once, even if the switch then fails.

**P4. Review (lead):** Codex `review --base master`, agy, and a fresh Opus reviewer given the plan
and the diff. Fix confirmed findings and record them here.

**P4 result (2026-10-23):** Codex (gpt-6-sol) found no regressions. agy (model not reported) and a fresh
Opus reviewer agreed that nothing is approved in the window, and found paths the plan had missed.
Each was checked against the code, and the fixes are by the lead:
- **Fixed:** undo (`trust === "guide"`) and the `LEARNED.md` write (`resolveTrust(trust)`, #51)
  still read `trust`, so both ran during the window. They now read `effectiveTrust()`. Two new
  tests fail on the old code.
- **Fixed:** `guarded()` (whether an edit is backed up) reads `effectiveTrust()` too. No allow
  reaches it in the window today; this removes the trap.
- **Fixed:** a YOLO switch whose write was in flight when `/guide` arrived was saved and acked. It
  now re-checks after the write, writes `permission` back, and fails the ack. No test: the timing
  can't be forced through the process.
- **Fixed (UI, `Conversation.qml` `setTrust`):** the card kept cards the bridge had cancelled, and
  Allow then showed "Working…" for nothing. It now clears its queue when it sends a switch to
  Guide. There is a source check in `tools/test_nixi.py`.
- **Not changed:** the order of two overlapping trust switches (out of scope; the card blocks a
  second switch while one is pending), and test 4 passing without the fix (already noted).
- **Follow-up:** the companion's approval card (fork, `server.py` `Approvals.ask_bridge`) can
  likewise outlive a `/guide`. Its answer is dropped by the bridge, so nothing runs.

**Merge note (2026-10-23):** after `master` (#95–#103) was merged in, the new undo test failed once
with `ENOTEMPTY` while the harness removed the temporary HOME. The bridge was still writing as it
exited. The harness's `rmSync` now retries (`maxRetries: 5`). The full suite passed 3 runs in a row.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` | all pass, 4 new |
| `python3 tools/test_nixi.py` | pass |
| `nix flake check` | pass |

No live check: the window is too short to hit by hand (spec).

## Rollback

Revert the merge. The window comes back. No data format changed.
