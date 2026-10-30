---
status: draft
issue: 133
intent: intent/2026-10-30-133-proactive-companion.md
---

# Spec: A proactive companion that notices what happens on the desktop

Three repositories change. Paths below are relative to each one:

- **snowflake**: `olafkfreund/nixoarchy-snowflake`, mainly `app/server.py` and
  `app/static/index.html`.
- **nixarchy**: `olafkfreund/nixarchy`, `pkgs/omarchy/`.
- **nixi**: this repo, `nix/hm-module.nix` and docs.

Phases follow the approved intent: (a) is specified in full; (b) and (c) give
the design and the decisions their plans must keep.

## Design

### 1. Speech never opens the microphone unasked (phase a, snowflake)

Today `Speaker` calls `Wake.talking_until(start + dur + 0.45)` for every
sentence it plays (`app/server.py:2320`). That sets `follow_until`, which opens
the "just talk" window (`app/server.py:1559-1563`).

- `Wake.talking_until(end, follow=True)`: with `follow=False`, it still sets
  `speaking_until`, so his own voice cannot wake him, but it sets
  `follow_from = follow_until = 0`.
- `Speaker.say(text, sid, epoch=None, follow=True)` carries the flag in the `todo`
  and `ready` tuples to the player loop.
- `/api/say` (`app/server.py:3527`) reads `follow` from the body and defaults it
  to `true`, so existing callers are unchanged.
- The page gets `sayAside(t)`: the same as `say(t)` (`index.html:1612`), but its
  `/api/say` post carries `follow:false`. Everything the companion says on its
  own uses it:
  - the attention nudge (`index.html:1525`, which uses `say` today)
  - notifications
  - meeting, load and break nudges
  - the welcome back

Only replies to the user keep `say`.

### 2. The shell hands notifications to the companion (phase a, nixarchy)

A new patch, `pkgs/omarchy/903-notification-delegate.patch`, applied the same
way as `902-notification-sender-close.patch` (`pkgs/omarchy/default.nix:2090`,
`--fuzz=0`), changes `share/omarchy/shell/plugins/notifications/Service.qml`.

**Lease.**
- `property double delegateUntil: 0`.
- `delegated` is true while `Date.now() < delegateUntil`.
- Nothing is persisted, so a shell reload starts with no lease and normal popups.

**Arrival.** In `handleNotification` (`Service.qml:578`), the DND check stays
first. A notification silenced by Do Not Disturb goes to history exactly as
today and never reaches the companion. Meeting Mode and DND keep sole ownership
of `quiet.json`. After that check, when `delegated` is true and the row is
eligible:

1. Record the row with `storeRecord(row, "delegated")`, unless it is ephemeral.
2. Keep the sender object tracked and the row in `liveKeys[key].row`. Then
   `CloseNotification`, `replaces_id` and the sender's actions still work.
3. Append `{key, app, source, summary, body: row.bodyLine, urgency, category}`
   to `delegatedQueue`, which is capped at 32 entries. When full, the oldest
   entry falls back to a popup.
4. Return without `showRow`.

A row is **not eligible**, and keeps the normal popup, when:
- `Delivery.bypassesQuiet(row)` is true
- or it carries a code (`row.code`)
- or it is critical
- or its app is `Nixi`

**Category** is decided in the shell. The shell already identifies the browser
site (`row.source`, from `Markup.identify`). The rule is a small table on
app/source:

| Category | Matches |
|---|---|
| `mail` | `mail.google.com`, Thunderbird, Geary, `outlook.*` |
| `chat` | teams-for-linux, `teams.microsoft.com`, Slack, Discord, Signal, Element, Telegram |
| `meeting` | a summary from Teams or a calendar app matching `meeting\|invitation\|starting\|calendar` |
| `video` | `youtube.com`, Twitch, Grayjay |
| `download` | a browser app whose summary matches `download` |
| `other` | everything else |

**IPC.** These methods are added to the existing `ShellIpc { target:
"notifications" }`, so they are reachable over the shell's own IPC socket
(`shell.qml:1696`):

- `delegate(ms)`
  - `ms > 0`: sets `delegateUntil = Date.now() + min(ms, 10000)`, returns the
    queued rows as a JSON array, and clears the queue.
  - `ms == 0`: drops the lease at once.
- `activateKey(key)`: runs `activate(key, true)`. `activate`
  (`Service.qml:1069`) is changed to read the row from `liveKeys[key].row` when
  the key has no popup (`rowIndexFor(key) < 0`), so a delegated row gets the full
  click behaviour: Omarchy command, sender action, sender window, site, app.
- `dismissKey(key)`: runs `closeToast(key, "dismissed", true)`. That already
  handles a key with no popup through `finishClose` (`Service.qml:748-756`).

Both refuse unknown keys and return `"none"`.

**Lease lapse.** A `Timer` (1 s, running while `delegateUntil > 0`) notices when
the lease has run out. It then sets `delegateUntil = 0` and shows every row
still in `delegatedQueue` with `showRow`. Nothing that arrived while the
companion was dying is lost. Rows the companion already took stay live until
they expire as usual.

**Popups already on screen** when the lease starts are left alone and finish
their time.

### 3. The companion holds the lease and shows the rows (phase a, snowflake)

A new `class Inbox` in `app/server.py`, next to `Ambient`, runs its own thread.

**Finding the socket.**
- Derive the path the way `omarchy-shell` does:
  `$XDG_RUNTIME_DIR/omarchy-shell-` + `md5("$OMARCHY_PATH/shell\n$WAYLAND_DISPLAY")[:16]` + `.sock`.
- If that socket refuses a connection, use the one `omarchy-shell-*.sock` that
  answers `notifications ping`. After a rebuild, `OMARCHY_PATH` in a long-lived
  session points at the old tree. On this machine, two of three sockets were
  stale and refused connections.
- Calls go over a plain `AF_UNIX` socket in Python: target `\x1f` method `\x1f`
  args `\x1e`; the reply is `OK\x1f…\x1e`. Measured at 0.21 ms per call. No
  process is forked.

**Loop.**
- Each second, while the master switch `proactive` is on, `notifications_takeover`
  is on, `not Wake.asleep`, and the page is connected (`BUS.subs` is not empty),
  it calls `delegate(5000)`. If any of those becomes false, it calls `delegate(0)`
  once.
- `/api/sleep` (`app/server.py:3541`) also calls `delegate(0)` right away when
  he is hidden, so a hide hands back within milliseconds.
- On a crash, the lease lapses after at most 5 s.

**Publishing.** Each returned row is published as
`BUS.pub(t="notify", key, app, source, summary, body, category)`. Before that,
the companion decides what to send:

- `summary` and `body` are dropped unless `notify_details` is on (off by
  default). Without it, the page shows the category and app or site ("New Teams
  message", "Mail from mail.google.com").
- With `notify_details` on, `SECRET_LINE` (`app/server.py:2876`) and an OTP
  pattern (4 to 8 digits near `code|otp|verify|login|passcode|2fa`) blank the
  text.
- Rows are never logged or written to disk, and never reach the bridge or the
  agent.

**Clicks.** A new `POST /api/notify/act {key, how: "open"|"dismiss"}` calls
`activateKey` or `dismissKey`. The key must match `^[A-Za-z0-9:_-]{1,64}$`.

### 4. The arrival animation (phase a, snowflake page)

On `ev.t === 'notify'` in the page's event handler (`index.html`, next to
`'attention'` at line 1521):

- If `busy`, recording, speaking, or an approval card is up: queue the row and
  show it when the page is idle again. Speech, listening and approvals always
  win.
- Otherwise:
  1. Glance at the caption.
  2. `G.jelly.kick(-0.45)` and `popPupils()`.
  3. Two or three sparks: `burstLines(col, 3)` in orb mode, `notchPulse(col)` in
     bar mode, where `dropSync()` opens the notch.
  4. Show the row in `#cap`, with a category glyph and text set through
     `textContent`, for 5 s.
  5. Play the category's sound if not muted.

  About 500 ms of motion in total. Clicking the caption or chip posts
  `/api/notify/act`.
- A row whose key is already showing updates the text with no new arrival.
- Three or more rows within 3 s become one arrival with a count ("3 new in
  Teams").

| Category | Mood (`poke`) | Effect | Colour | Sound |
|---|---|---|---|---|
| mail | `reading` 2.2 s | eyes sweep | `#4d6fb7` | `pop` |
| chat | `curious` 1.8 s | double glance, `G.tilt.kick(-8)` | theme `EC.hot` | new `chat`: 587→880 Hz, 90 ms |
| meeting | `surprised` → `t_serious` | `burstLines('#ffb02a', 8)`; the time stays in `#cue` | `#ffb02a` | `remind` |
| video | `excited` with star pupils, 1.4 s | the `hum` fidget for 2 s | `#e0569a` | `ok` |
| download | `t_beam` 1.6 s | `burstLines(EC.hot, 10)` | `#3ddc84` | `done` |
| other | `curious` 1 s | one spark | theme | `pop` |

- Only `meeting` is spoken by default, through `sayAside`. `notify_speak` lists
  the spoken categories.
- Avoid `excited` → `onMood` bursts for routine mail (`index.html:1043` fires a
  strong burst, shock and flash for some moods). Use the table's moods only.
- All of this reuses existing primitives. The only new code is the `chat` sound
  and the `notify` handler.

### 5. Situational looks (look layer in phase a; more looks in b and c)

**SVG.** Add `<g id="sitBack">` after `#accBack` and `<g id="sitFront">` after
`#accFront` (`index.html:501-513`). Hide them wherever `#accBack` and
`#accFront` are hidden (`body.bar`, `body.goohide`, `body.hover`).

**Drawing.** `drawSit(back, front, name, LOOK)` draws looks in `drawSkin`'s
flat style (`index.html:768`), with the same helpers and palette. It is never
called from `drawSkin` or `miniNixi`, so the settings skin picker never shows a
look and a skin change never erases one.

**Zones**, so a look never collides with a skin (skins sit at the top, y < -58):

| Zone | Area | Looks |
|---|---|---|
| chin | x ±18, y 52 to 97 | **tie**: knot at y 54 to 62, blade to y 97, pivot `[0, 56]` swaying with `G.wob` |
| sides | band arc behind, from (-64, -4) to (64, -4); cups in front at x ±62 | **headphones** |
| eyes | x ±48, y -18 to 10 | **shades**, **glasses** |
| top | phase c only, when no skin is worn | nightcap, party hat |

- Eye looks lift onto the forehead (`translate(0,-32) scale(.92)`, a new spring
  `G.sitLift`) while the mood is `talking`, `listening`, a `t_*` face or a tool
  mood. His eyes stay visible.
- **Priority:** one look per zone. When two compete, the higher wins: meeting >
  fullscreen > music > coding > time of day.
- **Transitions:** a new spring `G.sit` drives opacity and `scale(.7 + .3x)`
  around each part's anchor, with `G.jelly.kick(.35)` when a look goes on.
- **Steadiness:** a signal must hold for 3 s before a look goes on and stay gone
  for 8 s before it comes off; coding needs 60 s. Switching windows quickly
  therefore does not flicker.
- No `<filter>`, no `drop-shadow`, no extra `requestAnimationFrame`. Looks are
  static paths moved by the existing frame loop (`index.html:1092`).

**Signals.** The server publishes `BUS.pub(t="situation", meeting, music,
fullscreen, coding, …)` from a fast tick added to `Ambient`: 2 s, paused while
he is hidden. The tick reads:

- **meeting** (phase a): `~/.local/state/meeting-mode/active` exists
  (`os.path.exists`, no fork).
- **music** (phase a): one D-Bus MPRIS read. `playerctl status` forks, so it runs
  only every 5 s, and only while visible.
- **fullscreen** and **coding** (phases b and c): a thread on the Hyprland event
  socket, like `bin/nixi-watch`, that keeps the window class and fullscreen
  state. It drops the title in the parser.
- **load**, **RAM** and **battery** (phase b): `/proc/loadavg`, `/proc/meminfo`,
  `/sys/class/power_supply/BAT*`. They are skipped on machines without a battery,
  like this desktop.

**In a meeting**, as well as the tie: no spoken output at all, and the wake word
is paused (`Wake.should_run` is false while `meeting` is true). Notification
arrivals are visual only. A meeting reminder one minute ahead puts the tie on
early.

### 6. Helpful reactions (phase b, snowflake)

| Reaction | Trigger | Look | Hysteresis |
|---|---|---|---|
| CPU | 1-minute load > core count for 30 s | `#sweat` and a squint | clears below 0.7 × cores |
| RAM | `MemAvailable` < 10% | `G.sz` 1.06 and one warning | re-arms above 25% |
| fullscreen | fullscreen window | shades; fidgets stop; arrivals queue until it ends | |
| break | 60 min of active time | `stretch` fidget and one `sayAside` line | |
| welcome back | unlock after 30 min | `entrance()` and one line: missed count, next meeting | |
| download done | `download` category | the arrival variant | |
| failed unit | the count rises (exists in `Ambient`) | `poke('confused')` | |

The break counter adds a tick only when the Hyprland socket saw activity in the
last 2 minutes. A 10-minute gap resets it, so the reminder follows *active*
time, not the clock.

**Timing.** Nudges with no deadline (break, load, tips) wait for a breakpoint:
an unlock, a workspace switch, the end of a long command, or 20 s with no
window events. A meeting warning does not wait.

**Budget.** At most one unasked spoken line per 10 minutes, and one visual nudge
per 5 minutes; meetings are exempt. Each category has its own cooldown (CPU and
RAM: 30 minutes).

### 7. Fun looks, the shell hook, quips (phase c)

**Looks:**
- glasses when coding: an editor or terminal class focused for 60 s
- a nightcap at night (`nightTime`, `index.html:2473`)
- an umbrella when `omarchy weather status` says rain
- a party hat on a birthday or holiday the calendar names
- a proud `^ ^` on a new NixOS generation (the glint exists)

**Long command finished.** An option, `services.nixi.companion.commandDone.enable`,
installs a bash/zsh `preexec`/`precmd` hook. When a command took at least 30 s and
its terminal is not focused, the hook runs
`notify-send -a nixi-job "Done in 42s" "<command name>"`. Only the first word of
the command is sent. That arrives as an ordinary notification, so the shell
classifies it and the takeover shows it. No new path is needed.

**Quips.** Local template lists per event, with slot values (`{app}`, `{n}`,
`{pct}`). A quip never repeats until its list is used up. They live in
`app/quips.json`, so they can be edited without touching code. No model call.

### 8. Settings (all phases)

The new `CFG` keys all default to off, except the per-category sounds:

| Key | Default | What it turns on |
|---|---|---|
| `proactive` | off | the master switch |
| `notifications_takeover` | off | the takeover |
| `notify_details` | off | showing the title or body |
| `notify_speak` | `["meeting"]` | the spoken categories |
| `notify_sound` | on | per-category sounds |
| `look_meeting` | off | the tie |
| `look_music` | off | the headphones |
| `look_fullscreen` | off | the shades |
| `look_coding` | off | the glasses |
| `look_night` | off | the nightcap |
| `react_load` | off | CPU and RAM |
| `react_break` | off | the break reminder |
| `react_welcome` | off | the welcome back |
| `react_battery` | off | battery |

They join the save list at `app/server.py:3625`. A new "Desktop" section in
settings has one toggle per key.

### 9. nixi

- `nix/hm-module.nix`: `services.nixi.companion.commandDone.enable` (phase c) and
  its shell init. No new flake input.
- `README.md`: one section on the companion's desktop reactions and their
  switches.
- The nixarchy patch is pinned through nixi's existing `nixarchy` follows. No
  change here.

## Alternatives rejected

- **The companion owns `org.freedesktop.Notifications`.** Quickshell's
  `NotificationServer` (`Service.qml:1351`, `keepOnReload: false`) has no way to
  release the name or take it back. The companion would need to rebuild history,
  actions, code copy and the URL policy, and a crash would lose notifications.
- **Turn on DND while visible.** DND is saved to `quiet.json`
  (`Service.qml:54-62`), so a crash leaves the desktop silent. Silenced rows are
  `release()`d at once (`Service.qml:605`, `721-735`), which tells the sender
  the notification closed. Its actions die, and Chromium deletes the avatar. It
  would also fight Meeting Mode.
- **`dbus-monitor` in the companion.** Raw, uncleaned text, including
  unfiltered codes. No shell key, so clicks cannot be routed. The shell's popup
  would still show.
- **Fork `omarchy-shell` for the lease.** Measured at 0.12 s of CPU per call,
  which is about 6% of a core at a 2 s cadence. The IPC socket costs 0.21 ms.
- **The shell pushes to a companion socket.** The shell would need a reconnect
  loop and a socket the companion owns. Polling the shell's existing socket
  needs neither, at no measurable cost, with at most 1 s of delay.
- **AI quips about the current window.** This was rejected in the intent:
  privacy, cost, and it ties up the single-flight bridge.
- **Sunglasses in meetings.** They hide the eyes; the approver chose the tie
  only.
- **Teams screen reading, `gog gmail` polling.** Rejected in the intent.

## Risks

- **The patch drifts from upstream Omarchy.** `--fuzz=0` fails the build on any
  upstream change to the lines it touches. Same policy as 902; we offer it
  upstream.
- **A stale `OMARCHY_PATH` points at a dead socket.** Covered by the
  live-socket fallback. If no socket answers, the companion holds no lease and
  popups stay normal.
- **Notifications are lost while the companion is wedged but alive.** If the
  thread hangs, the lease is not renewed; it lapses within 5 s and the queue is
  shown as popups. A wedged *page* while the server lives is caught by
  `BUS.subs`: a dead event stream unsubscribes. A page that is connected but
  frozen would hold the lease. Guard: the page acknowledges each `notify` event
  (`POST /api/notify/seen {key}`). When three rows go unacknowledged for 5 s,
  `Inbox` calls `delegate(0)` and stops renewing until the page acknowledges
  again. From then on, new rows get shell popups. Rows already handed over
  before that point are in history but were never seen. This known gap is noted
  in the PR.
- **WebKit frame budget.** Looks add paths to a page that repaints every frame.
  Check the `lowFx` trigger rate before and after (verification below).
- **Meeting false positives.** Meeting Mode counts any call app using the mic.
  A voice note would put the tie on. That is acceptable; it only changes a look
  and silences speech.
- **Hosts.** This desktop, the only machine checked, has no battery, and
  battery reactions will not show here. Laptops need a check before phase b
  merges.

## Verification

Phase a:

1. **Microphone.** With `follow_up` set to 4 s, trigger an attention nudge
   (`nixi-companion attention --from claude test`). Speech plays, `Wake.follow_until`
   stays 0, and the page never shows listening. Then ask a question by voice; the
   reply still opens the window. A new unit test in `tests/` covers
   `talking_until(follow=False)`.
2. **Takeover.** With the companion visible and the switch on, run
   `notify-send -a teams-for-linux "Ana" "hi"`. No shell popup appears, the
   snowflake plays the chat arrival, and `omarchy-shell notifications
   showHistory` lists it.
3. **Fallback.**
   - Hide the companion and send again: a shell popup within 1 s.
   - `pkill -f nixi-companion/app/server.py`, then send: a shell popup within 5 s.
   - Send 5 while killed: all 5 appear as popups after the lapse.
4. **Not delegated.**
   - `notify-send -u critical x y`: shell popup.
   - `notify-send x "Your code is 482910"`: shell popup with the copy button.
   - DND on: nothing anywhere; it is in history.
5. **Click.** Click the snowflake's row for a browser notification; the browser
   tab gets focus (the same as clicking the shell popup).
6. **Looks.** Create `~/.local/state/meeting-mode/active` and the tie appears
   within 5 s; remove it and the tie goes after 8 s. Play music in `cliamp` and
   headphones appear. A crown skin and headphones show together.
7. **Patch.** `nix build` of nixarchy's omarchy package applies 903 with
   `--fuzz=0`. The nixarchy `checks.session` test sends a notification with a
   lease held and asserts that no popup appears and the history row exists.
8. **Cost.** `pidstat -p <server pid> 10 6` with the switch on and the companion
   idle: under 1% CPU. Count `lowFx` trips over 5 minutes with all phase-a looks
   on; there must be no more than with the looks off.

Phases b and c each add their own rows to this list in their plans.
