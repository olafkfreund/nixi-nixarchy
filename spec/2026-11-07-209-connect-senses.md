---
status: draft
issue: 209
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: connect what's collected, and new senses

Slice 3 of #206 (intent, open question 8.3). All app code is in `olafkfreund/nixoarchy-snowflake`, at main `8f2275e`.
Line numbers are from that commit, so re-find them by name. The shell code is Omarchy's, at
`share/omarchy/shell/plugins/notifications/` in `omarchy-edge-20261104-cc99764`, and this slice doesn't change it. The
Nix module in this repo (`nix/hm-module.nix`) doesn't change either.

## Where this sits

- **#208 draws the reactions; this slice only senses.** #208 (reactions from today's signals, with chips) isn't specced
  yet. This slice gives it new signals in the two forms the page already reads: a `nudge` kind (`server.py:2118`,
  drained by `nudgeDrain`, `index.html:2397`) and a field on `situation` (`server.py:1732`, `index.html:2316`). Until
  #208 lands, a new nudge kind shows only its caption line, as `nudgeDrain` does for any kind, and a new situation
  field is ignored. No art is added here.
- **It reuses `Nudge`** (`server.py:2013`): its breakpoint wait, one visual per 5 minutes, one spoken line per 10, and a
  cooldown per kind. Every new sense is an edge that calls `Nudge.offer`, never a stream, which is the intent's calm rule.

## What happens today

| Signal | Collected | Reaches him |
|---|---|---|
| Failed user units | `Ambient.fetch("sys")`, every 15 min (`server.py:1425`, `:1480`) | a lambda-tip cue, and a `confused` poke when the list grows (`index.html:2319`) |
| Failed system units, disk | `plugins.system_status()` (`plugins.py:722`), only for a plugin with `reads: [system-status]` | only on the system board |
| Network | byte rates (`plugins.py:649`) | only on the board |
| Other hosts | `peers.snapshot()` (`peers.py:172`), which starts a round only when a board asks (`plugins.py:854`) | only on the fleet board |
| Heat | `frost()`: `"hot"` above 28 °C (`server.py:1536`) | a warm tint on the tips (`index.html:2202`) |
| Storm | Open-Meteo codes 95-99 count as `rain` (`server.py:1566`) | the rain look |
| Break | one 60-minute counter (`server.py:2070`) | a stretch, no snooze |
| Media | any MPRIS player `Playing` (`server.py:1729`) | headphones, for video too |
| News | the news plugin (`plugins/examples/news`), when you ask | the news board |
| Do Not Disturb | the shell's `doNotDisturb`; muted rows never reach Nixi (`Service.qml:682`) | nothing else checks it. Nudges and agent speech ignore it (`server.py:1202`) |

## Design

### 1. The quiet gate (DND), and the calm hold

- **Read it from the shell.** The notifications socket Nixi already uses answers `isDnd` with `on` or `off`
  (`Service.qml:1552`, reached through `IpcRegistry.call`, like `activateKey`). `Ambient.sense` asks
  `Inbox.call("isDnd")` at most every 10 seconds. No answer keeps the last value; the first value is `off`.
  `situation` gains `dnd`.
- **One rule, checked twice.** A reminder or reaction shows only while none of DND, the lock, fullscreen or a meeting
  is on:
  - on the server, in `Nudge.tick`, before it publishes. Today it checks only the lock (`server.py:2099`) and, for
    speech, the meeting (`server.py:2115`);
  - on the page, in `nudgeDrain`, at the moment it shows one. A nudge already queued in `nudgeQ` (`index.html:2397`)
    when DND starts must not slip out. Today `notifyIdle()` checks fullscreen but not the meeting, the lock or DND
    (`index.html:2439`). The page's own unasked pokes (the failed-unit `confused`, `index.html:2319`) and #208's
    reactions use the same check. Reduced motion and the notch, bar and pop-out modes stay #208's, which draws.
- **Also while DND is on,** `agent_say_ready` returns `{"speak": False, "reason": "dnd"}`, beside the meeting check
  (`server.py:1210`). An agent's "finished" already doesn't talk (`index.html:2311`).
- **Never gated:** approval requests (`/api/approve`, and the page's `ask` path, `index.html:2312`), answers to
  something you asked, and boards you open.
- **A held reminder keeps its place.** Today every offer goes stale after 10 minutes (`server.py:2098`). A reminder
  (break, workout, water) instead carries a deadline: its window's end for a workout, and no end for break and water,
  which wait for the next allowed moment. Other kinds keep the 10 minutes.
- **Not a typing check.** The breakpoint is an unlock, a workspace switch, or 20 seconds without Hyprland events
  (`server.py:2102`, `Desk.on_event`, `:2540`), and nothing watches the keyboard, as the settings promise
  (`index.html:882`). The intent's "never during typing" isn't met by this. Decided: the existing breakpoint (see Decided).

### 2. Machine senses

Gated by `proactive` and `react_load`, which today covers load and memory. Its settings label becomes "React to the
machine" with the new kinds in its hint. No new flag. This collection is its own, so `ambient_system` and the
lambda tips don't change, and either works without the other.

- **A service failed.** Every 2 minutes, `Ambient` reads failed user and system units with `plugins._failed`
  (`plugins.py:714`). Each keeps its own last good set. A failed read returns `None`, which keeps the last set, so a
  recovery is never a "new failure". A unit name not in the last set offers `error`, "<unit> failed." The first good
  read only records. `_failed` keeps 20 names, which is enough for an edge. Cooldown 30 minutes. A new user unit can
  also give today's `confused` poke; the two together are intended.
- **Disk almost full.** `os.statvfs` on `/` and `/nix/store`, in the same step. 90% used or more offers `disk`, "Disk
  <path> is <n>% full." It clears below 85%. Cooldown 6 hours.
- **No default route.** No default route in `/proc/net/route` (destination `00000000` with the `RTF_UP` flag) and none
  in `/proc/net/ipv6_route` (`::/0`, up), held for 30 seconds, offers `offline`, "No network connection." An unreadable
  file is unknown and keeps the last state. It's a local check only: Nixi sends nothing to test the internet.
  Coming back clears it, with no line. Cooldown 30 minutes. Network rates never make a reaction.
- **Another host comes online.** While `plugins.peers_allowed()` holds (`server.py:279`: `peers_on` and a configured
  peer), `Ambient` calls `peers.snapshot()` every 5 minutes, which starts one bounded background round
  (`peers.py:129`, 2 seconds). Edges are read when a round finishes, from the existing callback: `peer_round_done`
  (`server.py:5426`) first calls a new `Ambient.peer_edges()`, then does what it does today. So a round the fleet board
  started counts too. A peer, by its `peers.json` name, that was `down` in the last finished round and is `up` now
  offers `host`, "<name> is back." The `asking` state at startup never counts, so a host that's already up isn't
  announced. A host going down makes no reaction (see open questions).

### 3. Heat and storm

Gated by the existing weather gate, `Ambient.gated()` (`server.py:1577`), and read through `reading()`, which already
drops a stale or moved reading (`server.py:1581`).

- **Storm.** `forecast()` returns `storm: code in (95, 96, 99)`. `sky` stays `rain`, so the rain look stays, and
  `situation` gains `storm`. The edge offers `storm`. The omarchy fallback has no storm reading, so it stays `False`.
- **Hot and sunny.** `situation` gains `hot`: feel 28 °C or more, sky `clear` or `partly`, and day. It clears below 26
  °C, at night, when the sky changes, or when the reading or the gate goes. It's Open-Meteo only: the omarchy
  fallback reads only rain and snow (`sky_of`, `server.py:1530`), so it never gives `hot`. `frost()` and its tint
  stay.
- Both use the 20-hour cooldown that rain and snow use (`server.py:2016`).

### 4. Breaks: workout schedule, water, snooze

Gated by `proactive` and `react_break`, as the break is today.

- **Workout schedule.** A new setting, `"workout": []`, at most 7 entries of `{"days": [0-6], "at": "HH:MM"}` (Monday is
  0), validated on save like the other lists (`server.py:6309`). Each entry opens a window from `at` to an hour later,
  on local wall-clock time, and offers `workout` once, with that deadline. Two entries whose windows overlap give one
  reminder. "Once a day" means shown once: if the window ends while held, it's gone. The day's record is memory only,
  so a restart inside a window can show it again.
- **Water.** A new setting, `"water_every": 0` minutes, off by default, or one of 45, 60 and 90. A counter like the
  break's restarts on a lock of 5 minutes or more, and offers `water`.
- **Snooze and dismiss.** Each reminder carries an `id` in its `nudge` event. `POST /api/nudge` with `{"id", "act":
  "snooze" | "dismiss", "minutes": 10 | 30}`, with the page token, acts only on the reminder last shown with that `id`.
  An old chip does nothing.
  - **Snooze** offers it again after that many minutes, past its kind's cooldown (`server.py:2108`), which today would
    drop an early repeat. It doesn't reset the break or water counter. A workout snooze ends at the window's deadline.
  - **Dismiss** drops a pending copy, ends that workout entry for the day, and restarts the break or water counter.
  - #208's chip calls it. Until then, nothing calls it.
- **Settings.** Under "Remind me to move": a row for the schedule (day buttons and a time, add and remove) and a
  choice for water. Two settings in `info`, as `react_break` is.

### 5. Telling video from music

Gated by `look_music`, as today.

- `sense` replaces `playerctl -a status` with one `playerctl -a metadata --format '{{status}}\t{{playerName}}\t{{xesam:url}}'`
  at the same 5-second step. For each `Playing` line:
  - **video** if the player is `freetube` or `grayjay`, or the URL's host is, or ends in `.` plus, one of
    `youtube.com`, `youtu.be`, `twitch.tv`, `vimeo.com` and `netflix.com`;
  - **music** otherwise, which is today's behaviour. So mpv and VLC count as music unless their URL says otherwise,
    because they play audio too.
- `situation` gains `video`. `music` is `True` only for music, so headphones no longer show for a video. Video wins
  if both play. The URL is used only for the host check and isn't kept, sent or logged.
- Not verified: what Firefox, Chromium and mpv report, with several players, and with no metadata. The plan starts by
  checking these on p620. A player that gives no URL stays "music", which is today's look.

### 6. Noticing new headlines

A new setting, `"news_watch": False`. It is its own switch because it runs a network plugin unasked.

- **Only from feeds you chose.** The plugin ships with BBC News, The Guardian and Hacker News as defaults
  (`plugins/examples/news/defaults.json`). The watch runs only when you've saved your own feeds, that is when
  `plugins.config_path("news")` exists.
- **Off the sensing loop.** `Ambient.step` runs before `sense` and `Nudge.tick` (`server.py:1741`), so a slow plugin
  there would hold up the DND and lock checks. Instead, every 30 minutes, while `proactive` and `news_watch` are on,
  Nixi isn't hidden, and the `news` plugin is enabled, `Ambient` starts one background thread, never two, that calls
  `plugins.run_stage(p, "news", locale)`. That is the same sandbox, the same consent check on every run
  (`plugins.py:785`), the same time limit and the same 5-minute cache as an asked run. It never starts the video
  search, which only the phrase path does (`server.py:5320`). The result is used only if the switch, the plugin and
  its consent are all still on when it returns.
- **What's new.** It keeps the last run's items, at most 5, as hashes of source and title, in memory only. Items not
  in the last run are new. The first run, and the first after the feeds change (by the hash `run_stage` already uses,
  `plugins.py:789`), only record. New items offer `news`, "<n> new headlines.", visual only. Titles aren't spoken or
  shown in the caption; #208's chip opens the news board, which asks again and may use the cached run.
- Headline text is never sent to an agent or logged, as today.

### 7. Nothing else changes

Today's moods, fidgets, props, nudges, cues, boards and settings stay. The message and mail path isn't touched, so the
#206 rule to pin it first doesn't apply here. New kinds are added to `Nudge.COOL`, to `QUIP_FALLBACK` and
`app/quips.json` (English; other languages fall back as today). Every new offer is visual only (`spoken` false), so
before #208 a new kind shows its caption and isn't spoken (`index.html:2410`).

## Splitting

Four plans and PRs under this one spec, in this order. Each needs the one before it:

1. **The quiet gate, the calm hold and reminder deadlines** (section 1). It needs no art, so it can land before #208,
   and every later piece relies on it.
2. **Machine, heat and storm** (sections 2 and 3).
3. **Breaks** (section 4). Its snooze needs #208's chip to be clickable, so it ships with or after #208.
4. **Media and news** (sections 5 and 6). Media after #208, because a video loses its headphones and has nothing
   until the popcorn exists. News could go earlier if review is easier that way.

## Alternatives rejected

- **A sensor process of its own.** `Ambient` already runs a loop every 2 seconds with per-source timing.
- **Reading `quiet.json` for DND.** The shell writes it on a delay (`saveSoon`), so it lags the toggle. The socket
  answers the live value.
- **Calling `plugins.system_status()` from `Ambient`.** It also forks `nixos-version` and may sleep 0.25 seconds for
  rates. Only its failed-unit helper and `statvfs` are needed.
- **A reaction for network bursts, or for every failed unit on a peer.** The calm rule rules out the first; peers'
  units stay on the fleet board.
- **Speaking new headline titles.** They're untrusted text from feeds, and the calm rule wants a sign, not a broadcast.
- **A flag per sense.** The intent asks for one simple switch; the existing flags already split machine, weather,
  breaks and music, and #208 can fold them into one.
- **Workout times in the Nix module.** A schedule changes often; the companion's settings are the right place.

## Risks

- **A busy news run.** An asked "news" during the background run, with no fresh cache, gets "still fetching…"
  (`plugins.py:795`) until the run ends, within the plugin's time limit. Accepted; 30 minutes apart.
- **Network use.** The news watch and the peer rounds are new traffic, each behind a switch that is off by default.
- **System unit names on screen.** A failed system unit's name appears in his caption, which is local, and on a shared
  screen. The board already shows them.
- **Video classified as music.** A browser without `xesam:url`, or a video file in mpv, keeps today's headphones.
- **Snooze before #208.** Without the chip, a reminder can't be snoozed, as today.
- **A flapping link.** Offline needs 30 seconds and has a 30-minute cooldown, so a flaky Wi-Fi gives one line.
- **The calm hold** delays a break reminder after a long fullscreen or meeting until the next breakpoint, by design.
- **Hosts:** p620 and razer, both on Hyprland with the Omarchy shell. Without the shell socket, DND reads `off`, which
  is today's behaviour.

## Verification

- `tests/test_nudge.py`: DND, fullscreen, meeting and the lock each hold a nudge; a held reminder outlives 10 minutes
  and shows once they clear; a workout held past its deadline is gone; the new kinds' cooldowns; after a delivered
  reminder, snooze repeats it past the cooldown, dismiss ends it, and an old `id` does nothing; overlapping workout
  windows give one; water's counter and its lock reset.
- A page test (`tests/notify_fit.mjs`, from #215): a nudge queued before DND, a meeting or the lock starts isn't shown
  until it ends.
- `tests/test_situation.py`: `dnd` from a faked socket, including no answer keeping the last value; `video` and
  `music` from faked `playerctl` output for each listed player, a YouTube URL, an unknown host and no URL; offline
  from fake route files, with its 30 seconds.
- `tests/test_weather.py`: codes 95, 96 and 99 give `storm` and `sky: rain`; `hot` on and off around 28 and 26 °C,
  only by day and with a clear or partly sky.
- A new `tests/test_ambient_senses.py`: a new failed system unit offers `error` once, the first read only records,
  and a failed read followed by a good one offers nothing; disk at 90% and clearing at 85%; a peer going down then up
  offers `host` once, from a board's round too, and `asking` never does; the news watch's first run records, a new
  item offers once, it never runs with the switch off, without saved feeds or with the plugin unconsented, a result
  arriving after the switch goes off is dropped, it runs off the sensing thread, and no title reaches the offer.
- `agent_say_ready` gives `dnd` while DND is on.
- The existing suites pass unchanged, and the plugin sandbox tests run, as the repo's README asks.
- On p620, by hand: toggle DND and see a pending reminder wait; stop a test user unit; play a song, a YouTube video in
  each browser and a file in mpv.

## Decided (2026-11-07, by the user)

- **Splitting:** four plans and PRs, in the order under Splitting.
- **"Never during typing":** the existing breakpoint is the idle pause: an unlock, a workspace switch, or 20 seconds
  without Hyprland events. No keyboard or compositor idle signal is added. The setting's hint is reworded only if it
  promises more than that.

## Open questions

1. **Which reaction does each new sense use?** The intent's table has system error, storm and "hot and sunny", but no
   disk or offline entry. Recommended: failed unit and offline use `error`; disk uses `memory`'s overflowing box;
   storm and heat get their own. #208 draws them.
2. **A host going down:** react too, or only to a host coming online? Recommended: only coming online, seen as down
   then up, so hosts already up at startup aren't announced.
3. **Is "drink water" in this slice?** The intent lists it under Breaks, but slice 8.3 names only the workout schedule
   and snooze. Recommended: yes, it uses the same counter.
4. **DND and an agent's "finished":** silent, as proposed, or still spoken? Recommended: silent; the caption still shows.
5. **Thresholds:** disk 90%, hot 28 °C, water 45, 60 or 90 minutes, news every 30 minutes. Change any?

Noted, not in scope:

- The lambda-tip `sys` cue counts only user units, while the system board shows both.
- `peers.snapshot()` keeps a stale `up` until the next round, so the fleet board can show a host up for a while after it
  went down.

## Reviews (2026-11-07)

Their findings don't approve anything. Codex reported `gpt-6.1-sol`. agy's JSON reports no model. Both read the
draft, the intent and code excerpts from `8f2275e`. Each finding was checked against the code.

**Confirmed and applied (Codex):**

- A nudge queued on the page could slip past DND: `nudgeDrain` checks `notifyIdle()`, which checks fullscreen only
  (`index.html:2439`). The gate is now checked on the page too.
- The breakpoint isn't a typing check: `Desk.on_event` counts Hyprland events (`server.py:2540`). Now stated, and
  decided by the user (see Decided).
- Snooze would hit the cooldown, which drops an early repeat (`server.py:2108`). Snooze now passes it, and acts by `id`.
- The news run is synchronous and `step` runs before `sense` (`server.py:1741`). It's now a background thread.
- The 10-minute expiry (`server.py:2098`) contradicted "held until clear". Reminders now carry a deadline.
- `snapshot()` returns the previous round. Edges are now read from `peer_round_done`, and the gate is `peers_allowed()`.
- Machine collection was tied to `ambient_system`'s fetch, and `_failed` returns `None` on error (`plugins.py:714`).
  Now its own collection, keeping the last good set.
- The news plugin ships default feeds (`defaults.json`), so consent isn't "feeds you chose". It now needs saved feeds,
  and keeps only the last run.
- No default route isn't "no network". Renamed, with the up flag and unknown readings.
- mpv and VLC play audio too, and host matching needed subdomains. Both fixed.
- The omarchy fallback reads only rain and snow (`server.py:1530`), so heat is Open-Meteo only, with its clear rules.
- Smaller: before #208 a new kind could speak (`index.html:2410`), so every new offer is visual only; Busy happens only
  without a fresh cache (`plugins.py:791`); the intent does list storm; the four pieces are dependent, not independent.

**Refuted (agy):**

- That DND and fullscreen aren't checked in `Nudge.tick`, and the disk and offline logic isn't in the code: these are
  what the spec proposes, not claims about today.
- That `index.html:2319` wasn't in the excerpt: it was (lines 2310-2322).
- That a background news run could skip consent: `run_stage` calls `_consented(p)` on every run (`plugins.py:785`).
- That system unit names reach the page through `data["sys"]`: the spec keeps that list user-only. Names do appear in
  a caption, which the Risks section states.

**Agreed, no change:** agy found the split reasonable and the meeting speech gate correct.

**Not verified:** what browsers and mpv report over MPRIS; a short idle signal from Hyprland; the news plugin's time
limit; and how `notifyIdle` and #208's chips will share the gate. No code has been written or run.

## Rollback

Revert each PR. The three new settings (`workout`, `water_every`, `news_watch`) are ignored by older code. The seen-
headline set and the peer edges are memory only.
