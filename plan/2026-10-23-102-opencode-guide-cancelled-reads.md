---
status: draft
issue: 102
spec: spec/2026-10-23-102-opencode-guide-cancelled-reads.md
---

# Plan: opencode at Guide answers instead of giving up, and keeps secrets out

## Approved decisions (from the spec, so this file stands alone)

- **Measured:** opencode 2.0.32 ends a turn on any refusal (ACP reject, ACP cancel, config
  deny). With `external_directory: "allow"`, ordinary Guide reads work. Config `read` denies keep
  `~/.ssh/*` and `*.age` out of its read tool. The shell still asks: cancelled at Guide, a card at
  Mechanic.
- **opencode rules:** `external_directory: "allow"`; `read: { "*": "allow", …denies }` generated
  from `SECRET_PATHS`:
  - `~/X/**` → `"<home>/X/*"` and `"~/X/*"`;
  - exact files by path, in both spellings;
  - `**/.env`, `**/.env.*` → `"*.env"`, `"*.env.*"`;
  - `**/*.age` → `"*.age"`;
  - `/run/{agenix,secrets}/**` → `"/run/…/*"`.

  The `askBeforeReading` variant keeps its asks plus the denies. grep/glob/list get the same
  denies if S1 shows opencode applies patterns to them, otherwise `"ask"` outside the folder, or
  a documented gap.
- **Empty cancelled turn:** if a turn ends with `stopReason: "cancelled"`, no text, and the
  bridge refused a permission during it, emit one notice explaining it. Every agent.
- **Stalled-turn guard, every agent:** no event for 120 s with no tool in progress, or 15 min with
  a tool in progress, means `connection.cancel` and an `error`, unlocking the UI. Any event
  resets it, and a pending card pauses it.
- **Branch:** `fix/102-opencode-guide-cancelled-reads`, on top of `fix/97-codex-guide-secret-reads`
  (merge order #96 → #97 → #102). Worktree: `/mnt/code/Source-home/GitHub/nixi-nixarchy-102`.

## Who does what

One `coder` for this task, named "opener", for S2–S5. The lead does S1 (measurement), S6 (live)
and S7 (reviews), and commits each step.

## Steps

**S1. Measure grep/glob/list and Mechanic (lead).** Throwaway config, opencode through the
bridge:
- At Guide: `grep -r CANARY ~/.ssh`, `glob ~/.ssh/*`, `list ~/.ssh`, with `grep: { "*": "allow",
  "<home>/.ssh/*": "deny" }` (and the same for glob/list) vs today's plain `allow`.
- At Mechanic: a read-tool read of `~/.ssh/<canary>` (expect denied); a shell
  `cat ~/.ssh/<canary>` (expect a card, answered no).

Record the results here, then revert.

**S2. Rules** (`bridge/trust-policy.js` ~38-76, `bridge/trust-policy.test.js`)
- Add `opencodeSecretDenies(home)` (from `SECRET_PATHS`, as above). `OPENCODE_PERMISSIONS`
  becomes a function of `home` (or the deny list is merged in `opencodePermissions(askBeforeReading,
  home = os.homedir())`). Add `external_directory: "allow"`, and the S1-decided rules for
  grep/glob/list.
- Update the existing tests that `deepEqual` the constant (≈209, 280) to the new shape.
- New tests: the exact deny list for `home="/home/u"`; the `askBeforeReading` variant; that
  `plan_exit: "deny"` and `"*": "ask"` are still there.
- Verify: `node --test bridge/trust-policy.test.js`.
- Traps: `OPENCODE_CONFIG_CONTENT` is built at module load (`bridge.js` ~189); keep it that way.
  Don't touch Claude/Codex.

**S3. Explain an empty cancelled turn** (`bridge/bridge.js` `prompt()` ~459-480 and the
`requestPermission` Guide branch)
- Track `refusedThisTurn` (the title of the last refused request, reset at each prompt). On the
  `done` with `stopReason: "cancelled"`, no text emitted this turn and `refusedThisTurn` set, emit
  the notice: "The agent stopped instead of answering — at Guide it can't do what it tried
  (<title>). Try Mechanic, or ask differently."
- Test (fake agent): a Guide refusal followed by a cancelled, empty turn → the notice; a normal
  turn → no notice.

**S4. Stalled-turn guard** (`bridge/bridge.js`)
- A timer armed while `turnRunning`, reset on every emitted event. The limit is 120 s, or 15 min
  while a tool is pending or in progress (track by `toolCallId` from `tool_call`/
  `tool_call_update`), paused while `pendingPermissions.size > 0`. On expiry: `connection.cancel`
  and `emit({type:"error", message:"The agent stopped responding, so this turn was ended."})`.
- Make the limits overridable for tests only (an env var read in the bridge's test harness, e.g.
  `NIXI_TURN_STALL_MS`). Document that it's for tests.
- Tests: a fake agent that goes silent → error after the short limit; silent with a tool in
  progress → no error within the short limit; silent with a card pending → no error.
- Traps: clear the timer on `done`/`error`/`fatal`/close. No timer between turns.

**S5. Docs** (`docs/architecture.md`, README "Trust", `docs/model-verification.md`): the measured
table, opencode's end-on-refusal behaviour, the rules, the notice, the guard, and the opencode
canary re-check.

**S6. Live verification (lead)**, opencode through the bridge (and the companion for the hang
case):
- Guide: `/etc/hostname` answers; `~/.ssh/<canary>`, `~/x.age` and a `.env` aren't read, and the
  notice explains; grep/glob/list per S1.
- Mechanic: the same reads denied; a shell `cat ~/.ssh/<canary>` shows a card.
- Companion: the `~/.ssh` request no longer wedges the UI.

Restore the trust and agent settings and delete the canaries.

**S7. Review (lead):** Codex `review --base fix/97-codex-guide-secret-reads`, agy, and a fresh
Opus reviewer. Fix confirmed findings and record them here.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` | all pass |
| `python3 tools/test_nixi.py` | pass |
| `nix flake check` | pass |
| Live S6 | as listed |

## Rollback

Revert the merge. opencode returns to asking for external reads (an unusable Guide), and the
notice and guard go away.
