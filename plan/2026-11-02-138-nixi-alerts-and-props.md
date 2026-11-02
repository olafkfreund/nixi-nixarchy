---
status: approved
issue: 138
spec: spec/2026-11-02-138-nixi-alerts-and-props.md
reviewers:     # the user asked for Codex and agy on this work (2026-11-02); read-only, after each PR's Opus review
  - codex
  - agy
---

# Plan: Honest agent alerts, better-looking props, a mic bar and a cartoon per notification

## Approved decisions (from the spec; this plan does not need it)

- **Repo:** all code is in `olafkfreund/nixoarchy-snowflake` (local
  `/mnt/code/Source-home/GitHub/nixoarchy-snowflake`). Line numbers are from
  `origin/main` as of 2026-11-02. The local checkout is on `fix/94-speak-theme`
  and 29 commits behind: **work in a git worktree from `origin/main`**, never on
  that branch.
- **Two PRs:**
  - **PR A** (`feat/138-agent-alerts`): steps A1–A7.
  - **PR B** (`feat/138-props`, from `origin/main` after PR A merges): steps
    B1–B8.
- **New settings,** both `False` by default:
  - `look_beat`: "Pulse to the beat", the real output level;
  - `notify_speak_subject`: speaks mail subjects.
- **Agent alert kinds:** `ask` (needs your input) and `done` (finished). Each
  carries a `project` (the basename of `cwd`) and a `reason` (one line,
  ≤ 90 characters, put through the `SECRET_LINE` scrub).
- **Feeds** are the existing `video` category, widened in Nixi's server.
  There is no rename and no shell patch. The UI calls it "Feeds".
- **Agent marks** are original artwork, not company logos:
  - Claude: an orange `#d97757` eight-ray sunburst;
  - Codex: a dark rounded square with `>_`;
  - agy: a blue `#4c8bf5` ring with an orbiting dot.
- **Beat:** `parecord` on `@DEFAULT_MONITOR@` at 2 kHz mono, published only as
  a 0–1 level. It runs only while music is on, `look_beat` is on, the page is
  subscribed, he's not in a meeting and not asleep.

## Repo traps (apply to every step)

- `index.html` is one big file that repaints every frame. A new prop writes
  attributes only while its spring is above `.002` (copy the `sitSettled`
  pattern, `index.html:1336`). No SVG `filter` on new props.
- `body.bar` (the notch) must show none of the new props: add them to the hide
  list at `index.html:74`.
- `#face` must not get a transform (the notch reuses it; see
  `index.html:34`). Put new eye-locked things in `#sitFront` / `#sitBack`.
- Notification and hook text is never logged, written to disk or sent to the
  agent (`Inbox` docstring, `server.py:1368`).
- `attention` in `bin/nixi-companion` must always exit 0 and never start
  Nixi: hooks must not break an agent.
- Tests import the server with `_ServerEnv` from `tests/test_speakable.py`.
  Run them with `python -m pytest tests/ -q` from the repo root.
  `tests/test_no_herdr_writes.py` must stay green.

## Steps — PR A: honest agent alerts

**A1. Capture one real hook payload per agent** → verify by three JSON files
existing.
- Create the worktree:
  `git -C /mnt/code/Source-home/GitHub/nixoarchy-snowflake worktree add ../snowflake-138a -b feat/138-agent-alerts origin/main`.
- Temporarily add a capture command **next to** (not instead of) each nixi
  hook, writing to `$XDG_RUNTIME_DIR/nixi-hook-<agent>.json`:
  - Claude: a second `Notification` entry, `cat > …`;
  - Codex: `notify` wrapped as `sh -c 'printf %s "$1" > …; <existing>' codex-notify`;
  - agy: a second `Stop` entry, `cat > …; echo "{}"`.
- Trigger one event each. For Claude, a permission prompt and an idle notice.
- Copy them, with the message text replaced by neutral words, to
  `tests/fixtures/hooks/{claude-permission,claude-idle,codex,agy}.json`.
- Remove the capture entries.
- If a field name differs from the spec table, use the real name, and record
  the deviation in this plan in the same commit.

Traps: the files are in the user's home folder. Back each one up first
(`cp f f.bak-138`) and restore it from the backup if anything goes wrong.

**A2. `app/server.py:944-998`: parse and kind-aware rate limit** → verify by
A4.
- Add `attention_parse(frm, hook)`, returning `(kind, project, reason)` or
  `None`.
  - **project:** `os.path.basename(str(cwd).rstrip("/"))`, kept if it matches
    `[\w.@+-]{1,40}`, else `""`.
  - **reason:** the first non-empty line, `\s+` squashed, `[:90]`; cleared if
    `SECRET_LINE.search` hits. `SECRET_LINE` is defined at `server.py:3402`
    and resolved at call time, so it's safe to use here.

| from | event | kind | reason |
|---|---|---|---|
| claude | `notification_type` in (`permission_prompt`, `elicitation_dialog`) | `ask` | `message` |
| claude | `notification_type == "idle_prompt"` | `done` | `""` |
| claude | `notification_type == "auth_success"` | `None` | — |
| claude | no `notification_type` | `ask` if `message` matches `(?i)permission\|approve\|allow\|needs your`, else `done` | `message` if `ask` |
| codex | `type == "agent-turn-complete"` | `done` | `last-assistant-message` |
| codex | another `type` containing `approval` | `ask` | `title` or `message` |
| agy | `hook_event_name == "Notification"` | `ask` | `message` |
| agy | `fullyIdle` is `false` (a sub-run ended, the agent is still working) | `None` | — |
| agy | anything else (`Stop`) | `done` | `error` if non-empty, else `""` |

**Deviation (A1, 2026-11-02).** The real agy `Stop` payload (agy CLI,
`gemini-4-argon-medium`) has none of `cwd`, `hook_event_name`, `response` or
`prompt_response`. It carries `workspacePaths` (a list), `terminationReason`,
`error`, `fullyIdle`, `lastUserInput`, `conversationId`, `executionNum`,
`modelName`, `artifactDirectoryPath` and `transcriptPath`. So:
- In A3, the launcher also keeps `fullyIdle` (a bool) and `error`. When there
  is no `cwd`, it sets `cwd` to `workspacePaths[0]`.
- agy has no reply text, so a `done` from agy carries no reason, unless
  `error` is set. The transcript is not read.

The Codex payload matched the spec. Claude's could not be triggered headless.
Its fields (`notification_type`, with the values `permission_prompt`,
`idle_prompt`, `auth_success` and `elicitation_dialog`) were confirmed in the
installed `claude-code` 2.1.306/2.1.316 binary, and its two fixtures are built
from that schema.
| any | `hook` not a dict (old hook lines) | `ask` | the joined `text`; `"is waiting for you"` becomes `""` |

- Change `attention_accept(frm, text, now=None, target=None, hook=None)`:
  - run the parse, and return `False` on `None`;
  - rate-limit per `(frm, kind)` (key `_ATTN_LAST[(frm, kind)]`), still 30 s;
  - publish
    `BUS.pub(t="attention", **{"from": frm, "name": …, "kind": kind, "project": project, "text": reason})`.
- In the handler at `server.py:4288`, pass `hook=b.get("hook")` if it is a
  dict with at most 12 keys, else `None`.

Traps: keep `attention_target` and the `_ATTN_TARGET` update before the rate
limit, unchanged.

**Deviations (A2, 2026-11-02).**
- A Codex `type` that is neither `agent-turn-complete` nor contains
  `approval` returns `None`.
- A Claude `notification_type` outside the four known values counts as
  `done`, with no reason.
- pytest isn't installed in this environment. The test command is
  `python -m unittest discover -s tests -q`; where this plan says
  `pytest`, read it as that.

**A3. `bin/nixi-companion:28-48`: `--hook`** → verify with
`echo '{"notification_type":"idle_prompt","cwd":"/x/y"}' | NIXI_COMPANION_PYTHON=python3 bin/nixi-companion attention --from claude --hook; echo $?`,
which prints `0` even with no Nixi running.
- Parse `--hook` after `--from`. In the inline Python:
  - take the JSON from `sys.argv[-1]` if it starts with `{`; otherwise, when
    stdin is not a TTY, read up to 64 KiB from it;
  - keep only the keys `notification_type message type last-assistant-message hook_event_name cwd title prompt_response response`,
    with string values `[:300]`;
  - add `"hook": {...}` to the posted body. The words are then not used as
    `text`.
- Any parse error sends no `hook` (the legacy path).

Traps: the whole block stays in its `try/except Exception: pass`, and
`exit 0` stays.

**A4. New `tests/test_attention.py`** → verify that
`python -m pytest tests/test_attention.py -q` passes.
- One test per row of the A2 table, using the A1 fixtures where one exists.
- Project sanitising: `cwd="/a/b c;rm"` gives `""`.
- A reason holding `password=hunter2` gives `""`.
- `ask` after `done` within 30 s is still shown; a second `done` within 30 s
  is not.
- A malformed `hook` (a list, or `None`) falls back to the legacy path.
- Mock `BUS.pub` and assert on its kwargs.

**A5. `app/static/index.html`: the two kinds, plus agent marks** → verify by
A7.
- **Attention branch at `:1601-1605`.** Use
  `lbl = ev.name + (ev.project ? ' · '+ev.project : '')`.
  - **`ask`:**
    - when hidden, notify with `lbl+' needs you'+(ev.text?': '+ev.text:'')`;
    - otherwise everything as today, but speak
      `ev.name+' needs you'+(ev.project?' in '+ev.project:'')+(ev.text?': '+ev.text.slice(0,60):'')`.
  - **`done`:**
    - when hidden, return;
    - otherwise `sfx('done')` and `poke('t_beam',1400)`, with no flash;
    - `tick('✓ '+lbl.replace(ev.name, ev.name+' finished')+(ev.text?': '+ev.text:''))`;
    - set `chip.dataset.from` and add `act` (click still focuses), but no
      `attnPend`, no speech, no `renderCue` timer.
  - Both call `agentMark(ev.from, kind)`.
- **Mark group.** Add `<g id="agentMark" opacity="0" transform="translate(8 -122)" pointer-events="none"></g>`
  after `#cue` (`:518`), with children `#amC`, `#amX` and `#amA` (one per
  agent), plus `#amRing` (an orange ripple circle) and `#amChk` (a green
  check path, `stroke-dasharray` 30).
  - **Claude:** 8 rounded rays, `rect` 4×11, rx 2, rotated by i·45°.
  - **Codex:** a 26×22 rect, rx 6, fill `#1d2026`, stroke `var(--acc)`,
    with a `>` path and a `_` rect inside.
  - **agy:** a circle r 11, stroke `#4c8bf5` 3.5, plus a dot r 3.
- **Spring.** Add `agent: new Spring(0,2.6,.5)` to `G` (`:1044`).
- **`agentMark(from,kind)`.** Shows only the matching child (an unknown agent
  returns, and the old `!` cue is used). Records
  `AM = {from, kind, t0, until: now + (kind==='ask' ? 60000 : 2500)}`.
- **`frame()`,** next to the sit block (`:1328`), only while
  `AM || G.agent.v > .002`:
  - The spring targets 1 while `now < AM.until`.
  - Scale `.6+.4*v`, times `1+.12*max(0,sin(t*8.8))` for `ask`.
  - The Claude rays rotate at `t*6` degrees; the Codex `_` blinks
    (`t%1 < .5`); the agy dot orbits (angle `t*3.93`).
  - **`ask`:** `#amRing` r is `12+14*((t*.7)%1)`, opacity `1-((t*.7)%1)`.
  - **`done`:** `#amChk` dashoffset is `30*(1-min(1,(now-AM.t0-150)/300))`.
  - At 0 after `until`, set `AM = null`.
- Clicking the chip, or `attnJump`, sets `AM.until = 0`.
- `renderCue()` (`:1563`) hides `#cue` while `AM` is set.
- Add `#agentMark` to the `body.bar` hide list (`:74`) and to `body.calm`
  (`:330`).

Traps: don't touch `#face`. The chip's click handler (`:1756`) already reads
`chip.dataset.from`.

**Deviations (A5, 2026-11-02).**
- `Spring.x` is the value and `.v` is the velocity. Wherever this plan says
  `G.<spring>.v > .002` (here and in B4–B7), read it as `.x`.
- `agentMark` ignores a `done` while an `ask` mark is still showing.
- The chip gets `act` after `tick()`, because `tick` resets its class.

**A6. `docs/GUIDE.md` and this machine's hooks** → verify by one real alert
per agent.
- Add a section "Agent alerts" with the three hook lines from the spec. Note
  that Codex has no approval hook, so Codex alerts only say "finished".
- Replace the three live hook lines in `~/.claude/settings.json`,
  `~/.codex/config.toml` and `~/.gemini/config/hooks.json` with the new ones.
  Back each file up to `*.bak-138` first.

**Deviation (A6, 2026-11-02).** The `nixi-companion` on `PATH` is the
Nix-built 0.1.0 (`/nix/store/…-nixi-companion-0.1.0`), and it doesn't know
`--hook`: with the new lines it would show "needs you: --hook {…}". So the
live hook swap on this machine moves to **after PR A is merged and the new
build is installed**. A7 tests the hooks by running the worktree's launcher
directly. The `*.bak-138` backups stay until then.

**A7. Live check and PR A** → verify by:
- `python -m pytest tests/ -q`, all green;
- running the worktree's server
  (`NIXI_COMPANION_APP=$PWD/app NIXI_COMPANION_PYTHON=$(command -v python3) bin/nixi-companion restart`);
- screenshots of the Claude `ask` (from the A1 permission fixture piped into
  `attention --hook`), the Codex `done` and the agy `done`.

Then the Opus review (a fresh agent, given the plan path and `git diff`),
then the Codex and agy reviews (the `second-opinion` skill). Open PR A,
linking the intent, spec and plan, with the screenshots attached.

**Deviations (A7 live check, 2026-11-02).**
- When the reason already starts with the agent's name ("Claude needs your
  permission…"), the headline uses the reason as it is, instead of
  "Claude needs you: Claude needs…". The project goes after it
  (" · snowflake" on the chip, ", in snowflake" when spoken).
- The agent mark is 1.35× bigger and sits at `translate(8 -108)`, below the
  chip, so the chip no longer covers it.

**Deviations (A7 review fixes, 2026-11-02; from the Opus, Codex and agy reviews).**
- **Launcher:**
  - stdin is read with a 2 s limit, stopping at the first complete JSON;
  - a bad JSON last argument is dropped, not sent as text;
  - strings are cut at the last space before 300 characters.
- **Server:**
  - the secret scrub runs on the whole first line before the 90-character
    cut;
  - agy has an explicit branch;
  - any other agent with a hook gives `ask` with `message`/`title`, or
    `None`.
- **Page:**
  - a `done` that arrives while a question is pending only chimes;
  - the mark is clickable during an `ask` (it jumps to the agent, like the
    old `!`);
  - the spring is reset when the mark clears;
  - mark elements are cached, and only the active parts are written each
    frame;
  - the mark is off in notch mode.
- **Tests:** `tests/test_attention_launcher.py` runs the launcher as a real
  process.

## Steps — PR B: looks, mic bar, notification props, beat

Worktree: `git worktree add ../snowflake-138b -b feat/138-props origin/main`,
after PR A merges. Re-check the line numbers: PR A moves `index.html` lines
by about 40.

**B1. Settings `look_beat` and `notify_speak_subject`** → verify that
`curl` POST `/api/settings` with `{"look_beat":true}` persists.
- `server.py`:
  - `CFG` defaults (`:198-201`): add both as `False`;
  - append both to `NOTIFY_FLAGS` (`:2978`). That covers the allow-list at
    `:4161` and `state_info` (`:3944`).
- `index.html`:
  - after the `lookMusicSw` row (`:581`), add a `lookBeatSw` row: "Pulse to
    the beat · listens to what's playing (not your mic) while music plays";
  - after the `detailsSw` row (`:578`), add a `speakSubjSw` row: "Read mail
    subjects aloud";
  - wire both in the maps at `:2358` and `:2489`;
  - disable each while its parent is off, using the same pattern as the
    existing dependent rows.

**B2. Feeds in `Inbox.rows()` (`server.py:1441-1456`)** → verify by a new test
in `tests/test_inbox.py` (a Reddit `other` row becomes `video`; `mail`
stays).
- Before the `CATS` check, if
  `x.get("category") == "other" and FEED.search((x.get("source") or "") + " " + (x.get("app") or ""))`,
  set the category to `video`.
- Define `FEED = re.compile(r"(?i)youtube\.com|youtu\.be|twitch\.tv|reddit\.com|bsky\.app|mastodon|\bx\.com|twitter\.com|freetube|grayjay|tuba|tokodon")`
  on the class.
- `index.html` `NOTE.video` (`:1702`) becomes `['▶','New post',…]`, and the
  settings chip label for `video` becomes "Feeds" (find it with
  `grep -n "'video'" index.html`).

**B3. `class Beat` in `server.py`, after `Listen` (`:1922`)** → verify by a
test that `Beat.want()` is False with the switch off, in a meeting or asleep,
and True when all gates pass. Patch `CFG`, `Ambient`, `Wake` and `BUS.subs`.
- `want()`:
  `CFG.get("look_beat") and Ambient.music and not Ambient.meeting and not Wake.asleep and BUS.subs`.
- `sync()`: start a daemon thread when `want()` and none is running; set a
  stop flag when it isn't wanted. Called at the end of `Ambient.sense()`
  (`:1185`).
- **The thread:**
  - Popen
    `["parecord","-d","@DEFAULT_MONITOR@","--raw","--format=s16le","--rate=2000","--channels=1","--latency-msec=50"]`,
    or `["pw-record","--target","@DEFAULT_MONITOR@","--rate","2000","--channels","1","--format","s16","-"]`
    if there's no `parecord`; with neither, return;
  - read 200 bytes (100 samples) at a time;
  - `rms`; `avg += (rms-avg)*.05` (start `avg` at the first `rms`);
  - `BUS.pub(t="beat", v=round(min(1,max(0,(rms/max(avg,1e-4)-1)/.8)),2))`;
  - on the stop flag or EOF, `terminate()` the process, then `wait(1)`.
- Never keep the samples or log them.

Traps: copy the Popen/stderr handling from `open_mic()` (`:1850-1901`).
Check that `Ambient.sense()` runs often enough for the 1 s stop target; if it
doesn't, also call `Beat.sync()` from `Ambient.loop`'s fast tick, and record
that as a deviation.

**Deviations (B3, 2026-11-02).**
- `Ambient.sense()` runs every 2 s, and it refreshes music only every 5 s.
  Instead of an extra call to `sync()`, the capture thread re-checks
  `want()` on every read (0.5 s `select` timeout). Turning the switch off,
  losing the subscriber or falling asleep therefore stops it within about
  0.5 s. A meeting or music stopping stops it only once `Ambient` notices,
  which takes up to about 2 s (meeting) or about 7 s (music), not 1 s.
- The recorder's stderr goes to `DEVNULL`, not `PIPE`: nothing reads it
  during a long run, and a full pipe would block the recorder.
- The level maths is a pure `Beat.level(avg, rms)` with its own tests.
- Live smoke test: `parecord` on `@DEFAULT_MONITOR@` gave about 19 blocks/s.

**B4. Glasses (`index.html` `drawSit` `:827-830` and the eye loop
`:1236-1245`)** → verify by screenshots: idle, looking left, big eyes
(`poke('excited')`).
- In `drawSit`, replace the circles with `gl.lensL`, `gl.lensR` and `gl.brg`
  (`<path>`, `fill:'#ffffff0d'`, `stroke:acc`, 2.6) and two glint paths.
  Return them in `SIT_P`.
- In the eye loop, when `SIT_P && G.sitGl.v > .002`, build each lens per eye:
  - half-width `EYE.rx*z+6`, half-height `EYE.ry*.62*z`;
  - centre `(cx, cy-6*z)`, corner radius 10, rotated by `-side*.157`;
  - every point through `P()`.
- Write `d` for both lenses and the bridge (inner top of one lens to the
  other). Add `translate(0 ${-1.5*lvl})` while `isTalk(m)`.
- The existing `put(SIT_P.gl,…)` at `:1338` keeps the fade and the scale.

**Deviation (B4 visual check, 2026-11-02).** With a half-width of
`EYE.rx*z+6`, the two lenses overlapped in the middle by about 2 px each.
Each lens centre is now `side*max(|cx|, hw+6)`, pushed out just enough to
keep a gap for the bridge. Checked in the sandbox at rest and with big
(`excited`) eyes. No temples.

**B5. Headphones (`drawSit` `:813-820`, frame `:1337`)** → verify by
screenshots with big eyes (no overlap) and with `look_beat` on (pulsing).
- Draw `hb` into `bk` (`#sitBack`). Band path
  `M-84 -8C-88 -92 88 -92 84 -8`, ink stroke 10, accent inner stroke 3.
- Draw each cup as its own group, `hf.cL` and `hf.cR`:
  - an ellipse shell (rx 15, ry 26, `ink`, rim stroke);
  - an accent cushion ellipse (rx 7, ry 19) on the head side;
  - a 4×10 yoke rect to the band;
  - rotated `s*8`.
- In `frame()`, while `b > .002`:
  - `X = max(88, EYE_HALFW*G.sz.x + EYE.cx + 22)`;
  - each cup: `translate(${s*X - s*lx*.6} -8) rotate(${s*8 + (s<0 ? -12*L : 0)}) scale(${1+.07*k})`;
  - `hb` gets `translate(0 ${-1.5*k})`;
  - `k = look_beat && beatAt > now-500 ? beat : .25*(.5+.5*Math.sin(t*2.2))`;
  - the whole set rocks by `G.sitW.x*.25`.
- In `onEvent`, for `ev.t==='beat'`, set `beat = max(beat, ev.v)` and
  `beatAt = now`. Each frame, `beat = max(0, beat - dt*8)`.
- Head nod: `G.jelly.kick(.015*k)` only when `k > .6` and 200 ms have passed
  since the last nod.

**B6. Mic bars** → verify by a screenshot while talking, and by the bars not
showing in notch mode.
- Add `<g id="micBars" opacity="0" pointer-events="none">` with 5 `rect`s
  (5 px wide, rx 2.5, 4 px apart, centred on x 0, around y 130) in `#cam`,
  after `#shadow` (`:495`).
- Spring `mic: new Spring(0,2.6,.7)`, targeting
  `rec&&!rec.stopping || follow`.
- In `frame()` after `micLvl` (`:1182`), while `G.mic.v > .002`:
  - each bar: `h = max(target, hPrev - dt*4*20)` with
    `target = 2 + 18*micLvl*[.5,.8,1,.8,.5][i] + 2*micLvl*sin(t*17+i*1.9)`;
  - set `y = 130-h/2` and `height = h`;
  - colours: the centre bar `var(--hot)`, the others `var(--acc)`, the outer
    two at opacity .7.
- The hearing ring: in `ringAmt` (`:1196`), use `micLvl*(G.mic.v > .5 ? .7 : 1.1)`.
- Add `#micBars` to the `body.bar` (`:74`) and `body.calm` (`:330`) hide
  lists.

**B7. Mail, chat and feed props** → verify by `notify-send -a Thunderbird`,
`-a Slack` and `-a firefox` (with a youtube.com body) while the takeover is
on, plus screenshots.
- In `drawSit`, add groups `mail` (env, flap, letter), `chat` (bubble, dots,
  badge text) and `feed` (tv, antennae, play), with the shapes, sizes and
  anchors below.
- Add springs `sitMail`, `sitChat` and `sitFeed` (2.6, .5).
- A `propOn={cat,t0,until}` is set in `notifyDrain` (`:1720`) by category:
  mail 3200 ms, chat 2800 ms, video 2400 ms. A new one replaces the old.
- Per frame, using `put()`:
  - **Mail** at `(70,14)`:
    - flies in from `(120,-20)` with a `18*(1-v)` degree tilt;
    - flap: `scale(1, ${1-2*clamp((now-t0-250)/200,0,1)})` about y −14;
    - letter: `translate(0 ${-14*clamp((now-t0-350)/300,0,1)})`.
  - **Chat** at `(-74,-60)`:
    - pops in with overshoot;
    - dots: `translate(0 ${sin(t*9-i*1.1)*3})`;
    - the badge shows `×${notifyBurst.n}` when n > 1, and each new chat
      re-kicks `G.sitChat.kick(.45)`.
  - **Feed** at `(74,-52)`:
    - hops in with `G.jelly.kick(-.4)`;
    - the antennae use the `G.wob` angle;
    - the screen flickers once at 120 ms.
- **Mail speech** (replaces `enqueue(c[1])` for mail at `:1731`): if the
  category is in `notify_speak` and not `SIT.meeting`/`SIT.locked`/`muted`,
  speak `info.notify_details && info.notify_speak_subject && ev.summary ? ev.summary : 'New mail'+(who?' from '+who:'')`.
- **Chat caption:** in `notifyText` (`:1706`), for chat with `ev.body` and
  n < 3, append `' · '+ev.body.split(/\s+/).slice(0,6).join(' ')`, the whole
  caption capped at 90 characters.
- Mail: `poke('reading',2600)`, and set `talk.away=[5,1]` for 1500 ms so he
  looks at the letter.
- Add all three groups to the `body.bar` hide list (they live in `#sitFront`,
  which is already hidden there; confirm it).

**B8. Live check and PR B** → verify by:
- the full test suite green;
- screenshots for each of B4–B7;
- `top -b -n 30 -d 1 -p <server pid>`, with music playing and `look_beat` on
  versus off: at most 3 % of one core extra.

Then the Opus review, the Codex and agy reviews, and PR B, linking all three
artifacts.

## Tests

```sh
python -m pytest tests/ -q
echo '{"notification_type":"permission_prompt","message":"Claude needs your permission to use Bash","cwd":"/x/snowflake"}' \
  | bin/nixi-companion attention --from claude --hook; echo "exit=$?"   # 0, ask alert, Claude mark, spoken
bin/nixi-companion attention --from codex --hook '{"type":"agent-turn-complete","cwd":"/x/snowflake","last-assistant-message":"Tests pass."}'; echo "exit=$?"   # 0, done, Codex mark, silent
notify-send -a Thunderbird "Invoice 42" "Due Friday"    # envelope
notify-send -a Slack "Alice" "are we still on for 3?"    # bubble
```

## Rollback

- **Each PR:** `git revert -m 1 <merge sha>` in `nixoarchy-snowflake`.
- **Hooks:** restore `~/.claude/settings.json.bak-138`,
  `~/.codex/config.toml.bak-138` and `~/.gemini/config/hooks.json.bak-138`.
  Old hook lines keep working on new code anyway (the legacy path).
- **The beat capture:** switch `look_beat` off (the default); the capture
  stops within a second.
