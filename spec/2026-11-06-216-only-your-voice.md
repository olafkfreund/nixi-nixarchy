---
status: draft
issue: 216
intent: intent/2026-11-06-216-only-your-voice.md
---

# Spec: Nixi answers you, not your speakers

Code lives in `olafkfreund/nixoarchy-snowflake` (`app/server.py`, `app/static/index.html`) and in this repo's
`nix/hm-module.nix`. Line numbers are from `nixoarchy-snowflake` main at 8f2275e.

## Design

Four parts, built in this order. Part 5 is designed here but not built until the counters ask for it.

### 1. A mic you chose that is gone is said, not hidden

Tested on p620: with `mic_device` set to a source that doesn't exist, `parecord` produces nothing, and `open_mic()`
(`server.py:2920`) moves on to `pw-record --target <name>`, which records the **default** mic instead. So today an
uninstalled Meeting AI wouldn't make him deaf. It would quietly put the speaker bleed back.

- `mic_cmds()` (`server.py:2881`) checks `mic_device` against `list_mics()` (`server.py:3117`) once per mic open. If
  the name is set and missing, it leaves the device out (plain default mic, on purpose), and the server publishes one
  `tick` per change: "The mic you chose (<label>) is gone. I'm using the default mic, so I may hear your speakers."
  It's also printed once to stderr.
- When `pactl` isn't there, `list_mics()` returns `[]` and nothing can be checked, so the setting is used as today.
- When the source comes back, the next mic open uses it again, with no message.
- **Listed, but silent.** A source can exist and still send nothing. `Wake.session()` counts frames that are exactly zero
  from the chosen source. After 10 s of nothing but zeros, it publishes one tick: "The mic you chose (<label>) sends no
  sound." A quiet room isn't zero: the cleaned source reads about 0.00004 with nobody talking.
- **No recorder works.** Today `Wake.loop()` (`server.py:3284`) only prints `open_mic()`'s error to stderr and retries,
  so he's deaf with no sign. It also publishes that error as a tick, once per new error.

### 2. Nixi's module can provide the echo canceller

Today the echo-cancelled source exists because Meeting AI's configuration makes one
(`~/.config/pipewire/pipewire.conf.d/60-meetingai-echo-cancel.conf`, source `meetingai-echo-cancel-source`).

- New option `services.nixi.companion.echoCancel.enable` (default `false`) in `nix/hm-module.nix`. It writes
  `~/.config/pipewire/pipewire.conf.d/61-nixi-echo-cancel.conf` with a WebRTC echo-cancel module whose source is named
  `nixi-echo-cancel-source`, built like Meeting AI's (`monitor.mode = true`, the default sink as reference).
- Turning it on doesn't change `mic_device`. The user picks the source in Nixi's mic menu, which already lists every
  non-monitor source. Like Meeting AI, it needs one PipeWire restart or a new login. The option description says so.
- p620 and razer keep using Meeting AI's source while it exists. The option is there so that removing Meeting AI
  doesn't need a Nixi change, and for people who don't run Meeting AI. Turning it on for p620 or razer is a
  `nixos_config` change, made only after the trial shows the echo canceller works.

### 3. "Media is playing" means any stream on the speakers

New `media_playing()` in `server.py`. It runs `pactl -f json list sink-inputs` (3 s timeout, through `Ambient.run`) and
returns true when any stream is uncorked, isn't muted, plays on a sink that isn't muted (`pactl -f json list sinks`),
and its `application.name` isn't `Nixi`, his own voice's `--client-name` (`server.py:4069`). That covers browsers, calls, `mpv` and Spotify, with or without `playerctl`, and doesn't depend on
the `look_music` look. No `pactl` means "unknown", counted on its own.

It's called once per heard phrase inside `Wake.check()`, after transcription, so it costs one `pactl` call per thing
heard and nothing while the room is quiet. `Ambient.music` is left as it is, because the looks and the beat use it.

This says something is playing, not that it's loud enough to reach the mic. A stream on headphones counts too. Stream
state can't tell headphones from speakers, and the counters only need "media was playing".

### 4. Counters, and "that wasn't me"

**Counters.** A small `HeardCounts` keeps today's and earlier days' totals in
`~/.local/share/nixi-companion/heard-counts.json`, 14 days at most. Each day holds numbers only, keyed by:

- path: `wake` (his name matched), `follow` (taken in the follow-up window), `barge` (cut him off)
- media: `on`, `off`, `unknown`
- outcome: `sent` (passed to Claude), `ignored` (Claude replied `[ignore]`), `not_me` (the user marked it)

No text, no audio, no time of each event. The file is written at most once a minute and on exit. Raw counts are
`GET /api/heard` (token as for other `/api/*`), and the mic section of Nixi's settings shows one line:
"This week: 14 times by name, 6 follow-ups · 2 not for me (both while media played)."

**Marking.** Two ways, both marking the last accepted phrase if it was within the last 2 minutes:

- Saying "that wasn't for you", "not you" or "I wasn't talking to you" (and the nb/pl wording next to the existing stop
  words, `server.py:3130`). While he's talking, it works like "stop". Afterwards, he only says "Sorry." and stays put.
- A "That wasn't me" entry in his right-click menu, shown only within those 2 minutes.

**How an answer keeps its path.** `Wake.check()` adds `path` (`wake`, `follow`, `barge`) and `media` to the `wake` and
`barge` events it publishes (`server.py:3384-3400`). The page passes them back unchanged as `heard` in its `/api/ask`
body (`index.html:2973`). Asks typed or clicked carry none, and aren't counted. The server's ask handler counts `sent`.
It counts `ignored` where its own gate drops a `[ignore]` reply (`gate["ignored"]`, `server.py:6736`). It keeps one
slot in memory, `(path, media, time)` of the last counted ask, for `not_me`. That slot is overwritten by the next ask,
never written to disk, and holds no text.

### 5. Later, only if needed: his name while media plays

If after a working week the counters show more than about five `follow` / media `on` answers marked `not_me`, then
while `media_playing()` is true, the follow-up window takes nothing. His name, as `WAKE_RE` accepts it today (bare
"Nixie" included), and "stop" while he talks still work. A video saying his name still gets through, so this only
helps when the counters show `follow` is the path being marked. That's a
condition in `Wake.check()` behind a setting `follow_needs_name_during_media`, default off. It's in this spec so that a
plan can add it later without a new spec, but it needs the user's go-ahead first.

The Whisper "Hey Nixi." hint (`server.py:3378`) stays. If `wake` / media `on` answers are the ones marked `not_me`,
that is the next thing to change, under its own plan.

## Alternatives rejected

- **Check which device the sound came from.** Nixi already records only one real mic. Speaker sound arrives through the
  air, on that same mic.
- **Muting him while media plays.** It ignores the user exactly when they talk over music.
- **Comparing the mic with what the speakers play** (correlation, or transcribing both). It needs a second synchronised
  recorder, can reject the user talking over playback, and transcribing playback creates text about what's playing.
- **Recognising the user's voice.** Stores a voiceprint. Out of scope unless other people in the room turn out to be the
  problem.
- **The sink monitor's level as the "media playing" signal** (like `Beat`). It needs a recorder running all the time.
  Stream state answers the same question with one call when it's needed.
- **Nixi owning the echo canceller by default.** A second canceller on hosts that already run Meeting AI's costs CPU
  and adds a second source with the same job. It stays an option.
- **Counting in memory only.** A restart loses a week's data, and Nixi restarts on every deploy.

## Risks

- **The echo canceller may eat the user's voice** while the speakers play loudly. That's the open trial (p620). If it
  does, part 2 isn't turned on anywhere, and part 5 becomes the main fix.
- **The page's "mic is completely silent" warning** (peak below 0.0005) may show more often on the cleaned source,
  which reads 0.00004 with media playing and nobody talking. The trial checks clicking him to talk.
- **A browser can keep a stream uncorked while silent.** Chrome closes one after a few seconds of silence, but some
  apps don't. That would count "media on" too often. It affects counts, not answers, until part 5.
- **The counts file is new user data.** It's numbers only, but it is written to disk. Removing it costs nothing.
- **New stop words** could match something the user meant for Nixi. They're full-phrase matches, like the stop words
  today, so "not you" said as part of a longer request doesn't match.
- **Hosts:** p620 and razer. p510 isn't affected: the companion isn't on it.

## Verification

- Unit tests in `tests/` (with `tests/nixi_env.py`, no real `pactl`):
  - A missing `mic_device` leaves the device off every recorder and publishes the tick once. One that exists keeps it.
    No `pactl` keeps it too.
  - `media_playing()` on sample `pactl` JSON: none, one corked, one uncorked `Nixi` (false), one uncorked browser (true),
    bad JSON (unknown).
  - Counters: each path, media and outcome lands in the right cell; a day rolls over; more than 14 days are dropped; the
    file holds no strings except keys and dates.
  - The "that wasn't for you" phrases match full phrases only, in en, nb and pl. During speech they stop him; within 2
    minutes they mark the last phrase; after that they do nothing.
- `nix flake check` in this repo, with the option on and off. The option on produces the conf file with
  `nixi-echo-cancel-source`.
- Unit tests: a `wake` event carries `path` and `media`; an ask with `heard` counts `sent`, and an `[ignore]` reply
  counts `ignored`; `not_me` lands on the last ask's cell. A listed source that sends only zeros publishes the tick
  after 10 s, once. An `open_mic()` error publishes once per new error.
- On p620, by the user, first: "hey Nixi" and "stop" with nothing playing, over a video, over music and during a call.
  All must still work.
- Then a working week with the echo-cancelled source. The user marks every wrong answer they notice, and keeps a rough
  tally of ones they missed marking. The settings line and `GET /api/heard` give the rest. Target: at most one false
  answer a day, counting marks and the tally.
