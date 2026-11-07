---
status: draft
issue: 208
spec: spec/2026-11-07-208-sensed-reactions.md
coders:
  1: coder   # one setting through server, page and tests
  2: agy     # large mechanical edit: copy the in-scope art into the page and add the layer groups
  3: coder   # the reaction check and triggers, plus the new headless test
  4: coder   # boombox, track counter, chip and card
  5: codex   # small, fiddly SVG change where a wrong selector breaks character switching
reviewers:
  - codex    # read-only review of the whole diff against the plan
  - agy      # a second, independent read, mainly of the art and the privacy rules
---

# Plan: reactions from what Nixi already senses

## Decisions carried over from the approved spec

- **In scope**, each silent, played once then settling into today's look:

  | Reaction | Trigger | Art id | Then |
  |---|---|---|---|
  | High load | `SIT.cpu_hot` turns on | `load` | a still thermometer while it lasts |
  | Low memory | `SIT.ram_low` turns on | `memory` | a still box while it lasts |
  | System error | `AMB.sys` grows | `error` | today's `!` cue |
  | Meeting soon | `ambient` event with `alert` and `cal` | `soon` | today's chip line |
  | In a meeting | `sitOn.meeting` turns on | `meeting` | today's tie |
  | Any notification | a row of category `other` is drawn | `notice` | today's row |
  | Needs approval | `attention` with `kind: ask` | `ask` | today's mark, clickable as today |
  | Finished | `attention` with `kind: done` | `done` | today's mark |
  | Opening an app | `quick._open_app` returned its "Opening …" reply (a launch was asked for) | `open` | nothing |
  | Music | `sitOn.music` | `music` | a still boombox instead of the headphones |
  | Rain, snow, wind | `sitOn.rain`, `.snow`, `.windy` turn on | `rain`, `snow`, `wind` | today's weather look |
  | Break | the `break` nudge | `workout` | nothing |

  Not in scope: approved, denied, coding (today's `#code` panel already shows his real work; no decorative
  terminal), email, message, news, sun, watch, water. Messages, email, stroking, welcome back, dragging and the glint
  stay exactly as today.
- **Art** comes from `mockups/206/claude-react.json` in nixi-nixarchy (props, each character's touch, and `defs`),
  only the in-scope ids. Rules: CSS animations of `transform` and `opacity` only, ids start `fx-`, and nothing that
  `mockups/206/build.py`'s `BAD` pattern matches.
- **Layer:** groups `#rxSky` (behind him), `#rxBack` (after `#sitBack`) and `#rxFront` (after `#sitFront`) inside
  `#body`. A reaction sets `r-<id>` and `c-<character>` on `#stage`, fills the groups once, and empties them and
  removes the classes when it ends. Body gestures animate a new `<g class="whole">` that wraps `#body` from outside,
  so every `#body>…` selector keeps matching and Snowflake's pixels don't change at rest. Eyes keep their own
  drawing; a reaction sets mood with `poke`. Props and touches that don't fit a body (`CHARACTERS[].fits`) are left
  out.
- **`rxOk(id)`**: `proactive` and `reactions` both on and the page not hidden; not in `bar`, `hover`, `calm` or `peek`; not fullscreen
  or locked; in a meeting only `meeting` and `ask`, where "in a meeting" is `SIT.meeting` as it arrives, not `sitOn.meeting`
  three seconds later; the same reaction at most once per 10 minutes, except `ask` and
  the music track bop; one at a time, with sustained props (load, memory, the boombox) underneath. It runs again on
  every change it depends on; when it fails, the playing reaction ends, sustained props hide and the music card
  closes. A reaction that can't play is dropped, never queued. Reduced motion shows the prop still. Approval
  requests keep every behaviour they have today.
- **Music:** with reactions on, the boombox replaces the headphones and bops for 4 s on start and on a track change;
  with `look_beat` its speakers pulse. The track comes from the player that is `Playing`: `playerctl -a metadata
  --format '{{playerName}}\t{{status}}\t{{mpris:trackid}}{{title}}'` replaces the status call while reactions are on,
  the first `Playing` line is followed, and a counter `track` goes up when that player's third field changes. Only
  the counter goes in `situation`; no title or artist is sent or kept.
- **Chip and card:** a ♪ chip beside him while the boombox shows; a click opens a `textContent`-only card on the side
  away from a board. First line: what's playing, asked when it opens. Buttons Pause/Play, Next, Quieter, Louder, each
  posting a fixed phrase to `/api/quick` (`pause`, `play`, `next song`, `quieter`, `louder`, `what's playing`); the
  answer's `say` is shown, not spoken; an unhandled answer shows "I couldn't do that." and nothing goes to the agent.
  It closes on Esc, ×, a click elsewhere, 15 s idle, or music stopping, except when its own Pause stopped it: then
  card and chip stay with Play. `sendRegion` covers the chip and card.
- **The red Devil:** `#devBody` and `#devWing` get fixed stops `#e0334f`, `#c81e3a`, `#7a0f24`; `setCharacter` sets
  the ball's fill to `#devBody` for him, `#ballG` for the others; rim `#5c0a1c`. His tail moves out and swishes, a
  small fork `.dFork` stands at his left and fades where a left-side prop stands (load, memory, error, done,
  workout). Previews and the Settings logo show him red.
- **One switch:** `reactions`, default `False`, in the defaults and `NOTIFY_FLAGS`, beside "Proactive" in Settings,
  needs `proactive`, turns on the art, chip, card and track counter only; its help names any signal flags that are
  off. Do Not Disturb stays in #209 (the user's decision), so a new install keeps it off.
- **Media phrases come first on `/api/quick`.** The route answers from quick memory before `quick.handle`
  (`server.py:6593-6596`), so a stored answer for "pause" would say it was handled and control nothing. The six fixed
  phrases (exact match, after trimming and lower-casing) go to `quick.handle` before `recall.answer`. This applies to
  the same words spoken, which is also the right order there. The spec said the phrases add nothing new to trust; this
  keeps that and only reorders two existing lookups for six exact phrases.
- **Correction to the spec:** it says the switch "is set on in `nixos_config`". Nothing in `nixos_config` sets
  companion settings; they live in his `config.json`. It's turned on from Settings on p620 in step 7.

## Where the work happens

nixoarchy-snowflake, new worktree `/mnt/code/Source-home/GitHub/nixi-208-code`, branch `feat/208-sensed-reactions`,
from `origin/main` `3725751`. Line numbers are from that commit. The art is read from nixi-nixarchy's
`/mnt/code/Source-home/GitHub/nixi-208/mockups/206/claude-react.json`.

**Before step 1 (me):** pin the base: `tests/test_notify_fit.py`, `tests/test_character_fit.py` and
`tests/test_accessories_fit.py` pass on `3725751`, and stay unchanged by every step.

## Steps

1. **The `reactions` setting** (coder). `app/server.py:220` add `"reactions": False` to `DEFAULTS`; `:4787` add it to
   `NOTIFY_FLAGS` (the state at `6177` and the save list at `6510` follow from that). `app/static/index.html`: a switch
   row `reactSw` beside the Proactive row, help "Short animations for what he notices. Silent.", disabled while
   Proactive is off, and the id map at `3815` gains `reactSw:'reactions'`. The help line names the signal switches
   that are off among `look_music`, `look_meeting`, `look_weather`, `react_load`, `react_break`.
   → verify: a new case in `tests/test_settings_fit.py` (default off, saves, disabled without proactive) and
   `cd tests && python -m unittest test_settings_fit`.
   Traps: tests import `server` only under `nixi_env`'s throwaway HOME (#176).

2. **Art and layer** (agy). In `app/static/index.html`: a `REACT` object holding `defs`, the in-scope `props` and
   each character's in-scope `touch`, copied verbatim from `claude-react.json`; the `defs` go into the SVG's `<defs>`
   (`index.html:758` area). Add `<g id="rxSky">` before `<g id="body">` content's first child, `<g id="rxBack">`
   right after `#sitBack` (`775`) and `<g id="rxFront">` right after `#sitFront` (`789`). Wrap `<g id="body">…</g>`
   (`773`) in `<g class="whole">…</g>`. No behaviour yet.
   New `tests/test_react_art.py`: every `REACT` string, as the page holds it (parsed, so `\u003c`-style escapes are
   already decoded), passes `build.py`'s `BAD` pattern (copy the regex, cite its source), every `id=` starts `fx-`, only the in-scope ids are present, and the total stays under 40 KB.
   → verify: `cd tests && python -m unittest test_react_art test_character_fit test_accessories_fit`.
   Traps: `.whole` must carry no transform at rest; nothing inside `#body` moves; don't edit the art.

3. **The reaction engine** (coder). In `index.html`: `rxPlay(id)`, `rxEnd()`, `rxOk(id)` and the triggers in the
   decisions table, wired where each signal lands today. `sitOn` triggers (music, meeting, rain, snow, wind) fire at the
   transition in `sitStep` (`index.html:2418-2421`), where `sitOn[k]` turns true three seconds after `SIT` changes,
   not in the situation handler (`2317-2319`), which only updates `SIT`. `SIT.cpu_hot` and `SIT.ram_low` fire at the
   situation handler. Also the `ambient` and `attention` event handlers, the row drawing for category `other`, the nudge handler for `break`, and
   the `/api/quick` reply carrying "Opening"). `rxOk` re-runs from the same handlers, from the situation handler as
   soon as `SIT.meeting` or `SIT.fullscreen` arrives, from every settings change (so turning Proactive or Reactions off
   clears at once), from the class changes on `body` (`bar`, `hover`, `calm`, `peek`), and from `visibilitychange`. Fits are checked as `applyAnchors` does
   (`1302`). `REDUCED` (`1603`) gives a still prop.
   New `tests/react_fit.mjs` and `tests/test_react_fit.py`, headless Chromium with `--disable-gpu`, built like
   `notify_fit`: each in-scope reaction on each of the four characters draws inside the viewBox, doesn't cover the
   eyes' boxes, and leaves the three groups empty at the end; nothing shows with `reactions` off, in `bar`, `hover`,
   `calm`, `peek`, fullscreen or locked, or in a meeting except `meeting` and `ask`; each of a meeting (`SIT.meeting`, before
   `sitOn` follows), fullscreen, the lock, the notch, `hover`, `calm`, `peek`, the page hiding, and Proactive or
   Reactions turned off, arriving mid-reaction and with the music card open, empties the three groups, hides
   sustained props and closes the card, and they come back when it clears; each `sitOn` reaction fires from a real
   situation event through `sitStep`'s three-second wait, driven by the page's own clock; the same reaction
   twice in 10 minutes plays once; reduced motion runs no animations; `setCharacter` to each character and back and
   the notch still work.
   → verify: `cd tests && python -m unittest test_react_fit test_notify_fit test_character_fit`.
   Traps: never a GPU Chrome; no real `hyprctl` or `playerctl`; a reaction must never block or delay an approval.

4. **Music** (coder). Server: in `Ambient.sense` (`server.py:1726-1730`), while `reactions` and `look_music` are on,
   run the `playerctl -a metadata` format above instead of `playerctl -a status`, derive `music` from it, and keep
   `track` as decided; add `track` to `situation()` (`1648`). Page: the headphones' `put` calls (the `SIT_P.hb` and `SIT_P.hf`,
   `index.html:1910`) get `0` while reactions are on and the boombox stands on his right; the bop on start
   and when `track` changes; the chip, the card and the phrases as decided; `sendRegion` (`3921`) includes them.
   Tests: `tests/test_situation.py` gains `track` up on a change of the followed player only, unchanged when a second
   player starts, and stays put with reactions off, with `Ambient.run` mocked and no title in the event. New cases in
   `react_fit`: the boombox replaces the headphones only with reactions on; the chip only with the boombox; the card
   opens only on a click; each button posts its phrase; Esc closes it; after its Pause the card and chip stay with
   Play; an unhandled answer shows the fixed line; fullscreen closes the card. Server: in `/api/quick` (`server.py:6590-6596`), the six
   phrases go to `quick.handle` before `recall.answer`. A server test posts each phrase to the real route with a
   quick-memory answer stored for the same words, and checks the mocked `playerctl`/`wpctl` call ran and the memory
   answer wasn't returned; another phrase with a stored answer still gets the memory answer; `next song` isn't taken by the stage fast path with a board open.
   → verify: `cd tests && python -m unittest test_situation test_react_fit` and the `/api/quick` test.
   Traps: the server tests use `tests/test_speakable.py`'s `_ServerEnv` pattern and mock every desktop and media
   command; never send a title in an event.

5. **The red Devil** (codex). `index.html:758-759`: fixed stops on `#devBody` and `#devWing`; `setCharacter`
   (`1307-1312`) sets the ball's fill as decided; the tail and fork in Devil's `back` art (`1295`), per the mockup;
   the fork fades for the five left-side props. The Look previews and the Settings logo use the same art.
   → verify: `react_fit` cases: Devil's ball, back-art body and wings read red with any body colour; the other three
   follow the body colour; the fork hides for the five props. `test_character_fit` passes unchanged.
   Traps: change no selector of the form `#body>…`.

6. **Review and PR** (me). Full suite from `tests/`. A fresh Opus reviewer on the plan and the diff, then Codex and
   agy read-only. One PR linking the #206 intent, this spec and this plan, with `@codex review`, saying which coder
   did each step. The spec's typo-level correction (nixos_config) is noted in the PR.

7. **Deploy and check** (me). Merge, bump `nixi-companion` in `nixos_config`, CI, merge, post on the agent bus,
   switch p620 from the clean worktree, restart Nixi with the live Hyprland signature, and refresh any changed
   folder plugins. Turn on **Reactions** in his Settings. With the user: a real track change bops once; Pause then
   Play and Next from the card in the native window; a meeting, fullscreen and the lock keep him still and close the
   card; each character shows its touch; the Devil is red with his tail and fork. razer follows nightly.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/nixi-208-code/tests && python -m unittest discover -p 'test_*.py'
```

All pass. `test_character_fit`'s idle check can be flaky under load; rerun it alone before treating it as a failure.

## Rollback

Revert the PR and bump back. `reactions` and `track` are ignored by older code; the setting stays in `config.json`
harmlessly.
