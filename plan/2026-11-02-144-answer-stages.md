---
status: approved
issue: 144
amendment-1: approved
spec: spec/2026-11-02-144-answer-stages.md
reviewers:
  - codex   # the user asked for Codex and agy on this design; the trust path and parsing need a second read
  - agy
---

# Plan: A visual stage for each kind of answer

Code: `olafkfreund/nixoarchy-snowflake`, from `main` at `f65f587`. Line numbers
below are at that commit. Artifacts: this repo. Each slice is its own PR and
deploy.

## Approved decisions (copied from the spec, so this file stands alone)

### The frame and the sets

- **One frame beside Nixi:** 390 × 300 px, growing to at most 440 tall, then
  scrolling inside.
- **Placement:** on the side with room, clamped to the monitor.
- **The closed frame is click-through.**
- **Shared parts:** a title plaque, ✕ and Esc, numbered items `1 2 3`, and one
  action row.
- **Sets** (a CSS class on the frame):
  - `board`: commands;
  - `notebook`: facts, maths of more than one line, links;
  - `sky`: weather;
  - `cinema`: video;
  - `map`: directions and places;
  - `desk`: calendar and status.
- **Fonts:**
  - commands are always monospace;
  - Caveat (chalk) and IM Fell English (map) are for headings and labels only;
  - both are bundled as local files, so the page makes no font request.
- **Colours** come from the theme variables. Slate and parchment keep their own
  surface colour but take the theme's accent.

### How a stage is chosen

- **A typed block, never guessed from prose.** The agent ends its reply with
  one line:

  ```text
  <<stage>>{"v":1,"kind":…}
  ```

- **Agent-made stages:**
  - `commands`: `items:[{label,cmd}]`;
  - `facts`: `title`, `points[]`, optional `source`.
- **Server-made stages** (the agent says only what to show):
  - `weather`: `{}`;
  - `video`: `{query}`;
  - `place`: `{dest, mode}`;
  - `calendar`: `{}`;
  - `status`: `{}`.
- **The server cuts the block out of the stream** before the caption and the
  voice. It holds back text from `<<stage` to the end of that line.
- **Validation:**
  - known kinds only;
  - at most 5 items;
  - labels and points up to 120 characters, commands up to 500;
  - no control characters;
  - only the server builds URLs.

  A block that fails is dropped, and the answer stays a caption.
- **The page gets `t:"stage"`** and renders every field with `textContent`.
- **Tokens:** each command, link and video gets a server-held token, and the
  page sends back only the token. The server keeps the current stage and the
  one before it for 10 minutes.

### "Run this"

- The server looks up the command and runs a normal ask turn with this prompt:

  ```text
  Run exactly this one command and nothing else: <cmd>
  ```

  This is the same form as the herdr send (`server.py:3791`), and the bridge
  applies trust:
  - Guide cancels it, and the board says so;
  - Mechanic shows the approval card;
  - YOLO runs it, but secret paths are still refused.
- **Byte-exact check:** while a stage-run is in progress, any permission
  request whose command isn't exactly the stored one is denied automatically,
  and the board shows "Nixi tried to run something else — stopped".
- **Status under the command:** waiting → running → ✓ or ✕ with its first error
  line. Full output goes to "Open in Nixi".
- **Copy** runs `wl-copy` on the server and works at every trust level.

### What each set shows

- **Board:**
  - also answers package and option lookups;
  - the voice says "the command on the board" only while a board is showing.
    Otherwise the command is read out, which was the behaviour before S24,
    because there's nowhere else to see it.
- **Notebook:**
  - a heading, up to 5 points and a source line;
  - **Copy** and **Open in Nixi**.
- **Map:**
  - a labelled sketch: "Trip preview", a "You" → ✕ inked trail, a compass, and
    the footnote "A sketch, not the route: Google Maps picks the way and the
    start";
  - no distance or travel time;
  - **Open in Google Maps** opens
    `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=…` (or
    `/maps/search/?api=1&query=…` for a place) with `xdg-open`;
  - no origin, no key, no request from the page;
  - **Copy address**.
- **Cinema:**
  - the search is `yt-dlp --flat-playlist -J "ytsearch3:<query>"`, with an 8 s
    timeout;
  - thumbnails are proxied by the server: at most 3, up to 200 KB each, only
    from `i.ytimg.com`;
  - **Play** runs `mpv <url>` if mpv is installed, otherwise the browser;
  - when the search fails, the stage offers **Search in browser**.
- **Sky:**
  - current conditions from `Ambient`'s `omarchy weather`;
  - a forecast strip only from real data;
  - the source and the time are shown.
- **Desk:**
  - **calendar:** the next event as a flip page, up to 3 tickets, **Open
    calendar**, and **Join** when there's a meeting link;
  - **status:** herdr sessions and failed user services, with **Open
    session** or **Open terminal**, and no overall verdict.
- **Not stages:** timers, music, the screen look, and short facts under about
  20 words with nothing to act on.

### Motion

- **Content first:** content is readable at once, and animation only
  decorates.
- **Timings:**
  - open: 220 ms;
  - one flourish: at most 650 ms;
  - point: 300 ms;
  - no idle loops;
  - close: 180 ms.
- **One gesture per set for Nixi:** chalk, explorer hat, popcorn, pocket watch.
- **Only `transform`, `opacity` and `stroke-dashoffset` are animated.** Banned:
  - WebGL and WebGPU;
  - `backdrop-filter`;
  - SVG `feTurbulence` and displacement filters.

  Grain is a static pattern.
- **Reduced motion:** a fade only, with no flourish and no costume change.

### Usability

- **When a stage opens:** only for something to act on, at least two items, or
  something spatial or time-based.
- **One at a time:** a new stage replaces the old one, and "go back" (or ← on
  the plaque) restores the previous one for 10 minutes.
- **Approvals come first:** an approval card dims the stage.
- **How long a stage stays:**
  - stages with buttons stay; after 30 s of no use they shrink to a tab beside
    Nixi;
  - read-only stages (notebook, sky) close 20 s after speech ends, or later
    while the pointer is over them;
  - after a hand-off, the stage shows "Opened ✓" and closes after 1.5 s.
- **Voice fast path** (matched by the server, no agent turn):
  - "run the first/second/third one";
  - "copy that";
  - "play number two";
  - "open it" (only with exactly one target; otherwise Nixi asks which);
  - "close", "go back", "show it".
- **Focus:** a stage never takes the keyboard. Buttons focus only on a click,
  as at `window.py:347`.
- **Quiet times:** no stage opens during fullscreen, lock, dictation or an
  approval.
- **Setting:** **Answer stages**, on by default, in the Voice tab. When it's
  off, the note doesn't ask for a block and everything stays a caption.

## Steps

Default implementer: the `coder` agent, one agent across all steps. Reviews: a
fresh Opus review of each slice's diff, then Codex and agy (`reviewers:`).

**Traps that apply to every page step:**
- `index.html` has many one-line functions. A `//` comment in the middle of a
  line disables the code after it, and that has broken this page twice. Put
  comments only at the end of a line, or use `/* */`.
- After each page edit, extract the inline `<script>` and run `node --check` on
  it.
- Never preview in a GPU browser. Previews run only in headless Chromium with
  these flags: `--headless=new --disable-gpu --use-angle=swiftshader
  --enable-unsafe-swiftshader --disable-gpu-compositing`. After each run, check
  `journalctl -k` for `ring .*timeout|gpu reset`.
- Tests run with `python3 -m unittest discover -s tests -q`; pytest isn't
  installed.

### Slice 1: frame, board, notebook, Run (PR 1)

**1. `app/stages.py` (new): parsing, validation, tokens, URLs, voice**
- **`Cutter`:**
  - `feed(delta) -> str` returns only the text that's safe to show and speak;
  - `close() -> (text, block_or_None)`;
  - it holds back from `<<stage` to the end of the line, and handles a marker
    split across deltas.
- **`validate(obj) -> dict | None`:** applies the limits above. It strips a
  `cmd`'s ends, but never edits its content.
- **`Store`:**
  - `put(stage) -> stage_with_tokens`;
  - `get(token) -> (kind, item)`;
  - `back()`;
  - holds the current and previous stage, with a 10 min expiry;
  - tokens are `secrets.token_urlsafe(12)`.
- **`maps_url(dest, mode)`:** builds the URL with `urllib.parse.quote_plus`.
  `mode` must be one of driving, walking, bicycling or transit.
- **`fast_path(said, stage) -> (action, index) | None`:** matches the phrases
  above (words or digits 1–5).
- **Tests:** `tests/test_stages.py`. Every function, a marker split over 3
  deltas, a bad block dropped, a token expiring, the URL encoding, every phrase,
  and "open it" with two targets returning `ask`.
- **Verify:** `python3 -m unittest tests.test_stages -q`.
- **Traps:**
  - standard library only;
  - no `shell=True` anywhere.

**2. `app/server.py`: put stages into the ask stream**
- **The note** (`run_bridge`, `:3811`): when `CFG["answer_stages"]` is on, it
  also asks for the stage block and its schema, in at most about 6 lines.
- **`real_emit`** (`:4788`): passes `delta` text through a per-turn `Cutter`.
  On `result` or `done`, if a block came back valid, it calls
  `Store.put(...)` and sends `{"t":"stage",…}` before `result`.
- **The history record** `rec["him"]` keeps only the cut text.
- **Verify:** a unit test that feeds a fake bridge stream (follow the style of
  `tests/test_bridge.py`) and checks the `stage` event and the cut caption.
- **Traps:**
  - the `follow` gate (`:4757`) holds deltas back before `real_emit`, so the
    cutter goes inside `real_emit`, not `emit`;
  - stages are on only in bridged mode.

**3. `app/server.py`: stage actions and the byte-exact Run**
- **`POST /api/ask` accepts `{"stage": token, "act": "run"}`.** The server
  looks up the command and sets `ST.stage_run = cmd`. It then runs a normal
  turn with this prompt:

  ```text
  Run exactly this one command and nothing else: <cmd>
  ```

  `ST.stage_run` is cleared in a `finally`.
- **In `approve(o)`** (`:3803`): if `ST.stage_run` is set and the request's
  command (from `o["detail"]` or its raw input) isn't exactly `ST.stage_run`,
  the server answers the bridge with the option whose `kind` starts with
  `reject`, and emits `{"t":"stage_status","state":"other"}`. Otherwise it
  shows the card as now.
- **`POST /api/stage/act {token, act}`** handles every action except Run:
  - `copy`: `wl-copy`, with the text on stdin;
  - `open`: `xdg-open <server-built url>`;
  - `play`: `mpv <url>`, falling back to the browser;
  - `back`: restores the previous stage;
  - `close`: closes the stage.

  Each answers `{"ok":…}`. Run goes through `/api/ask` instead (above).
- **`/api/ask` checks the fast path first.** If a stage is current and
  `fast_path(said)` matches, it acts and replies with a short spoken line,
  without an agent turn.
- **Status events** during a run: `stage_status` with `waiting`, `running`,
  `done`, or `failed` plus the first error line.
- **Verify:**
  - unit tests for the deny on a mismatch, Copy calling `wl-copy` (mocked),
    `open` using only the server's URL, and a token from another stage
    refused;
  - `grep -n 'shell=True' app/stages.py app/server.py` finds no new lines.
- **Traps:**
  - **Find the approve option kinds first.** Check the option `kind` values the
    bridge actually sends, by grepping nixi-nixarchy's `bridge/bridge.js` for
    `reject_once` before relying on them.
  - **Never** pass command text from the page.

**4. `app/server.py`: speaking commands**
- **Tie the spoken command to the board.** Today S24 (`speakable`, `:2600`)
  replaces inline code with "the command on screen". Instead:
  - while a `commands` stage is current, it says "the command on the board";
  - otherwise it reads the command out, as before S24.
- **Pass the state in.** Give `speakable` a `board: bool` argument and set it
  from `Store` at the TTS call sites (`:4310`, `:4331`).
- **Verify:** update `tests/test_speakable.py` for both cases.

**5. `app/static/index.html`: the frame and the board and notebook sets**
- **Markup:** `<section id="stage" role="dialog" aria-labelledby="stageT"
  hidden>`, after `#mailPop` (`:564`).
- **CSS:**
  - the frame, the `board` and `notebook` materials, the action row;
  - the tab state;
  - `@media (prefers-reduced-motion: reduce)`;
  - textures as static gradients only.
- **Fonts:** `@font-face` for `fonts/caveat.woff2` and
  `fonts/imfell.woff2`, added in step 7.
- **JS:**
  - `stageShow(ev)` builds every node with `textContent`;
  - `stageWant` joins `sizeWindow()` (`:2709`), the same way `popWant` does;
  - the side with room comes from Nixi's position;
  - Esc and ✕ call `/api/stage/act close`;
  - a 30 s timer shrinks the stage to a tab, and the read-only 20 s timer
    closes it;
  - `stage_status` updates the item's status line;
  - an approval in progress adds `.dim` to the stage.
- **Events:** `onEvent` (`:1670`) and the ask-stream `switch` (`:2058`) both
  handle `t:"stage"` and `t:"stage_status"`.
- **Nixi:** while the board is up, he holds an SVG chalk stick at his arm tip,
  and points once at item 1.
- **Verify:**
  - `node --check` of the extracted script;
  - step 8's page test.
- **Traps:**
  - no `innerHTML` with stage data (`grep -n innerHTML` on the new lines finds
    none);
  - no mid-line `//` comments.

**6. Setting: Answer stages**
- **Server:**
  - `DEFAULTS` (`server.py:109`) gets `"answer_stages": True`;
  - the state dict (`:4205`) reports it;
  - the settings POST (`:4422`) accepts a boolean.
- **Page:** a toggle in the Voice tab (`index.html:633`), copying the existing
  `label.tg` rows.
- **Verify:** extend `tests/test_settings_138.py`, or add
  `tests/test_settings_144.py`.

**7. Fonts**
- **Vendor two Latin subsets:** Caveat and IM Fell English, both OFL, from
  `github.com/google/fonts`. Make them with `pyftsubset … --flavor=woff2`, in a
  `nix shell nixpkgs#python3Packages.fonttools nixpkgs#python3Packages.brotli`.
- **Files:**
  - `app/static/fonts/caveat.woff2` and `app/static/fonts/imfell.woff2`, each
    under 60 KB;
  - the two `OFL.txt` licences, next to them.
- **Verify:**
  - the static route serves `/fonts/…`; check with a curl against a sandbox
    server;
  - the package includes `app/static/fonts`; check `nix build .#default` and
    list the output.
- **Trap:** if the static handler only serves an allowlist of files, extend it
  for `fonts/*.woff2`, with the type `font/woff2`.

**8. Page test: `tests/stages_fit.mjs` and its runner `tests/test_stages_fit.py`**
- **Pattern:** `accessories_fit.mjs`, GPU-free.
- **Checks:**
  - feed fixture `stage` events for each set;
  - the frame stays inside 2560×1440, with Nixi docked left, right and in the
    middle;
  - a title of `<b>x</b>` shows as text;
  - under reduced motion, there's no flourish class.
- **Verify:** the runner passes; the kernel log has no GPU errors.

**9. Slice 1 review, live check, PR, deploy**
- **Reviews:** a fresh Opus review of the diff, then Codex `review --base main`
  and agy, following the second-opinion skill.
- **Live checks on p620:**
  - "how do I install firefox?": the board shows the commands;
  - in Guide, Run is refused;
  - in Mechanic, the card shows the exact command, and Deny leaves nothing run;
  - "copy the first one" puts it on the clipboard;
  - Esc closes it;
  - typing in another window is never interrupted.
- **Run checks need nixi off YOLO.** The user sets that; the lead never changes
  it.
- **PR and deploy:** open the PR, merge it, then deploy the usual way:
  1. bump `nixi-companion` in `nixos_config`;
  2. build `p620`;
  3. post on the agent bus;
  4. run `AGENT_BUS_ANNOUNCED=1 just deploy`;
  5. run `nixi-companion restart`.

### Slice 2: map and cinema (PR 2)

**10. Map set**
- **Server:**
  - `kind:"place"` validates `dest` (up to 160 characters) and `mode`;
  - the store makes an `open` token for `maps_url()`, plus a `copy` token for
    the address.
- **Page:**
  - the `map` material: a parchment gradient, an inked dashed path from "You"
    to ✕ drawn with `stroke-dashoffset` over 650 ms, and a compass;
  - the footnote is fixed text;
  - Nixi wears an explorer hat (SVG).
- **Verify:**
  - unit test for the place → URL with no origin;
  - the page test for the map set;
  - live: Google Maps opens in the browser.
- **Trap:** no `feTurbulence`.

**11. Cinema set**
- **Server:**
  - `video_search(query)`: runs yt-dlp as an argv list with an 8 s timeout and
    parses `entries[:3]`, keeping `title`, `channel`, `duration` and `url`;
  - the results are built into a `video` stage, with `play` tokens;
  - `GET /api/stage/thumb/<token>` fetches from `i.ytimg.com` only, up to
    200 KB, and caches in memory for the stage's lifetime.
- **Page:**
  - the `cinema` material: curtains that part in 400 ms (a transform);
  - poster cards with numbers;
  - **Play**;
  - Nixi holds popcorn;
  - the footer states the search.
- **Failure:** "Couldn't search right now", with **Search in browser** (the
  YouTube results URL, opened with `xdg-open`).
- **Verify:**
  - unit tests with a saved yt-dlp JSON fixture;
  - a thumbnail from another host refused;
  - live: the cinema shows results, and Play opens mpv.
- **Traps:**
  - yt-dlp is an argv list;
  - the query is passed as one argument;
  - no `shell=True`.

**12. Slice 2 review, PR, deploy** (as step 9)

### Slice 3: sky and desk (PR 3)

**13. Sky set**
- **Server:**
  - `kind:"weather"` builds its stage from `Ambient`'s cached weather
    (`:1116-1119`), refreshing it if it's older than 10 min;
  - it includes the source and the time;
  - a forecast only if the source returns one.
- **Page:** the `sky` gradient, by day or night from `SIT.night`.
- **Verify:** unit test with a fixture; live: "what's the weather?".

**14. Desk set**
- **Calendar:**
  - from `Ambient`'s gog call (`:1098`), widened to the next 4 events;
  - a meeting link is extracted only from `hangoutLink` or a `conferenceData`
    URL;
  - **Open calendar** opens `https://calendar.google.com`.
- **Status:**
  - `herdr_agents()` (`:3678`) and the `Ambient` system list;
  - **Open session** uses the existing `session_show`, and **Open terminal**
    runs `xdg-terminal-exec`.
- **Verify:** unit tests with fixtures; live: "what's on tomorrow?" and "how
  are my sessions?".

**15. Slice 3 review, PR, deploy** (as step 9). Close #144 after slice 4.

### Slice 4: the day desk (PR 4) — Amendment 1, status: approved

Decisions copied from spec Amendment 1:
- **Triggers:**
  - "how does my day look?", "what's next today?", "what's on today?" →
    `{"v":1,"kind":"day"}`, so the server builds the stage;
  - the exact "what's next?" goes through Nixi's phrase list, with no agent
    turn.
- **Layout (the `desk` set):**
  - a date tab;
  - a **Next** card: time, title, "in N min", and **Join** when it has a
    meeting link;
  - rows **Today**, **Tasks** (overdue in red) and **GitHub**, each with a count
    and at most two titles;
  - clicking a row opens a detail view of up to 8 items in the same frame;
  - clicking an item opens it in the browser through a server URL token.
- **Data:**
  - calendar: `gog --readonly --json calendar events <Ambient's ids> --from
    <local 00:00> --to <next 00:00>`, including all-day events;
  - tasks: every list from `gog --readonly --json tasks lists`, up to 3, then
    `gog --readonly --json tasks list <id> --due-max <next 00:00>`, not
    completed;
  - GitHub: `gh search issues --assignee=@me --state=open --json
    repository,number,title,url -L 8` and the same for `gh search prs
    --review-requested=@me`, only when `gh auth status` succeeds.
- **Fetching and failure:**
  - each source has an 8 s timeout and a 5 min cache;
  - a source that fails or isn't set up shows its row as "not set up" or
    "couldn't refresh · HH:MM", with the last good data marked stale;
  - yesterday's data is never shown as today's.
- **Voice:**
  - the exact "what's next?" is answered locally and speaks only the next item;
  - any other question while the desk is open goes to the agent with a summary
    of about 150 tokens (counts plus the top two titles per row);
  - no voice-numbered opening in v1.
- **Privacy:** titles stay out of logs, notifications and history; the snapshot
  lives in memory only.
- **Nixi:** a pocket watch; a single page flip of the date tab is the
  flourish.

**16. `app/day.py` (new): the snapshot**
- **`snapshot(now)`:** runs the three sources concurrently. Each runs as an
  argv list with an 8 s timeout and a 5 min per-source cache.
- **It returns** `{next, today[], tasks[], github[], status:{cal,tasks,gh}}`,
  where each status is `ok`, `off` or `stale@HH:MM`.
- **Parsing:**
  - **Calendar:** all-day events take the form `{"allDay":true}`. The meeting
    link comes only from `hangoutLink` or `conferenceData` URLs.
  - **Tasks:** tasks due before today are marked `overdue`.
  - **GitHub:** each issue or pull request becomes `{repo, number, title,
    url}`.
- **`whats_next(snap)`:** the one spoken line, for example "Stand-up in 40
  minutes."
- **`summary(snap)`:** the ~150-token context for agent questions.
- **Tests:** `tests/test_day.py`, with JSON fixtures from gog and gh in
  `tests/fixtures/day/`.
  - **What it covers:**
    - the local-day window, including an all-day event;
    - overdue tasks;
    - gh signed out → `off`;
    - a failure after a success → `stale`, keeping the old data;
    - no `shell=True`;
    - `whats_next` and `summary` output.
  - **How to make the fixtures:** run the real commands once on p620 and
    replace every title with a made-up one.
- **Traps:**
  - **The cache key includes the date,** so yesterday's cache can't serve
    today.
  - **`gog` may print to stderr while still succeeding.** Judge success by the
    exit code and valid JSON.

**17. `app/stages.py` and `app/server.py`: the `day` kind**
- **`validate`:** accepts `{"v":1,"kind":"day"}`.
- **`Store.put`:** for `day`, makes an `open` token for each item URL. URLs
  pass through `day.py`'s check: https only, and only `github.com`,
  `calendar.google.com` and `meet.google.com`.
- **`/api/stage/act open`:** this step implements it for `day` URLs, using
  `xdg-open` as an argv list. Slice 2 reuses it.
- **Fast path:** the exact "what's next?" → `whats_next()`, with no turn.
- **Questions while the desk is current:** `run_bridge`'s prompt gets
  `summary()` appended as context, marked "(today, from Nixi's desk)".
- **Verify:** unit tests for the URL allowlist (a `javascript:` or other-host
  URL is refused), the fast path, and the summary appearing only while the day
  stage is current.

**18. `app/static/index.html`: the day desk**
- **What it adds:**
  - the `desk` set's day layout: date tab, Next card, three rows, detail view
    with ← back;
  - **Join** and **Open** buttons that call `act open` with their token;
  - a status line per row;
  - Nixi's pocket watch.
- **Rendering rules:** everything goes through `textContent`, and only static
  gradients are used.
- **Verify:**
  - `node --check`;
  - `tests/stages_fit.mjs` with day fixtures for empty, full and stale data,
    fitting in 2560×1440 with no overflow;
  - a title of `<b>x</b>` shows as text.
- **Traps:** the page traps above (no mid-line `//`; GPU-free previews only).

**19. Slice 4 review, live check, PR, deploy, close #144**
- **Reviews:** Opus, Codex and agy.
- **Live on p620:**
  - "how does my day look?" shows the real calendar, tasks and GitHub;
  - "what's next?" answers instantly;
  - clicking an issue opens the browser;
  - with gh signed out (simulate it with `GH_CONFIG_DIR` pointing at an empty
    directory in a sandbox server), the GitHub row says "not set up".

## Deviations

- **Step 3: the bridge carries the exact command** (2026-11-02, this commit).
  - The permission event's `detail` is the command followed by the tool's other
    fields, so a byte-exact comparison against it is unreliable.
  - nixi's bridge now adds `command`, which is `rawInput.command` when it's a
    string, to each permission event (`bridge/bridge.js`, tested in
    `bridge/herdr-bridge.test.js`).
  - The companion compares `o["command"]` with the stored command. A
    different **or missing** command is answered `reject_once`, so it fails
    closed.
- **Step 3: YOLO isn't checked byte for byte.** In YOLO, and for a command the
  bridge already "always allows", no permission request reaches the companion,
  so it can't check anything before the command runs.
  - A check of the tool title afterwards would be unreliable, so it isn't
    built.
  - Instead, the stage event carries the trust level, and the board says "runs
    without asking (YOLO)".
  - The exact check is guaranteed only where a card is shown (Mechanic).

- **Slice 2, steps 10-12** (2026-11-03, nixoarchy-snowflake `feat/144-stages-slice2`).
  - **The search runs after the answer.** The video search (yt-dlp,
    `--ignore-config`, 8 s) runs in a thread after the turn's `result`. The
    cinema arrives on the bus when the search is done, and a stale result is
    dropped if another stage has been shown since.
  - **Posters are built from the video id.** They come from the validated
    11-character id (`i.ytimg.com/vi/<id>/mqdefault.jpg`), not from yt-dlp's
    thumbnail URL. A poster that fails to load keeps a dark 16:9 ▶ frame.
  - **The hat (`#hat`) and popcorn (`#pop`) are separate elements**, not part
    of the skin system. They were placed by eye in a headless preview.
  - **"Opened ✓" is one helper.** `stageOpened` is shared by Open in Google
    Maps, Play and Search in browser.

- **Slice 3, steps 13–14** (2026-11-03, nixoarchy-snowflake
  `feat/144-sky-desk`, by the Sonnet coder).
  - **Weather source:** "Ambient's cached weather" is now #157's
    `Ambient.reading()` (Open-Meteo for the current place, or the omarchy
    fallback, both with a 2 h expiry).
  - **Day or night** comes from `SIT.day` (the forecast's day/night), not
    `SIT.night`.
  - **No forecast is shown:** neither source returns one, so the card
    gives the source and the reading time instead.
  - **"partly"** reads "partly cloudy".
  - **Open session** attaches by `pane_id` through `attach_argv` (what
    `session_show` uses), so two sessions with the same title don't make it
    ask "which one?".
  - **The calendar** looks 2 days ahead, up to 4 events. Birthday events
    are left out, as before (their titles aren't kept).
  - **The pocket-watch gesture** stays with slice 4.
  - **Review fixes** (Opus, Codex, agy), by the coder:
    - meetings stay while they run (`end > now`);
    - local DST via `astimezone()`;
    - one bad event is skipped, and a naive `dateTime` is read as local;
    - the welcome names today only;
    - Join accepts only a video entry point or `hangoutLink` on Meet, Zoom,
      Teams or Webex hosts, over https, with no user-info;
    - the weather card uses `Ambient.reading(cached=True)`, so no
      subprocess runs;
    - empty states: weather off or no reading; calendar off, unread or
      empty;
    - no sun for an unknown sky;
    - failed services appear in the text fallback;
    - "open it" works on a sessions card (one session opens, several get
      "which one?").
    - An all-day event's `end.date` is exclusive, as Google defines it.

- **Slice 4, steps 16–18** (2026-11-03, nixoarchy-snowflake
  `feat/144-day-desk`, by the Sonnet coder).
  - **URL check:** `item_url_ok` lives in `stages.py`, not `day.py`, to
    avoid a circular import. Items open only on github.com,
    calendar.google.com and meet.google.com. The calendar's `htmlLink` is
    used only on an allowed host; otherwise the link is
    calendar.google.com.
  - **"What's next?":** it answers only from a cache under 5 minutes old.
    If the cache is cold, it says "Let me look at your day." and fetches
    in a thread, then shows the desk. The request never blocks.
  - **The calendar row** is `off` while the `ambient_calendar` setting is
    off, as in slice 3. Tasks and GitHub don't depend on it.
  - **A failure with nothing cached** reads "couldn't refresh · HH:MM" with
    empty data.
  - **GitHub row order:** review requests come before assigned issues.
  - **Ongoing events** show "now".
  - **Layout:** the Next card's buttons sit beside the time, so a normal day
    fits without scrolling (tested). A full day and the detail view scroll
    inside the frame.
  - **Voice:** "open it" and numbered phrases are off on the day desk (v1
    is click-only, as specified).
  - **Not done:** the live checks on p620, and a real signed-out `gh`
    run (covered by a fake-runner test).
  - **Review fixes** (Opus, Codex, agy), by the coder:
    - every source outcome is cached for 5 min (ok, off, failed with its
      stale data), so a failure is retried after 5 min;
    - "what's next?" needs only the calendar entry;
    - the enabled calendar ids are part of the cache key;
    - birthdays are dropped through one shared `stages.BIRTHDAY` rule;
    - timed events get their day from the local date;
    - a `gh auth status` timeout is a failure, not "off";
    - spoken hours are words;
    - "now" shows once;
    - Google's `www.google.com/calendar/…` event links are allowed;
    - `DAY["snap"]` is set only when the stage shows;
    - one cold "what's next?" fetch runs at a time.

## Tests

| Check | Expected |
|---|---|
| `python3 -m unittest discover -s tests -q` | all pass, including `test_stages*`, `test_speakable`, settings |
| `node --check` on the page's extracted script | no errors |
| `tests/test_stages_fit.py` (GPU-free) | every set fits; markup in a field shows as text |
| `journalctl -k` after each preview | no `ring timeout` or `gpu reset` |
| `grep -n innerHTML` on the new page lines | none with stage data |
| Live (each slice) | the checks in steps 9, 10, 11, 13 and 14 |

## Rollback

- **Fast off switch:** turn **Answer stages** off in Settings. Nixi goes back to
  captions and the note stops asking for blocks.
- **Full rollback:** revert that slice's merge in `nixoarchy-snowflake`, bump
  `nixi-companion` in `nixos_config` to the revert, deploy p620 the usual way,
  and restart Nixi.
