---
status: approved
issue: 133
spec: spec/2026-10-30-133-proactive-companion.md
previous: plan/2026-10-30-133-proactive-companion.md
---

# Plan: Proactive companion — phase (b)

Phase (b) of the approved intent covers rows 4 to 9: CPU, RAM, fullscreen
shades, the break reminder, the welcome back, and finished downloads. It also
covers the failed-unit glance from spec §6. Downloads already work: they are the
`download` category of phase (a), so there is nothing to build for them.

## Approved decisions this plan carries

- **Everything is off by default.** Each reaction has its own switch, and all
  of them also need the master `proactive` switch.
  New keys: `look_fullscreen`, `react_load`, `react_break`, `react_welcome`.
- **Nothing reads input devices or window titles.** Activity comes from the
  Hyprland event socket (window class only, titles dropped in the parser) and
  the lock state.
  - "Active time" means unlocked time.
  - Omarchy's hypridle locks the screen after idle, so a lock of 5 minutes or
    more counts as a break and resets the counter.
- **Nothing forks per tick.** The code reads `/proc/loadavg` and
  `/proc/meminfo` from files. It asks Hyprland for `j/monitors` over its IPC
  socket (`$XDG_RUNTIME_DIR/hypr/<sig>/.socket.sock`), in-process. That is the
  same `solitaryBlockedBy` LOCK check `omarchy-hyprland-session-locked` makes.
- **Nudges with no deadline wait for a breakpoint.** That covers break, RAM, CPU
  and welcome back. A breakpoint is one of:
  - an unlock
  - a workspace switch
  - 20 s without window events

  Meetings never wait.
- **Budget.**
  - At most one unasked spoken line per 10 minutes, and one visual nudge per 5
    minutes.
  - Cooldowns: CPU and RAM 30 minutes each, break 60 minutes.
  - Nothing is spoken in a meeting. Speech uses `sayAside`, so it never opens
    the microphone.
- **Thresholds, from spec §6.**
  - **CPU:** 1-minute load above the core count for 30 s; clears below 0.7 × cores.
  - **RAM:** `MemAvailable` under 10%; re-arms above 25%.
  - **Break:** 60 minutes of unlocked time.
  - **Welcome back:** an unlock after 30 minutes or more.
- **Fullscreen**
  - **Look:** shades (eye zone), lifted onto the forehead while he talks or
    listens, the same rule as other eye looks.
  - **Behaviour:** fidgets stop, and **the notification lease is let go** while
    fullscreen. The shell then handles notifications its own way, including its
    own fullscreen rule (`Service.qml` `fullscreenOn`).

    Deviation from spec §6: the spec says "arrivals queue until it ends". Phase
    (a)'s give-back turns any row the page holds back for more than 5 s into a
    shell popup anyway. Letting the lease go is simpler and gives the same
    result.
- **The welcome-back line only counts.** "Welcome back. 4 notifications while
  you were away; next: Standup at 14:00." The count is shell history entries
  whose `ts` falls inside the lock. The meeting comes from `Ambient.events`,
  only when `ambient_calendar` is on. No titles from history.
- **The failed-unit glance** (`poke('confused')`) plays when the failed user
  unit count rises, only with `proactive` on.

## Repositories and branches

| Repo | Path | Branch from | Branch |
|---|---|---|---|
| snowflake | `~/Source/GitHub/nixoarchy-snowflake-133b` (new worktree) | `origin/main` after phase (a) merges | `feat/133-proactive-b` |
| nixi | this repo | `master` after #134 merges | `feat/133-proactive-b` |

No nixarchy change.

## Steps

### Snowflake

1. **`class Desk`: Hyprland events and lock state** (`app/server.py`, after
   `class Inbox`)
   - A daemon thread connects to
     `$XDG_RUNTIME_DIR/hypr/<sig>/.socket2.sock`.
     - `<sig>` comes from `HYPRLAND_INSTANCE_SIGNATURE`. When that socket is
       missing, use the newest directory that has a socket that accepts a
       connection. The env can be stale after a Hyprland restart.
     - Reconnect with a 5 s back-off, the way `bin/nixi-watch` does.
     - Parse only the event name and these fields:
       - `fullscreen>>0|1|2` sets `fullscreen`
       - `workspace`/`workspacev2` sets `last_switch`
       - any event sets `last_event`

       Drop `activewindow` titles: split once on `,` and keep the class only, or
       ignore the event entirely. Nothing in (b) needs the class.
   - `locked()`: send `j/monitors` to `.socket.sock` in-process (1 s timeout).
     It is true when any monitor's `solitaryBlockedBy` contains `"LOCK"`.
     `Ambient.sense` calls it every 2 s and keeps `lock_since`.
   - Tests (`tests/test_desk.py`):
     - a fake socket2 server feeding lines
     - a fake `.socket.sock` answering monitors JSON
     - fullscreen on and off
     - lock detection
     - a stale signature falling back to a live one
     - titles never stored (assert no field holds title text)

   Verify: `python3 -m unittest discover -s tests` passes.

   Deviations (snowflake `21ba691`):
   - `Desk` reads the event socket only while `proactive` is on, and stops when
     it is switched off. Someone who never opted in never has their events
     read.
   - On connect it asks `j/activewindow` once, so a window that is already
     fullscreen is known before any event arrives.

   Traps:
   - `.socket2.sock` closes on a Hyprland restart, so reconnect and do not
     crash.
   - This desktop has three stale `hypr/` directories (see the
     `herdr-stale-hyprland-signature` memory).

2. **Load, RAM, lock and fullscreen in `Ambient.sense`** (`app/server.py`)
   - Extend `sense()`:
     - `cpu_hot`: the 1-minute load from `/proc/loadavg` is above
       `os.cpu_count()` for 30 s, with hysteresis at 0.7 × cores.
     - `ram_low`: `MemAvailable/MemTotal` under 0.10 from `/proc/meminfo`;
       clears above 0.25.
     - `fullscreen` and `locked` from `Desk`.
   - Publish them in the `situation` event with `meeting` and `music`. Gate
     `cpu_hot` and `ram_low` on `proactive and react_load`, and `fullscreen` on
     `proactive` (the look itself is gated on the page).
   - `Inbox.want()` adds `and not Desk.fullscreen`.
   - Tests: feed fake `/proc` files (a path parameter on a small reader
     function); check hysteresis both ways, and that `want()` is false when
     fullscreen.

   Traps: `os.cpu_count()` counts SMT threads. That is the right comparison for
   loadavg.

3. **`class Nudge`: breakpoints, budget, break and welcome back**
   (`app/server.py`)
   - `Nudge.offer(kind, text, spoken)` queues one entry per kind (newest wins).
   - `Nudge.tick()` runs from `Ambient.loop`, every 2 s.
     - It delivers the oldest queued nudge only at a breakpoint: an unlock
       within the last 10 s, `last_switch` within the last 10 s, or
       `now - Desk.last_event >= 20`.
     - It delivers only if the visual budget (5 minutes) and that kind's
       cooldown allow it.
     - Delivery is `BUS.pub(t="nudge", kind, text, speak)`. `speak` is true only
       when the 10-minute speech budget allows and there is no meeting.
   - The break counter, `react_break`:
     - `active_since` resets on any unlock that follows 5 minutes or more of
       lock.
     - At 60 minutes, offer `break` with a quip from a small local list ("An
       hour already! Stand up and stretch?").
   - Welcome back, `react_welcome`: on unlock after 30 minutes or more of lock,
     offer `welcome`. The text counts shell history `ts` within the lock
     (`~/.local/state/omarchy/notifications/history.json`, read capped at
     2 MiB, `ts` only) and names the next calendar item if one is known.
   - CPU and RAM, `react_load`: offer `cpu` (visual only, never spoken) and
     `ram` (spoken allowed) when the flags turn on.
   - Tests (`tests/test_nudge.py`, fake clock):
     - no delivery without a breakpoint
     - the budget and cooldowns hold
     - a meeting suppresses speech
     - the break counter resets after a 5-minute lock but not after a 1-minute
       one
     - the welcome-back count reads `ts` only

   Traps:
   - Never read `summary`/`body` from history; parse only `ts`.
   - The history file may be large or missing; cap it and treat errors as 0.

4. **Page: shades, CPU and RAM, fullscreen, nudges, failed-unit glance**
   (`app/static/index.html`)
   - `drawSit`: add a `shades` part in the eye zone of `sitFront`, in the same
     flat style as the tie and headphones:
     - two dark angled lenses centred on the eye centres (±25.5, -4.5)
     - a bridge and a small glint
   - A new spring, `G.sitShade`, drives it, gated on `info.look_fullscreen`,
     with the same hysteresis.
   - `G.sitLift` lifts it by `translate(0,-32) scale(.92)` while the mood is
     `talking`, `listening`, a `t_*` face or a tool mood.
   - `SIT` gains `cpu_hot`, `ram_low`, `fullscreen` and `locked`.
     - `cpu_hot`: show `#sweat` and a slight squint when idle (extend the
       `E.sweat` opacity condition, line ~1286).
     - `ram_low`: `G.sz` target 1.06 with a slow heave while true.
     - `fullscreen`: stop fidgets (`FID=null`, no new ones) and pause
       arrivals.
   - On `ev.t==='nudge'`:
     - `break`: the `stretch` fidget
     - `welcome`: `entrance()` and `poke('happy')`
     - `ram`: `poke('t_unsure')`
     - `cpu`: one sweat drop

     Then show `ev.text` in the caption with `textContent`, and call
     `sayAside(ev.text)` only when `ev.speak`. Nudges respect `notifyIdle()`;
     if not idle, keep the newest one per kind and show it later.
   - The ambient handler (line ~1532): when `(ev.sys||[]).length` rises and
     `info.proactive`, `poke('confused',1500)`.

   Verify:
   - render in headless Chromium with `SIT.fullscreen=true` and the looks forced
     on, the way the phase (a) live check did, so shades show over the tie and
     headphones without overlap
   - `node` parse check
   - unit tests

   Traps: eye looks must lift while talking, or his eyes vanish. Use flat paths
   only; no `<filter>`.

5. **Settings** (`app/server.py`, `app/static/index.html`)
   - Add `look_fullscreen`, `react_load`, `react_break` and `react_welcome` to
     the defaults (all false), to `NOTIFY_FLAGS`, to `state_info`, and to the
     Desktop section of the settings page. Use the existing `label.tg` markup
     and plain hints:
     - "Shades in fullscreen"
     - "Notice a busy machine"
     - "Remind me to move"
     - "Welcome me back"

   Verify: each one saves and survives a restart.

### nixi

6. **README:** add the four switches to the Desktop table, with one line on
   what "active time" means (unlocked) and that nothing watches the keyboard.

7. **Review, live check and PRs**
   - A fresh `opus` reviewer gets only this plan and the diff.
   - Live check on p620 through a temporary test activation of the snowflake
     only. No shell change, so the running shell stays; announce it on the
     agent bus first.
     - Fullscreen a window: shades on, and a notification gets the shell
       popup.
     - `stress-ng --cpu $(nproc) -t 60`: sweat within about 40 s, gone after.
     - Lock for 6 minutes, then unlock: the welcome-back line.
     - The 60-minute break is not waited out live; the unit tests cover it. The
       6-minute lock above checks the same delivery path (breakpoint, budget,
       stretch, `sayAside`), so there is no test-only override in the code.
   - Then the snowflake PR and the nixi PR, linked.

## Implementers

- Steps 1-5 go to the `coder` agent (Sonnet), step by step through
  `SendMessage`.
- Steps 6-7, and every live check, are done by the session model.

## Tests

| Where | Command | Expected |
|---|---|---|
| snowflake | `python3 -m unittest discover -s tests` | all pass; 3 new test files |
| snowflake | headless render | shades, tie and headphones at once, no overlap |
| nixi | `python3 tools/test_nixi.py` | passes |
| desktop | step 7 | as written |

## Rollback

- **Users:** each reaction has its own switch, and `proactive` turns them all
  off.
- **Code:** revert the snowflake PR. No new state is written: the break counter
  and lock times live in memory only.
