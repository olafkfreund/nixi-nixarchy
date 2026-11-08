---
status: draft
issue: 209
spec: spec/2026-11-07-209-connect-senses.md
part: 2 of 4 (machine, heat and storm; spec sections 2 and 3)
builds_on: plan/2026-11-07-209-1-quiet-gate.md
coders:
  1: codex   # server: failed units, disk and offline as edges, with the hand-off slot and tests; small stateful logic
  2: codex   # server and peers.py: host-back edges from the round callback, without starting a second round; tricky threading
  3: codex   # server: storm and hot-and-sunny, their offers and quips, the settings label; small edge logic with hysteresis
reviewers:
  - codex    # read-only review of the diff, looking for a false "new failure", a second peer round, or an offer from the wrong thread
  - agy      # a second, independent read of the same diff
---

# Plan: #209 part 2, machine, heat and storm

The second of the four plans under the approved #209 spec. It adds senses only: each is an edge that offers a nudge
through `Nudge.offer`, never a stream. No art; until #208 draws them, a new kind shows only its caption, visual only.

## Builds on part 1

Part 1 (`plan/2026-11-07-209-1-quiet-gate.md`) must be merged first. This plan relies on: `Nudge.tick` holding every
offer while DND, the lock, fullscreen or a meeting is on; the deadline argument `Nudge.offer(kind, text, spoken, t=None,
until="default")` (here every new kind keeps the default 10 minutes); `situation` carrying `dnd`; and the page's
`quietNow()` (a plain top-level function in `index.html`) gating every unasked reaction. Re-read part 1's merged code
before step 1: another session is applying its deviations (branch `docs/209-connect-senses-b`), so names may differ.

## Decisions carried over from the approved spec

- **Gate:** machine senses run only while `proactive` and `react_load` are on (no new flag). The settings row
  "Notice a busy machine" becomes **"React to the machine"**, its hint naming the new kinds. This collection is its
  own: `ambient_system`, `Ambient.fetch("sys")` and the lambda tips don't change, and either works without the other.
- **A service failed.** Every 2 minutes, read failed user and system units with `plugins._failed`. Each keeps its own
  last good set. A failed read (`None`) keeps the last set, so a recovery is never a "new failure". A name not in the
  last set offers `error`, "<unit> failed.". The first good read only records. `_failed` keeps 20 names. Cooldown 30
  minutes. A new user unit may also give today's `confused` poke on the page; both together are intended.
- **Disk almost full.** `os.statvfs` on `/` and `/nix/store`, in the same 2-minute step. 90% used or more offers
  `disk`, "Disk <path> is <n>% full."; it clears below 85%. Cooldown 6 hours.
- **No default route.** None in `/proc/net/route` (destination `00000000` with `RTF_UP`) and none in
  `/proc/net/ipv6_route` (`::/0`, up), held 30 seconds, offers `offline`, "No network connection.". An unreadable file
  is unknown and keeps the last state. Local only: nothing is sent to test the internet. Coming back clears it with no
  line. Cooldown 30 minutes. Network rates never make a reaction.
- **Another host comes online.** While `plugins.peers_allowed()` holds, `Ambient` calls `peers.snapshot()` every 5
  minutes, which starts one bounded background round. Edges are read when a round finishes, from the existing callback:
  `peer_round_done` first calls a new `Ambient.peer_edges()`, then does what it does today, so a round the fleet
  board started counts too. A peer, by its `peers.json` name, that was `down` in the last finished round and is `up`
  now offers `host`, "<name> is back.". `asking` never counts. A host going down makes no reaction (spec open
  question 2, recommendation).
- **Storm.** `forecast()` returns `storm: code in (95, 96, 99)`. `sky` stays `rain`; `situation` gains `storm`; the
  edge offers `storm`. The omarchy fallback has no storm reading, so it stays `False`.
- **Hot and sunny.** `situation` gains `hot`: feel 28 °C or more, sky `clear` or `partly`, and day. It clears below
  26 °C, at night, when the sky changes, or when the reading or the gate goes. Open-Meteo only. `frost()` and its
  tint stay.
- Storm and hot are gated by `Ambient.gated()` and read through `reading()`, and use the 20-hour cooldown of rain and
  snow (`72000`).
- New kinds go in `Nudge.COOL`, `QUIP_FALLBACK` and `app/quips.json` (English). Every new offer is visual only.

## Where the work happens

nixoarchy-snowflake, a new worktree `/mnt/code/Source-home/GitHub/nixi-209-2-code`, branch `feat/209-machine-weather`,
from `origin/main` after part 1 merges. Line numbers below are from `origin/main` `3cf27a6`; re-find them by name.

**Overlaps** (all edit `app/server.py` and `app/static/index.html`):

- **#208** (sensed reactions, approved, branch `feat/208-sensed-reactions`, not merged): its `error` reaction fires
  when `AMB.sys` grows, the user-unit lambda list; this plan's `error` nudge covers system units too. Both may show;
  #208 draws, this plan only offers. It adds `reactions` to `DEFAULTS` and `NOTIFY_FLAGS` and the `REACT`/`rx*`
  engine in `index.html`. This plan touches only the `reactLoadSw` row there. Rebase onto #208 if it lands first.
- **#210** (mail board), **#211** (agent approvals), **#214** (rich cards): none touches `Ambient`, `Nudge` or
  `peers.py`; #210 and #211 edit `DEFAULTS` and the `/api/settings` key list, which this plan doesn't. Textual
  conflicts only.

## Steps

1. **Failed units, disk, offline** (codex), `app/server.py`.
   - **Hand-off slot.** `Ambient` gains `later = []` and `later_lock = threading.Lock()`, and a classmethod
     `hand(kind, text, ok)` that appends `(kind, text, ok)` under the lock; `ok` is a no-argument check of the
     source's switches. `Ambient.loop` (`1875`) swaps the list out under the lock and, for each item whose `ok()`
     still holds, calls `Nudge.offer(kind, text, False)`, just before `Nudge.tick()`, on the ambient thread. An item
     whose switch went off while it waited is dropped. Step 1 offers from the ambient thread already; the slot
     is for step 2's peers callback and part 4's news thread, which must never touch `Nudge.pending` directly
     (`tick` iterates it).
   - **`Ambient.machine(t, proc="/proc")`**, called from `sense()` (`1790`) after the lock reading, only while
     `proactive` and `react_load` are on (else its state resets: `failed = {"user": None, "system": None}`,
     `disk_full = set()`, `off_since = None`, `offline = False`, and step 2's `peer_last = {}`).
     - Every 120 s (`machine_due`): two threads run `plugins._failed` (`plugins.py:714`) for
       `["systemctl", "--user", "--failed", "--plain", "--no-legend"]` and the same without `--user`, joined, as
       `system_status` (`plugins.py:722`) does, so a slow `systemctl` costs at most its 1 s timeout. For each scope:
       `None` keeps the last set; a list when the last is `None` only records; otherwise new names offer
       `error` with `quip("error", unit=first_new)`, then the set is replaced.
     - Same step: `os.statvfs` on `/` and `/nix/store`, used = `(f_blocks - f_bfree) / f_blocks` (as
       `system_status`); `>= .90` and not in `disk_full` adds it and offers `disk` with `quip("disk", path=p,
       n=round(100*used))`; `< .85` removes it. An `OSError` or `f_blocks == 0` keeps the last state.
     - Every call (cheap file reads): `route_up(proc)` returns `True` if either readable file proves a route:
       `proc/net/route` has a line whose destination is `00000000` and flags `& 0x1`, or `proc/net/ipv6_route` has
       one with destination 32 zeros, prefix length `00`, flags `& 0x1`, no `RTF_REJECT` (`0x200`) and iface not
       `lo`. `False` only if **both** files read and neither has one. Anything else (one unreadable and the other
       without a route, or neither readable) is `None`, unknown. Malformed rows are skipped. `False` starts `off_since`; held 30 s sets `offline` and offers
       `offline` once; `True` clears both; `None` changes nothing.
   - `Nudge.COOL` (`2155`) gains `"error": 1800, "disk": 21600, "offline": 1800`.
   - `QUIP_FALLBACK` (`1898`) and `app/quips.json` gain `error: ["{unit} failed."]`, `disk: ["Disk {path} is {n}%
     full."]`, `offline: ["No network connection."]`, plus one or two friendly variants each in `quips.json`.
   - `index.html:881`, the `reactLoadSw` row: label "React to the machine", hint "A sweat drop when the CPU works hard;
     a word when memory runs low, a service fails, a disk is nearly full or the network drops." Same id, same key.
   - New `tests/test_ambient_senses.py` (the `_ServerEnv` harness from `test_speakable`; `plugins._failed` and
     `os.statvfs` mocked, route files written to a temp `proc`): the first read only records; a new system unit
     offers `error` once; `None` then the same list offers nothing; a recovered unit failing again offers again;
     nothing with `react_load` or `proactive` off; disk at 90% offers once, stays quiet at 87%, re-arms below 85%;
     no default route for 29 s offers nothing, 30 s offers once; IPv6-only default counts as up; an `lo` reject
     route doesn't; one file unreadable and the other without a route is unknown (both ways round), and keeps the
     last state; a route in the readable file is up even if the other is unreadable; malformed rows are skipped; `hand()` from another thread reaches `pending` only through
     `loop`'s drain; an item handed in, then its switch turned off, then drained, offers nothing.
   → verify: `cd tests && python -m unittest test_ambient_senses test_nudge test_situation test_system_status`.
   Traps: import `server` only under `nixi_env`'s throwaway HOME (#176); never run the real `systemctl` in a test;
   `_failed` writes into a list by index, so pass a fresh `[None, None]` each time; don't touch `Ambient.fetch("sys")`
   or `data["sys"]` (the lambda tips and #208 read them); a unit name goes only into the caption text, never a log.

2. **Hosts coming online** (codex), `app/peers.py`, `app/server.py`.
   - `peers.py`: a `current()` beside `snapshot()` (`172`) that returns `copy.deepcopy(_results)` under `_lock`
     **without** starting a round. `peer_edges` must use it: calling `snapshot()` from the callback starts another
     round at once, since `_running` is already `False` there (`_round`, `129`).
   - `Ambient.peer_edges()`, under its own `peer_lock` (two rounds' callbacks can overlap: `_running` is already
     `False` when the callback runs): if not (`proactive` and `react_load` and `plugins.peers_allowed()`), clear
     `peer_last` and return. Else read `peers.current()`; for each row whose name had `peer_last[name] == "down"` and whose state
     is `"up"`, `Ambient.hand("host", quip("host", name=name), ok)` (`ok`: the
     same three switches); then `peer_last = {name: state}`. Rows in `asking`
     are stored as `asking`, so they never count as down.
   - `peer_round_done` (`server.py:5776`): its first line becomes `Ambient.peer_edges()`, before the
     `peers_allowed()` return and the `_peer_followup_round` return, so every finished round counts.
   - In `Ambient.machine`, every 300 s while the gate and `peers_allowed()` hold: `peers.snapshot()` (its result is
     ignored; the edge comes from the callback). Whenever the gate or `peers_allowed()` is off, `machine` clears
     `peer_last` (under `peer_lock`), so turning peers or "React to the machine" off between rounds forgets the old
     `down`s; the settings handler's `peers.stop()` (`server.py:6723`) resets rows to `asking` as well.
   - `COOL` gains `"host": 1800`; quips `host: ["{name} is back."]`.
   - Tests: in `test_peers.py`, `current()` never starts a round; in `test_ambient_senses.py`, with
     `peers.current` mocked: down then up offers `host` once; `asking` then up offers nothing; up then up nothing;
     up then down nothing; a call from the board's follow-up round still counts; peers off clears `peer_last`, so
     turning them on again announces nobody, also when no round finished while they were off; nothing reaches
     `pending` until `loop` drains. One integration case with the real `peers` module and a stub server (as
     `test_peers` runs one, `test_peers.py:63`): count round starts over a 5-minute machine tick, with and without a
     gauges board on screen, and check `peer_edges` sees each finished round once and starts none itself.
   → verify: `cd tests && python -m unittest test_peers test_ambient_senses test_plugin_stage`.
   Traps: `peer_round_done` runs on the round's thread; never call `Nudge.offer` there; no network beyond a
   loopback stub server in tests; the 5-minute round is new traffic, only behind `peers_on`.

3. **Storm and hot** (codex), `app/server.py`.
   - `forecast()` (`1688`): the returned dict gains `"storm": code in (95, 96, 99)`. `sky` stays `rain` for them.
     Don't add it to `reading()`'s 7-tuple (`1720`): `fetch`, `sense` and the weather board (`5630`) unpack it.
     Read it in `sense` as `bool(cls.wx.get("storm"))` when `source == "open-meteo"`, else `False`.
   - `Ambient` fields `storm = hot = False`; `situation()` (`1786`) gains both keys.
   - In `sense`, under `gate`: `storm` as above; `hot`, when `source == "open-meteo"` and `cls.day` and
     `sky in ("clear", "partly")` and `feel is not None`, is `feel >= 28` when off and `feel >= 26` when on; any
     other case is `False`. Gate off: both `False`.
   - `Nudge.watch` (`2199`): a loop beside the `react_quips` one, but gated by `Ambient.gated()` only, over
     `("storm", A.storm), ("hot", A.hot)`, using the same `quipped` dict and visual-only offers, so the tick's
     cooldown re-arm (`2246`) works for them unchanged. While the gate is off, the loop still runs and sets
     `quipped["storm"]` and `quipped["hot"]` to `False` (both are `False` then), so turning weather back on during a
     storm offers it again. `COOL` gains `"storm": 72000, "hot": 72000`. Quips:
     `storm: ["Thunder outside. Stay in!"]`, `hot: ["Hot and sunny out there."]` (wording free).
   - Tests in `test_weather.py`: codes 95, 96, 99 give `storm` and `sky == "rain"`; 61 gives no storm; `hot` on at
     28, still on at 26.5, off at 25.9; off at night, under `cloudy`, with the omarchy source, and with the gate
     off; the storm and hot edges offer once and not again within 20 hours; a storm, the gate off,
     then on again during the storm offers again.
   → verify: `cd tests && python -m unittest test_weather test_situation test_nudge test_weather_fit`.
   Traps: `test_weather.py` builds `wx` dicts by hand; older dicts without `storm` must still read `False` (use
   `.get`); `frost()` and the page's warm tint stay as they are.

4. **Review and PR** (me). Full suite from `tests/` (fit tests one at a time). A fresh Opus reviewer on this plan
   and `git diff`, then Codex and agy read-only. One PR linking the #206 intent, the #209 spec and this plan, with
   `@codex review`, naming codex's steps.

5. **Deploy and check** (me). Merge, bump `nixi-companion` in `nixos_config`, CI, merge, post on the agent bus, switch
   p620 from a clean worktree (`nh os switch .`, not `just deploy`), restart Nixi with the live Hyprland signature.
   With the user, "React to the machine" on: `systemd-run --user --unit=nixi-test false` gives "nixi-test.service
   failed." at the next breakpoint, once; unplugging the network for over 30 s gives the offline line once.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/nixi-209-2-code/tests && python -m unittest test_ambient_senses test_peers test_weather test_situation test_nudge
```

Then the full suite. `test_character_fit` can be flaky under load; rerun it alone before treating it as a failure.

## Open questions for the user

1. **Spec open question 1 (which reaction):** the plan only offers kinds `error`, `disk`, `offline`, `host`, `storm`,
   `hot`; the art is #208's. Recommended as in the spec: failed unit and offline use `error`, disk uses `memory`'s box.
2. **Spec open question 2 (host going down):** the plan reacts only to down then up (the recommendation).
3. **Spec open question 5 (thresholds):** disk 90/85%, hot 28/26 °C, as specced.
4. **Storm and hot need `react_quips` too?** The spec gates them by the weather gate only, while rain and snow
   lines also need "little jokes". Recommended: the weather gate only, as the spec says; a storm is a sense, not a joke.

## Reviews (2026-11-08)

Their findings don't approve anything. Codex reported `gpt-6.1-sol`; agy reported no model. Both read the three part
2-4 drafts, the spec, the part 1 and #208 plans, and `server.py`, `plugins.py`, `peers.py`, `index.html` and five
test files from `3cf27a6`. Each finding was checked against the code.

**Codex, confirmed and applied:**

- `peer_last` was cleared only in the round callback, so turning peers off between rounds could keep an old `down`
  and announce a host already up. Now cleared by `machine` whenever the gate or peers are off.
- The hand-off slot carried no consent: a `host` (or part 4's `news`) handed in, then its switch turned off, would
  still offer. Each item now carries an `ok()` rechecked at drain. (Its "queue age" point is refuted: the slot is
  drained every 2 seconds.)
- `route_up` didn't define one unreadable file plus one without a route; that is now unknown, as the spec's "an
  unreadable file is unknown" requires.
- The storm and hot `quipped` entries stayed `True` while the weather gate was off, blocking the next edge. Reset now.
- `test_peers` runs a loopback server (`test_peers.py:63`), it doesn't mock `_ask`; the trap was wrong. Added a
  round-count integration case, and `peer_edges` takes a lock because callbacks can overlap (`peers.py:166-169`).

**agy, confirmed and applied:** the drain must take the lock too (now "swaps the list out under the lock").

**agy, refuted** (each contradicts the plan text or the code): that `hot` ignores day and `storm` isn't in
`situation()` (step 3 says both); that the offline 30-second hold is missing (step 1 holds 30 s); that
`peers.current()` stops edges firing (`machine` starts a round every 5 minutes with `snapshot()`); that this plan
adds a `playerctl` call (it doesn't touch media); that `wkey` handling changes (it doesn't); that the 30-minute
`error` cooldown isn't in the spec (spec section 2 says 30 minutes); that part 1 adds `peer_edges` or the
`reactLoadSw` row (neither; the row exists at `index.html:881`).

**Not verified:** `_ServerEnv`, `test_system_status` and the fit harnesses weren't in the reviewers' files; no code
has been written or run.

## Rollback

Revert the PR and bump back. `storm` and `hot` in `situation` are ignored by older pages; no setting is added; the
unit sets and peer states are memory only.
