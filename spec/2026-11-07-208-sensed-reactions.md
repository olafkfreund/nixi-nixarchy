---
status: draft
issue: 208
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: reactions from what Nixi already senses

Slice 2 of the approved #206 intent (open question 8.2). All code is in `olafkfreund/nixoarchy-snowflake`. Line numbers
are from `origin/main` at `8f2275e`, so re-find them by name. The art is Claude's set, `mockups/206/claude-react.json`,
as the user chose on 2026-11-06.

## What happens today

- **Signals reach the page as `situation`, `ambient`, `nudge`, `attention` and `notify` events.** `Ambient.situation()`
  sends `meeting, music, cpu_hot, ram_low, fullscreen, locked, coding, weather, day, cold, windy, lean, heavy, night,
  party` (`server.py:1648`), and the page copies them into `SIT` (`index.html:2316`). Most need `proactive` and their
  own flag, all off by default (`server.py:219-223`).
- **Looks** go on after 3 s of signal and off after 8 s without it (`sitStep`, `index.html:2417-2420`). They're drawn
  by the frame loop with `setAttribute`, not CSS (`index.html:1897-1911`): tie for a meeting, headphones for music,
  shades for fullscreen, glasses while the user codes, beanie, scarf, nightcap and party hat.
- **What each signal does now:**
  - High load: a squint and sweat while idle (`index.html:1727`, `:1894`), and a `cpu` nudge once (`server.py:2076`).
  - Low memory: a `ram` nudge once (`server.py:2074`), shown as `t_unsure` (`index.html:2402`).
  - Failed user units (`systemctl --user --failed`, `server.py:1481`, every 15 min): the `!` cue, and `confused`
    when the list grows (`index.html:2318`).
  - A calendar item 10 minutes away: a 📅 line in the chip, never spoken (`server.py:1621-1630`, `index.html:2321`).
  - In a meeting: Meeting Mode's flag file, or a calendar item at most 60 s away (`server.py:1659`).
  - An agent asks or finishes: the agent's mark, a poke and a chip line (`index.html:2306-2313`).
  - His own turn: moods such as `editing` and `running`, and the work ring.
  - Music: `playerctl -a status` every 5 s says "Playing" (`server.py:1725-1729`). Nothing tells one track from
    the next.
  - Rain, snow, wind and cold: the weather look and the sky. Snow pokes `excited` once (`index.html:2317`).
  - The break: one `break` nudge after 60 minutes, which plays the stretch fidget (`server.py:2071`, `index.html:2400`).
  - Opening an app by voice: `quick._open_app` says "Opening X." (`quick.py:268-281`).
  - Messages and mail: the bubble with ×N, the caption row and the envelope (`index.html:2440-2480`).
- **Media controls exist only by voice:** `quick._media` and `quick._volume` (`quick.py:60-107`), reached through
  `/api/quick` with phrases such as "pause", "next song" and "quieter" (`quick.py:379-405`, `server.py:6382`).
- **The Devil** follows the body colour: his ball uses the shared `#ballG`, whose stops read `--body0..2` from the
  root (`index.html:147`, `:749`, `:1121`). His tail is in the back layer, about x 44..87 (`index.html:1295`), so the
  ball (x ±86) hides most of it.
- **Nothing checks Do Not Disturb** (no `dnd` anywhere in `server.py` or `index.html`).
- `tests/notify_fit.mjs` already pins the message and mail path (#215), and `tests/test_character_fit.py` pins
  Snowflake's pixels against `origin/main`.

## Design

### 1. What this slice covers

Only reactions whose signal exists today. Each plays a short piece of Claude's art, then settles into the look that
exists. The art is silent: no reaction adds a sound or a spoken word.

| Reaction | Trigger, today's signal | Plays | Then |
|---|---|---|---|
| High load | `SIT.cpu_hot` turns on | once, 2.5 s | a still thermometer while it lasts; today's squint and sweat stay |
| Low memory | `SIT.ram_low` turns on | once | a still box while it lasts |
| System error | `AMB.sys` grows | once | today's `!` cue |
| Meeting soon | an `ambient` event with `alert` and `cal` | the alarm clock rings once | today's chip line |
| In a meeting | `sitOn.meeting` turns on | the "quiet" gesture once | today's tie |
| Any notification | a row of category `other` is drawn | the bell once | today's row |
| Needs approval | `attention` with `kind: ask` | the sign bounces once | today's mark, clickable as today |
| Finished | `attention` with `kind: done` | the trophy once | today's mark |
| Opening an app | `quick._open_app` asked for a launch (it returned its "Opening …" reply; it can't know the app opened) | the window pops once | nothing |
| Music | `sitOn.music` | the boombox bops for 4 s on start and on a track change | a still boombox, which replaces the headphones (§5) |
| Rain, snow, wind | `sitOn.rain`, `.snow`, `.windy` turn on | once | today's weather look |
| Break | the `break` nudge | the workout headband with today's stretch | nothing |

**Unchanged, as the intent requires:** new message (bubble, ×N, row) and new email (the envelope), stroking, the
welcome back, dragging across screens and the NixOS glint. They already react, and Claude's set has no art for the
last four.

**Left to later slices**, because the signal doesn't exist yet: approved and denied (slice 5); another machine online,
storm, hot and sunny, video, news, a workout schedule, drinking water, snooze and joining a meeting from the chip
(slice 3); another agent coding (needs a new signal); a git commit (not verified); meeting's over (no art in the set;
see Open questions, Meeting.s over).

### 2. One reaction layer

- **Art.** A `REACT` table in `index.html` holds the in-scope props and each character's touch from
  `claude-react.json`, about 36 KB. Rules from the brief stay: CSS animations of `transform` and `opacity` only, ids
  starting `fx-`, and no `<script>`, `on…=`, `<image>`, `<foreignObject>`, `<use>`, `<style>`, URLs or `filter`. A
  test runs `mockups/206/build.py`'s `BAD` pattern over every string, because the art came from a model.
- **Where it's drawn.** New groups `#rxSky` (behind him, fixed), `#rxBack` (after `#sitBack`) and `#rxFront` (after
  `#sitFront`) inside `#body`. A reaction sets `r-<id>` and `c-<character>` on `#stage`, and fills the groups once.
  When it ends, the groups are emptied and the classes go, so nothing animates at rest.
- **Body gestures.** The art's hop, droop and lean animate `.whole`. `#body` gets its transform from the frame loop
  every frame (`index.html:1760`), and a CSS transform on the same element would replace it. So a new `<g class="whole">`
  wraps `#body` itself, as its parent. `#body`'s children stay where they are, so every `#body>…` selector keeps
  matching: `setCharacter` (`index.html:1309-1312`), the notch and snap CSS (`index.html:40`, `84-97`) and the
  measures of `#body > .ball` (`index.html:2871`, `4066`). With no reaction `.whole` has no transform, so Snowflake's pixels don't
  change.
- **Eyes.** The page keeps drawing them. A reaction sets its mood with today's `poke(mood, ms)`.
- **Fits.** A prop or touch that doesn't fit a body, by `CHARACTERS[].fits`, is left out, as `applyAnchors` does for
  looks (`index.html:1302`). Sunglasses keep meaning fullscreen: no in-scope reaction uses them.

### 3. When a reaction may play

One check, `rxOk(id)`, before anything is drawn:

- the new `reactions` setting is on (§7), and the page isn't hidden;
- not in the notch, the hover orb, calm mode or peek: `body.bar`, `.hover`, `.calm` and `.peek` hide the layer, as
  they hide `#mailPop` (`index.html:177`);
- not while fullscreen or locked, and in a meeting only "in a meeting" and "needs approval";
- the same reaction at most once every 10 minutes, except "needs approval" and music's track bop;
- one at a time: a new one ends the one playing. A sustained prop (load, memory, the boombox) stays underneath.

The check also runs on every change it depends on, not only at the start: a situation event, a meeting starting,
fullscreen, the lock, `body.bar`, `.hover`, `.calm`, `.peek` and the page hiding. When it fails while something
shows, the playing reaction ends, the sustained props hide until it passes again, and the music card closes, so a
track title doesn't stay on a shared screen.

A reaction that can't play is dropped, not queued. The sustained ones show as soon as the check passes, because their
signal is still on. With reduced motion (`REDUCED`, `index.html:1603`) a reaction shows its prop still, with no
keyframes. Approval requests keep every behaviour they have today, whatever this check says.

### 4. No new coding terminal

The intent's "coding terminal" already exists: `#code` (`index.html:692`) opens beside him while his own turn runs
tools and shows the real commands, edits and output (`index.html:4057-4060`, `4150-4162`). A second, decorative
terminal with made-up code would show next to it, at the same time. This slice adds none and leaves `#code` as it
is. What `#code` shows on a shared screen is today's behaviour and not changed here.

### 5. The boombox and its controls

- **The boombox replaces the headphones** while music plays and reactions are on. The headphones' `put` calls
  (`index.html:1910`, `:1918-1922`) get `0` instead of `b`, and the boombox stands on his right. With reactions off, the
  headphones stay as today. Turning off "Music look" removes both.
- **It bops** for 4 s when music starts and when the track changes, then stands still. With `look_beat` on, its
  speakers pulse with the beat, as the headphone cups do today.
- **The track change** needs a new signal. Music is "any player says Playing" (`playerctl -a status`,
  `server.py:1729`), so the track must come from one of those players, not playerctl's default one. While music plays
  and reactions are on, `Ambient.sense` runs `playerctl -a metadata --format
  '{{playerName}}\t{{status}}\t{{mpris:trackid}}{{title}}'` instead of the status call, in the same 5 s step, and
  takes music from it. The first `Playing` line's player is followed; the counter, `track`, goes up when that
  player's third field changes, and not when a different player starts. Only the counter goes in `situation`. No title or artist is sent or kept.
- **The chip.** While the boombox shows, a small round ♪ button sits beside him. A click opens a card. Nothing opens
  by itself.
- **The card** is a small HTML panel beside him, on the side away from an open board, built with `textContent` only.
  Its first line is what's playing, asked for when the card opens. Its buttons are Pause or Play, Next, Quieter and
  Louder. It closes on Esc, ×, a click elsewhere, or 15 s without use. Music stopping closes it too, unless the card's
  own Pause stopped it: then the card and the chip stay, showing Play, until it closes by one of the other rules. So
  Play stays reachable after Pause. `sendRegion` adds the chip
  and the card while they show, so the native window lets clicks through.
- **Each button posts a fixed phrase to `/api/quick`**, the route voice commands already use: `pause`, `play`,
  `next song`, `quieter`, `louder` and `what's playing`. The page never sends anything else, and the card shows the
  answer's `say` as text, without speaking. If the answer isn't `handled`, the card says "I couldn't do that." and
  nothing goes to the agent. So no new route, and no new way to run a command.

### 6. The red Devil

- His art already has its own gradients, `#devBody` and `#devWing` (`index.html:758-759`), for the body drawn in his
  back art and for his wings. Their stops use the theme classes (`b0`, `b1`, `b2`), so today they follow the body
  colour. They get fixed red stops instead (`#e0334f`, `#c81e3a`, `#7a0f24`), and `setCharacter` sets the ball's fill to
  `#devBody` for him and back to `#ballG` for the others. His rim is `#5c0a1c`. So the ball, the body in his back art
  and the wings are all red, whatever the body colour.
- His tail moves out, so its tip clears the ball's edge, and it swishes as in the mockup.
- A small fork stands at his left side, in his back art, as `.dFork`. Where a reaction's prop stands on his left (load,
  memory, error, done and workout), the fork fades out, as the mockup's rule does.
- The Look panel's previews and the Settings logo show him red too. The other three characters don't change.

### 7. One switch

A new setting, `reactions`, default `False`, added to `CFG`'s defaults (`server.py:219`) and `NOTIFY_FLAGS`
(`server.py:4587`), with one switch in Settings next to "Proactive". It needs `proactive`. It turns on the art, the
chip and the card, and the track counter. Each signal still needs its own flag, as today, and the switch's help line
names any that are off. On the user's machines it's set on in `nixos_config`. A new install keeps it off.

### 8. Nothing else changes

The bubble, the row and the envelope keep their art, timing, sound and text. Moods, fidgets, nudges, looks and their
settings stay. Approvals, the agent marks and the chip's click to jump to an agent stay. No sound or speech is added.

## Alternatives rejected

- **Driving the art from the frame loop, like today's looks.** Every prop would need its own JS for the motion Claude
  drew in CSS. CSS on a wrapper keeps the art as drawn and costs nothing at rest.
- **Animating `#body` directly.** A CSS transform replaces the frame loop's transform attribute, so he'd jump.
- **A separate `reactions.js` file.** The server would serve it (`server.py:6096`), but the page is one file today,
  and the art is data the page needs at once.
- **A new `/api/media` route.** `/api/quick` already runs these commands with the window's token, with the same
  checks, and fixed phrases add nothing new to trust.
- **Sending the track title in `situation`.** The bop needs only "it changed". The title is asked for when the card
  opens, which is what the user asked to see.
- **Chips for messages, mail, the agents and the meeting now.** The row, the envelope and the agent mark are already
  clickable, and hearing, replying, approving, snoozing and joining belong to later slices. One chip now, for music, is
  the pattern the later ones reuse.
- **One switch that turns on every signal flag.** It would change settings people already chose, which the intent
  rules out.
- **Queueing a reaction that couldn't play.** He'd act out old news after a meeting or a fullscreen film.

## Risks

- **Do Not Disturb isn't checked.** Reactions are silent, but they still move. Slice 3 adds the check. Until then the
  switch stays off for a new install (decided: see Decided).
- **A busy page.** At most one short reaction plus the sustained props, each animating only `transform` and `opacity`,
  and nothing at rest. The native window already repaints every frame (`index.html:1952-1953`), so CSS animation adds no
  new repaint regime. Checked by hand on p620 and razer.
- **Model-made art.** The `BAD` check runs on every string, and the layer is filled once per reaction, not per frame.
- **Snowflake's pixels.** The `.whole` wrapper must be an identity at rest. `test_character_fit.py` catches a change.
- **The boombox covers something.** It stands where the right headphone cup was, inside today's window. A prop that
  needs more room than the window has is clipped, so the test checks every prop's box against the viewBox.
- **`/api/quick` phrases.** "next" alone can mean a board's next page, so the card uses "next song". A memory answer
  could in theory catch a phrase first (`recall.answer`, `server.py:6387`). The test pins every phrase to its handler.
- **Another `playerctl` call.** One more fork every 5 s, only while music plays and reactions are on. A player with no
  `trackid` or title gives the same empty output each time, so it never bops on its own.
- **The Devil's look changes** for anyone who uses him today. The intent asks for that.

## Verification

- **Pinned first:** `tests/notify_fit.mjs`, `tests/test_character_fit.py` (Snowflake's pixels) and
  `tests/test_accessories_fit.py` pass on `8f2275e` and stay unchanged after.
- **New `tests/react_fit.mjs` with `tests/test_react_fit.py`**, headless Chromium with the GPU off, as `notify_fit` does:
  - each in-scope reaction draws on each of the four characters, within the viewBox, without covering the eyes'
    boxes, and leaves `#rxSky`, `#rxBack` and `#rxFront` empty when it ends;
  - nothing shows with `reactions` off, in `bar`, `hover`, `calm` or `peek`, while fullscreen or locked, or in a meeting
    except the two allowed;
  - the same reaction twice in 10 minutes plays once; reduced motion has no running animations;
  - the boombox replaces the headphones with reactions on, and the headphones stay with it off;
  - the chip appears only with the boombox; the card opens only on a click; each button posts its fixed phrase; Esc
    closes it; an unhandled answer says "I couldn't do that.";
  - a meeting, fullscreen, the lock or the notch arriving while a reaction plays ends it, hides the boombox and closes
    the card; they come back when the check passes again;
  - after the card's Pause, the card and chip stay with Play, and Play posts `play`;
  - `setCharacter` to each character and back, and the notch, still work with `.whole` in place;
  - the Devil's ball, back-art body and wings are red with any body colour; the other three characters' fills still follow it; the fork hides for
    the five left-side props.
- **Art check:** a Python test runs the `BAD` pattern over every `REACT` string, and checks ids start with `fx-`.
- **`tests/test_situation.py`:** `track` goes up only when the followed player's track changes, not when a second
  player starts, stays put with reactions off, and no title is in the event.
- **`/api/quick` tests:** each of the six phrases, posted to the real route, reaches `quick.handle` with the expected
  `playerctl` or `wpctl` call (mocked), also with a quick-memory answer stored for the same words (`recall.answer` runs
  first, `server.py:6387`); and `next song` isn't taken by the stage fast path while a board is open.
- **`tests/test_settings*`:** `reactions` defaults to `False`, saves, and is in `NOTIFY_FLAGS`.
- **By hand on p620, with the user:** a real track change bops once; Pause and Next work from the card in the native
  window; a meeting, fullscreen and the lock keep him still; the Devil is red and his tail shows.

## Decided (2026-11-07, by the user)

- **Do Not Disturb** stays in slice 3 (#209), as split. Until it lands, `reactions` stays off for a new install.
- **The break** plays the workout headband with today's stretch. Drinking water waits for its own schedule in #209.

## Open questions

1. **The issue says "the words in the message bubble".** The approved intent dropped that on 2026-11-06, and this spec
   follows the intent. Recommended: update the issue's text.
2. **The switch's reach.** Recommended: `reactions` turns on only the art, and its help names the signal switches that
   are off. Or it turns them all on once, the first time.
3. **Meeting's over.** Claude's set has no art for it. Recommended: leave it until slice 3, which adds meetings from the
   calendar.
4. Minor, outside this slice: `#workW` already uses `filter="url(#glow)"` (`index.html:770`), so the no-filter rule
   holds for new art only.

## Reviews (2026-11-07)

Their findings don't approve anything. Codex reported `gpt-6-sol`; agy's JSON reports no model. Both read the
draft, the intent and the companion at `8f2275e`. Each finding was checked against the code.

**Confirmed and applied (Codex):**

- Wrapping `#body`'s children in `.whole` would break every `#body>…` selector (`index.html:1309-1312`, `84`,
  `2871`, `4066`). `.whole` now wraps `#body` itself.
- Pause from the card hid the chip and the card on the next 5 s check (`server.py:1729`), so Play was unreachable.
  The card's own Pause now keeps both.
- `rxOk` ran only at a reaction's start, so a meeting, fullscreen or the lock arriving later left props and the
  card (with a track title) on screen. It now runs on every change it depends on.
- The Devil's red didn't reach the body in his back art or his wings: `#devBody` and `#devWing` use theme stops
  (`index.html:758-759`). Those gradients now get the fixed reds.
- The decorative coding terminal duplicated `#code`, which already shows his real work during a turn
  (`index.html:4057-4060`). Dropped from this slice.
- `playerctl metadata` without `-a` could describe a different player than the one playing. The track now comes
  from the `Playing` player.
- `_open_app` returns "Opening …" without knowing the app opened (`quick.py:268-281`). The trigger is now "a launch
  was asked for".
- The phrase tests now post to the real `/api/quick` route, where `recall.answer` runs first.

**Refuted or not applicable (agy):**

- Do Not Disturb unchecked: true, and the user decided it stays in slice 3.
- That `rxOk` and the per-signal checks aren't in the code: they're what this spec proposes.
- That the headband never hides after a break: every reaction empties its groups when it ends (§2).
- That `quick._open_app`'s "Opening X." is never spoken: today's behaviour, not changed here.

**Agreed:** Codex's answers to the open questions match the recommendations.

**Not verified:** the hand checks on p620 and razer, and what each music player reports over MPRIS.

## Rollback

Revert the PR. `reactions` defaults to `False`, so a saved `true` is ignored once the code is gone, and no file or
state is added.
