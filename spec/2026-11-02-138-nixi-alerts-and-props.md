---
status: approved
issue: 138
intent: intent/2026-11-02-138-nixi-alerts-and-props.md
---

# Spec: Honest agent alerts, better-looking props, a mic bar and a cartoon per notification

All code is in `olafkfreund/nixoarchy-snowflake`, on new branches from
`origin/main`. Line numbers below are from `origin/main` at the time of
writing. `index.html` means `app/static/index.html`.

## Decisions on the intent's open questions

The intent was approved without answers, so the recommended defaults apply.
Each one is a setting or easy to change later.

| # | Question | Decision |
|---|---|---|
| 1 | Beat pulse source | The real output level, behind a new switch `look_beat` (off by default). With it off, the headphones get a slow bob, not a fake beat. |
| 2 | Feed classification | In Nixi's server. No shell patch. |
| 3 | Speaking mail subjects | A new switch `notify_speak_subject` (off by default), on top of the existing `notify_details` and `notify_speak` gates. |
| 4 | Agent marks | Original stylised marks. No company logos. |
| 5 | Delivery | Two PRs. **PR A:** alerts and agent marks. **PR B:** looks, mic bar, notification props and beat. |

## Design

### PR A — honest agent alerts

**1. The hooks hand over their raw event; the launcher passes it on.**
`bin/nixi-companion attention` gets a `--hook` flag. With it, the inline
Python:
- reads one JSON object, from the last argument if it starts with `{`
  (Codex) or else from stdin (Claude, agy);
- keeps only these keys, each string cut to 300 characters:
  `notification_type`, `message`, `type`, `last-assistant-message`,
  `hook_event_name`, `cwd`, `title`, `prompt_response`, `response`;
- posts them as `"hook": {...}`, next to `from`, `text` and `target`.

Without `--hook`, behaviour is unchanged, so old hook lines still work. It
still never fails, never starts Nixi and exits 0. The page never sees the raw
payload; only the server does.

New hook lines (also written up in `docs/GUIDE.md`, under "Agent alerts"):

```sh
# ~/.claude/settings.json  Notification hook
sh -c 'command -v nixi-companion >/dev/null || exit 0; exec nixi-companion attention --from claude --hook'
# ~/.codex/config.toml  (Codex appends the JSON event as the last argument)
notify = ["sh", "-c", "command -v nixi-companion >/dev/null && nixi-companion attention --from codex --hook \"$1\"; exit 0", "codex-notify"]
# ~/.gemini/config/hooks.json  Stop (and Notification, if agy fires one)
sh -c 'command -v nixi-companion >/dev/null && nixi-companion attention --from agy --hook; echo "{}"'
```

**2. The server decides the kind.** New pure function in `app/server.py`,
next to `attention_accept` (`:987`):
`attention_parse(frm, hook) -> (kind, project, reason) | None`.

- **project:** the basename of `cwd`, kept only if it matches
  `[\w.@+-]{1,40}`; otherwise `""`.
- **reason:** the first non-empty line, whitespace squashed, cut to 90
  characters. Then run it through the same `SECRET_LINE` scrub the inbox uses;
  a hit clears it.

| from | event | kind | reason |
|---|---|---|---|
| claude | `notification_type` is `permission_prompt` or `elicitation_dialog` | `ask` | `message` |
| claude | `notification_type` is `idle_prompt` | `done` | `""` (the message is boilerplate) |
| claude | `notification_type` is `auth_success` | drop (`None`) | — |
| claude | no `notification_type` (older Claude) | `ask` if `message` matches `permission\|approve\|allow\|needs your` (case-insensitive), else `done` | `message` if `ask` |
| codex | `type` is `agent-turn-complete` | `done` | `last-assistant-message` |
| codex | any other `type` containing `approval` | `ask` | `title` or `message` |
| agy | `hook_event_name` is `Notification` | `ask` | `message` |
| agy | anything else (`Stop`, `AfterAgent`, no field) | `done` | `response` / `prompt_response` |
| any | no `hook` given (old hook lines) | `ask`, as today | the joined `text`; the legacy text "is waiting for you" becomes `""` |

`attention_accept(frm, text, now, target, hook=None)`:
- uses `attention_parse` when `hook` is given;
- rate-limits per `(frm, kind)` with the same 30 s window, so a `done` never
  blocks an `ask`;
- publishes `BUS.pub(t="attention", from, name, kind, project, text=reason)`.

The `/api/attention` handler (`:4288`) passes `b.get("hook")` on, and only if
it's a dict of at most 12 keys.

**3. The page treats the two kinds differently.** In the `ev.t==='attention'`
branch (`index.html:1601`). The label is `ev.name` plus ` · ev.project` when
there is a project.

| | `ask` | `done` |
|---|---|---|
| Hidden | desktop notification `"<name> needs you · <project>: <reason>"` | nothing |
| Face | `poke('pleading',4000)`, orange flash (as today) | `poke('t_beam',1400)`, no flash |
| Sound | `sfx('remind')` | `sfx('done')` |
| Chip | `"<name> needs you · <project>: <reason>"`, `act` (click to focus), `attnPend` | `"✓ <name> finished · <project>: <reason>"`, still click to focus, no `attnPend` |
| Speech (not muted, not in a meeting) | `sayAside("<name> needs you in <project>: <reason>")`, reason cut to 60 characters | none |
| Agent mark | the `ask` animation, until focused or 60 s | the `done` animation, 2.5 s |

**4. Agent marks.** A new `#agentMark` group in `#cam`, placed where the cue
dot sits today (`translate(8 -122)`, `index.html:518`), so it never covers the
face. While a mark shows, `renderCue()` hides the plain cue dot. Three flat
marks, each about 26 px, drawn once with `sv()`, one shown at a time:

- **Claude:** a warm-orange (`#d97757`) eight-ray sunburst with rounded rays.
  It turns slowly (6°/s).
- **Codex:** a dark rounded square (`#1d2026`, theme-accent rim) with a white
  `>` and an `_` that blinks at 1 Hz.
- **agy:** a ring in Google-ish blue (`#4c8bf5`), with a small dot that orbits
  it once every 1.6 s.
- **Unknown agent:** the existing `!` cue.

The two kinds animate differently:
- **`ask`:** pops in (spring `G.agent`, from scale 0.6 with overshoot), then
  pulses between 1 and 1.12 at 1.4 Hz, with an orange ring that ripples out
  every 1.4 s.
- **`done`:** pops in, then a green check draws over the mark's lower right in
  300 ms (`stroke-dashoffset`). It fades out after 2.5 s.

`frame()` touches `#agentMark` only while its spring is above 0.002, the same
pattern as `sitSettled`. It is hidden in `body.bar` (the notch keeps
`notchPulse`).

### PR B — looks, mic bar, notification props, beat

**5. Glasses that follow the eyes.**
- `drawSit` builds the lenses as two `<path>` elements and a bridge path; no
  more fixed circles.
- In the eye loop (`index.html:1236`), after `cx`, `cy` and `z` are known for
  each side, and only while `G.sitGl.v > .002`, set each lens to a
  rounded-rectangle outline.
  - **Size:** half-width `EYE.rx*z + 6`, half-height `(EYE.ry*.62)*z`.
  - **Position:** centred at `(cx, cy - 6*z)`, so it frames the upper two
    thirds of the eye, where the pupils mostly look.
  - **Shape:** corner radius 10, tilted with the eye (`-side*9°`), each corner
    projected through the same `P()`.
- **Bridge:** from one lens's inner top to the other's.
- **Temples:** short strokes from each outer edge toward the cups or the rim.
- **Fill:** `#ffffff0d`. Stroke: the theme accent, 2.6 px. A single glint
  stroke on each lens.
- The existing `put(SIT_P.gl, g, 0, -4)` keeps the fade and the scale spring.
- **While he talks:** a bob of `translate(0, -1.5*lvl)`. No lift: the glasses
  are clear, so they stay on, as decided in `fd99a1f`.

**6. Headphones with depth.**
- **Band:** moves to `#sitBack` (`drawSit`: `sv(..., bk)`), so it passes behind
  the snowflake arms. Path `M-84 -8C-88 -92 88 -92 84 -8`, ink stroke 10, with
  the accent inner stroke as today.
- **Cups** (in front): an oval shell (rx 15, ry 26) rotated `s*8°` to follow
  the hex taper, an inner cushion in the accent colour, and a short yoke to
  the band.
- **Cup position:** x is `s*max(88, EYE_HALFW*G.sz.x + EYE.cx + 22)`. That
  keeps them clear of the outer eye edge at any eye size, which fixes the
  screenshot-1 overlap.
- **Per frame**, while `G.sitMusic.v > .002`:
  - **Parallax:** the left and right cups shift by `-s*lx*.6`, so turning
    tucks one cup in and brings the other out.
  - **Sway:** the whole set rocks by `G.sitW.x*.25`.
  - **Talking or listening:** the left cup rotates out by `12*L`, where
    `L = G.sitLift`, as if freeing an ear.
  - **Pulse:** `k = beat` (§8) when `look_beat` is on and a level is arriving,
    otherwise `k = .5+.5*sin(t*2.2)` at a quarter of the amplitude (a slow
    bob). Cups scale by `1 + .07*k` about their own centres, the band lifts by
    `-1.5*k`, and the head nods by `G.jelly`, `+.015*k`.

**7. Mic level bar.**
- A new `#micBars` group in `#cam` (so it doesn't tilt with the body), centred
  at `(0, 130)`, under the shadow (`cy 108`) and below the tie (which ends at
  `y 118`). Five rounded vertical `<rect>` elements, 5 px wide, 4 px apart.
- **Height:** `2 + 18*micLvl*w[i]` with `w = [.5,.8,1,.8,.5]`, plus
  `.12*micLvl*sin(t*17 + i*1.9)` so a held vowel still flickers.
- `micLvl` already has a fast attack (`approach(..., 14)`, `index.html:1182`).
  The bars add a slower fall: `bar = max(target, bar - dt*4)`.
- **Visibility:** spring `G.mic` toward `rec && !rec.stopping || follow`.
  Opacity follows the spring; nothing is written while it is at 0.
- **Colours:** the centre bar `var(--hot)`, the inner pair `var(--acc)`, the
  outer pair `var(--acc)` at 70 % opacity.
- **Hearing ring:** while the bars show, its listening gain drops from 1.1 to
  0.7 (`index.html:1196`), so the two don't compete.
- **Hidden** in `body.bar` (the notch pill already swells with `--lv`) and in
  `body.calm`.

**8. Beat level (the `look_beat` switch).**
- New `class Beat` in `app/server.py`, beside `Listen`. It runs only while
  `Ambient.music` is true, `look_beat` is on, the page is subscribed,
  `not Ambient.meeting` and `not Wake.asleep`.
- **Capture:** it starts
  `parecord -d @DEFAULT_MONITOR@ --raw --format=s16le --rate=2000 --channels=1 --latency-msec=50`.
  Resampling down to 2 kHz drops the highs, so what's left leans toward bass
  and kick. Without `parecord`, it uses
  `pw-record --target @DEFAULT_MONITOR@ --rate 2000 --channels 1`. With
  neither, the feature reports itself unavailable.
- **Pulse:** every 100 samples (50 ms) it computes the RMS of the block. It
  keeps a slow average (`avg += (rms-avg)*.05`) and publishes
  `BUS.pub(t="beat", v=round(clamp((rms/avg - 1)/.8, 0, 1), 2))`, so it pulses
  on peaks above the song's own loudness, about 20 events/s.
- **Privacy:** samples never leave the function: no buffer is kept, nothing is
  logged or written. The capture stops within 1 s of any gate going false.
- **Page:** `beat = max(ev.v, beat - dt*8)` (a fast release), used in §6.
- **Settings:** a row under "Headphones for music": "Pulse to the beat —
  listens to what's playing (not your mic) while music plays."

**9. Notification props.** Three groups in `drawSit`, front layer, each with
its own spring. Only one is active at a time, chosen in `notifyDrain()`
(`index.html:1720`) by `ev.category`. The readable text stays in the existing
caption (`notifyShow`). Everything uses `put()` and is skipped while the
spring is at 0.

- **Mail:** an envelope (44×28, `rx` 3, white with an accent stroke) at
  `(70, 14)`, beside his right cheek.
  - **Timing:** it flies in from `(120,-20)`, tilted 18°, over 300 ms
    (spring). At 250 ms the flap folds open over 200 ms (scale y 1→−1 about the
    top edge). At 350 ms a letter with two grey lines slides up 14 px over
    300 ms. At 3.2 s it all springs out.
  - **Face:** `poke('reading',2600)`, and the gaze is aimed at the letter
    (`talk.away` toward it for 1.5 s).
  - **Speech:** if the category is in `notify_speak` and not in a meeting,
    locked or muted, he says the subject when `notify_details`,
    `notify_speak_subject` and a subject are all present; otherwise "New mail
    from <app>".
- **Chat:** a speech bubble (a rounded rectangle 72×42 with a tail pointing at
  him), white with a green `#7fd6ae` stroke, at `(-74, -60)`.
  - **Motion:** pops in with overshoot over 200 ms. Three typing dots bounce
    in sequence (`sin(t*9-i*1.1)*3`).
  - **Bursts:** the existing 3-second burst count (`notifyBurst.n`) shows as a
    pink badge `×N` on the bubble's corner, and each new message re-kicks the
    pop.
  - **Timing:** holds for 2.8 s.
  - **Caption:** `"💬 Slack · <summary>"`, as today. When `notify_details` is
    on, the first 6 words of `body` are added.
- **Feed** (category `video`): a small retro TV (44×32, dark with a pink
  `#e0569a` rim) with antennae that wobble on the existing `G.wob` sway and a
  pink play triangle, at `(74, -52)`.
  - **Motion:** hops in with `G.jelly.kick(-.4)` over 250 ms, and a few pink
    burst lines. The screen flickers once (opacity 1→0.6→1 over 120 ms).
  - **Timing:** holds for 2.4 s.

**10. The feed category.** There is no rename, so saved `notify_speak` lists
keep working. In `Inbox.rows()` (`server.py:1441`), a row the shell marked
`other` is re-labelled `video` when `source` (the site) or `app` matches:
`youtube.com|youtu.be|twitch.tv|reddit.com|bsky.app|mastodon|x.com|twitter.com|freetube|grayjay|tuba|tokodon`.
The settings and the `NOTE` table label `video` as "Feeds" and "New post".

**11. Settings.**
- Two new booleans, `look_beat` and `notify_speak_subject`, are added to
  `CFG` defaults (`False`), `NOTIFY_FLAGS` / the bool allow-list (`:4161`) and
  the settings page.
- They sit next to their parents: "Headphones for music" and "Show details".
  Each is disabled while its parent is off.

## Alternatives rejected

- **A fake ~130 BPM beat** (agy's suggestion): it visibly drifts against the
  real song. The off-switch fallback is a slow bob that doesn't claim to be a
  beat.
- **Text drawn on the letter or bubble:** unreadable at Nixi's size, and it
  repeats the caption.
- **Stacked chat bubbles:** clutter and extra DOM work during bursts.
- **Classifying feeds in the omarchy-shell delegate patch:** needs a second
  repo and a rebuild of the shell. The server already sees `app` and `source`.
- **A new `feed` category name:** breaks saved `notify_speak` lists and the
  settings chips. Re-labelling `video` gets the same result.
- **Parsing hook payloads in each hook line with `jq`:** fragile quoting in
  three file formats. One parser in the server is testable.
- **Copies of the Anthropic, OpenAI and Google logos:** trademark use. Original
  marks hint at each tool instead.
- **A waveform for the mic:** there's one level value, not samples, so any
  waveform would be fake.

## Risks

- **The hook payload fields are unverified.** The parser treats each field as
  optional and falls back as described. Plan step 1 captures one real payload
  per agent before the parser is finished.
- **Codex has no hook for "needs approval".** With only
  `agent-turn-complete`, Codex alerts become `done`. That is more honest than
  today, but Codex approval prompts give no alert at all. This is stated in
  the GUIDE.
- **The monitor capture hears every sound on the desktop.** It is gated off in
  meetings, off by default, never stored, and stops within 1 s. A call outside
  Meeting Mode while music plays is still heard (as levels only).
- **CPU:**
  - The beat adds one `parecord` at 2 kHz plus about 20 small loops/s.
  - Each new prop adds per-frame attribute writes only while it is visible.
  - The glasses now write 3 path `d` attributes per frame while worn: the same
    order of work as the eyes.
- **Layout:**
  - The mic bars at `y 130` must stay inside the `-150..150` viewBox, and they
    could meet the caption below. Checked live in both window sizes.
  - The chat bubble at `(-74,-60)` may meet a top-zone hat, but hats only
    appear with no skin and the bubble lasts 2.8 s. Accepted.
- **Only this machine's hooks are updated.** Other hosts keep the old lines,
  which still work as before.

## Verification

- **Unit tests**, run with `python -m pytest tests/`:
  - new `tests/test_attention.py`: every row of the parse table, the
    project/reason scrub, separate rate limits for `ask` and `done`, the
    legacy text call, and a malformed `hook`;
  - `tests/test_inbox.py`: a Reddit or YouTube row labelled `other` becomes
    `video`, and a `mail` row is unchanged;
  - a test that the `Beat` gate is false in a meeting, while asleep and with
    the switch off.
- **Launcher:**
  - `echo '{"notification_type":"permission_prompt","message":"Claude needs your permission to use Bash","cwd":"/x/snowflake"}' | nixi-companion attention --from claude --hook`
    exits 0, and Nixi shows the `ask` alert with the Claude mark and speaks
    "Claude needs you in snowflake: …".
  - The Codex form, with JSON as the argument, shows `done` with the Codex
    mark, the check, and no speech.
  - With Nixi not running, both exit 0 within 1 s.
- **Live screenshots** (for the PR), one each:
  - glasses at idle, looking left, and with big eyes;
  - headphones idle and with `look_beat` on;
  - the mic bars while talking;
  - mail (from `notify-send -a Thunderbird "Invoice 42" "…"`), chat
    (`-a Slack`), and feed (`-a firefox` from YouTube);
  - each agent mark, in `ask` and in `done`.
- **CPU:** `top -p <server pid>` with music playing and `look_beat` on. The
  server should add at most 3 % of one core over its idle level.
- **Notch mode:** `body.bar` shows none of the new props.
