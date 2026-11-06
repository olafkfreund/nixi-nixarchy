---
status: draft
issue: 215
spec: spec/2026-11-06-215-click-opens-app.md
coders:
  1: coder   # test writing against live page behaviour, with no production edits
  2: codex   # small, tricky logic: a click that must not disturb his own click or the message display
  3: codex   # small, tricky logic: the follow-up rules decide whether an app starts
reviewers:
  - codex    # found the second-copy and spoofing problems in the spec
  - agy      # found the id casing, the hidden window and the queued key in the spec
---

# Plan: clicking a message or email opens its app

Clicking the caption row, the envelope or the chat bubble brings up the app the notification came from, and starts it
if it's closed. How messages show today doesn't change. This is everything needed to implement it, without opening the
intent or spec.

## Decisions carried over from the approved spec

- **Today's display is untouched:** art, timing, text, ×N, the envelope, sound and speech. Tests pin it first, and they
  pass on unchanged code before any other edit.
- The shell's `activateKey` stays first, with its own order: a command on the row, the sender's `default` action, the
  sender's window, `https://<host>/`, a link, then focus by name. The shell's code isn't changed.
- **The bubble** does what clicking the row does, for the row on screen, only while the bubble shows and a row is up.
  Otherwise the click carries on to him, and starts listening as today. It tracks no key of its own.
- **Only mail and chat from a native app follow up.** A browser's row, `nixi-job`, `notify-send` and every other
  category behave exactly as today, with no toast.
- **After 1.5 seconds:** if focus changed, or there's no Hyprland, do nothing. If no matching `.desktop` file, or a name
  claimed by two files, show a short toast. If a matching window is active, do nothing. If it's behind others, focus it.
  If there's none, start the installed app.
- Matching is exact and case-insensitive, on the id, `StartupWMClass` and full `Name`, never a shortened name or a part
  of a host. `gtk-launch` gets the real, mixed-case id, as a list, with no arguments from the notification.
- The page sends only the key, so it can't name what starts. `Inbox.origin` holds no text.
- Accepted risks: a spoofed sender can make a click start or raise an installed app with no arguments; a slow app may
  be launched twice, which most apps hand to the first copy; a click on the bubble opens the app and doesn't start
  listening, for the under 3 seconds it shows.
- Not doing: changing the shell, preferring web apps, keeping the row up longer, reusing `quick._find_app`, or fixing
  voice "open <app>", which looks like a separate bug.

## Where the work happens

- Code: repo `olafkfreund/nixoarchy-snowflake`, new worktree `/mnt/code/Source-home/GitHub/nixi-215-code`, branch
  `feat/215-click-opens-app`, from `origin/main` **after #207 is merged**, because both change `server.py` and
  `index.html`. Lines below are from `9aff36f`, so find them by name.
- This plan lives in `olafkfreund/nixi-nixarchy`, branch `feat/206-character-friends`.
- Coders don't commit, deploy or restart. The session model reviews, runs the check and commits each step.

## Steps

### 1. Pin today's behaviour: new `tests/notify_fit.mjs`, new `tests/test_notify_fit.py`

Tests only, with no change under `app/`. `test_notify_fit.py` copies the setup of `tests/test_settings_fit.py`: a
throwaway HOME, `nixi_env.server_env`, `_browser.start_browser`, the page token from `runtime.json`, and
`?native=1#t=<token>`. `notify_fit.mjs` copies the CDP header of `tests/voice_fit.mjs`, and drives the page's own
functions, with `post` wrapped to record calls:

- `notifyText` for mail, chat, the job row, a burst of 3, and a row with no details, as exact strings;
- a chat row via `notifyIn`: `propOn.cat==='chat'`, the bubble's opacity above 0, its icon's `href`, and the caption row's
  text; a second chat gives `propOn.n===2` and `×2`;
- a burst, exactly as it is today: the first row shows, the second goes into `notifyQ`, and the third changes the visible
  row to the counted text and its key, without entering `notifyQ`, so the second stays queued; a row with the same key
  changes the text in place with no new arrival;
- `notifyQ` holds at most 8 waiting rows beyond the one on screen, and a row older than 4 seconds is dropped;
- a mail row: `#mailPop` gains `on`, `open` and `up`, and loses them, in `mailPop`'s order at about its times;
- `notify_sound` false plays no sound; `notify_speak` decides speech; a meeting silences both. Spy on `sfx` and
  `enqueue`, because neither goes through `post`;
- a real click through `Input.dispatchMouseEvent` on the row, and on the envelope, posts `/api/notify/act` with
  `how:'open'`; Esc posts `how:'dismiss'`;
- a real click on him with nothing showing starts listening (`rec` or `startRec` recorded).

**Check:** `cd tests && python3 -B -m unittest test_notify_fit test_inbox test_caption_fit`, on the unchanged code.

**Traps:**
- `notifyIdle()` is false when the page is `busy`, `playing` or similar, so `notifyDrain` holds rows back. Clear the
  state in the test first, and set `notifyAt=0` between cases. Real speech would make it false too, so `enqueue` stays
  stubbed.
- `sfx` returns early unless `info.sfx` is set and `muted` is false. Set both before the sound cases.
- The bubble's position and opacity are set by `frame()`, so wait for an animation frame before measuring it.
- Timers run on `performance.now()` and `setTimeout`. Wait in real time, and allow some slack, or the test will flake.
- GPU previews crashed this desktop twice. Use only headless Chromium with `--disable-gpu`, through `start_browser`.
- New test servers use `nixi_env`. A temp HOME alone still reaches the live voice lock, window and shell.
- If a test fails on the unchanged code, the test is wrong. Fix the test, not the page.

### 2. The bubble: `app/static/index.html`, `tests/notify_fit.mjs`

- `drawSit`, right after `chat=prop(fr,'left','chat')` (`:1203`), add the listener:

  ```js
  chat.addEventListener('click',e=>{
    if(!(propOn&&propOn.cat==='chat'&&performance.now()<propOn.until&&notifyRow)) return;
    e.stopPropagation(); notifyAct('open'); });
  ```

- `sendRegion`, beside `if(cap.classList.contains('ntf')) add(plate,4);`: add
  `if(SIT_P&&notifyRow&&propOn&&propOn.cat==='chat'&&performance.now()<propOn.until) add(SIT_P.chat.g,4);`.
- Add `cursor:pointer` to the bubble only while it's clickable, set where the draw code shows it. If that takes more
  than a line, leave it out, as `#body` already has `cursor:pointer`.

Tests, added to `notify_fit.mjs`:

- a real click at the bubble's centre, while it shows, posts `how:'open'` with the on-screen row's key, and doesn't
  start listening;
- a real click on him away from the bubble starts listening, as today;
- once the bubble has gone, a click at its spot behaves as it did before this step;
- with ×2, it posts the first row's key; with ×3, the third row's, which is what the row then shows. In both, the
  second row is still queued and shows next, as it does today after clicking the row;
- after a look change, which redraws the props, the bubble's click still works;
- every test from step 1 still passes, unchanged.

**Check:** `cd tests && python3 -B -m unittest test_notify_fit test_caption_fit test_character_fit test_settings_fit`

**Traps:**
- `SIT_P=drawSit(LOOK)` runs again on a look change, so a listener added once outside `drawSit` would be lost. It
  must be inside.
- `#sitFront` is inside `#body`, so without `stopPropagation` the same click also starts listening.
- A mousedown on the bubble still reaches `E.body`'s mousedown handler (`downAt`). A drag starting on the bubble stays
  a drag, because the `dragged` check is in `E.body`'s click handler. Don't change that.
- Don't change the group's opacity or `pointer-events`, or `AMX.mk`-style attribute handling: its hidden spot must
  behave as it does today.
- `sendRegion` is grid-snapped. Don't call it per frame. It already runs when the row opens and closes.

### 3. Follow up on the server: `app/server.py`, `tests/test_inbox.py`, `tests/test_icons.py`

- `Icons._build`, before the `if not icon: continue`: add a second map built per file, assigned to `cls.apps` at the
  end, beside `cls.names`. Use `real = f[:-8]`, not `fid`, which is lowercased. Skip the file unless
  `kv.get("Type")=="Application"`; skip `Hidden=true`, `NoDisplay=true`, and an id starting with `-`. Its keys are the
  lowercased id, `StartupWMClass` and full `Name`, each mapped to `{"id": real, "wmclass": lowered StartupWMClass}`. A key
  already held by a different file becomes `None`.
- `Icons.desktop_for(app, source)`: builds with `if not cls.built: cls._build()`, as `lookup` does, and rebuilds on a
  miss after `cls.TTL`, so a new install is found and tests that reset `built` get a fresh map. It tries `app`, then
  `source`, lowercased and stripped. If the first key found is `None` (a collision), return `None` without trying the
  next. Don't use `_find`, slugs or host splitting.
- `Inbox`: add `origin = {}`. At the top of `tick`, beside the `unseen` sweep, drop entries over 10 minutes old, so they
  expire even when no rows arrive. Where each row is published, if `row["category"] in ("mail","chat")`,
  `row["app"].strip().lower().replace("-", " ") not in Icons.BROWSERS` and
  `not Icons.HOST.fullmatch(row["source"].strip().lower())`, store `origin[row["key"]] = (row["app"], row["source"], now)`,
  then drop the oldest above 64. The `replace` is needed because `BROWSERS` holds `google chrome` and `brave browser`,
  while the page's names show the shell can send `google-chrome` and `brave-browser`.
- Module-level helpers near `Inbox`, each catching `OSError`, `ValueError` and `subprocess` failures:
  - `_focused_addr()`: **not `_active_window`, which already exists at `server.py:970`, returns a position, and is used
    by window capture.** Returns `None` unless `HYPRLAND_INSTANCE_SIGNATURE` is set and `hyprctl` exists. Runs
    `hyprctl activewindow -j`, and returns `None` on a non-zero exit, empty output or bad JSON, so a failure never
    looks like an empty desktop. Otherwise it returns the `address`, or `""` if nothing is focused (Hyprland prints `{}`).
  - `_window_for(entry, app, source)`: from `hyprctl clients -j` sorted by `focusHistoryID`, the **address** of the first
    client whose lowercased `class` or `initialClass` equals the lowercased id, `wmclass`, `app` or `source`, or `None`.
    Skip empty strings. If `hyprctl` fails, the caller does nothing, so `follow_up` must tell that from "no window".
  - `_focus(addr)`: `hyprctl dispatch 'hl.dsp.focus({ window = "address:<addr>" })'`, then, if that fails,
    `hyprctl dispatch focuswindow address:<addr>`. Accept only an address matching `0x[0-9a-f]+`.
  - `_launch(id)`: `quick._spawn(["gtk-launch", id])` if `gtk-launch` exists. Otherwise publish the toast "I can't start
    apps here: gtk-launch isn't installed."
- `Inbox.follow_up(app, source, before)`, in this order:

  ```python
  time.sleep(1.5)
  now = _focused_addr()
  if now is None or now != before:
      return
  entry = Icons.desktop_for(app, source)
  if entry is None:
      BUS.pub(t="toast", text=f"I couldn't find {app or source} on this machine.")
      return
  win = _window_for(entry, app, source)   # raises on a hyprctl failure: caught below, and nothing starts
  if win is None:
      _launch(entry["id"])
  elif win != now:
      _focus(win)
  ```
- Route `/api/notify/act`, for `how == "open"` only:

  ```python
  origin = Inbox.origin.pop(key, None)
  before = _focused_addr() if origin else None
  ok = Inbox.call("activateKey", key) == "ok"
  if ok and origin and before is not None:
      threading.Thread(target=Inbox.follow_up, args=(origin[0], origin[1], before), daemon=True).start()
  return self._json({"ok": ok})
  ```

  `how == "dismiss"` stays as it is, and also drops the key from `origin`. `is not None` differs on purpose from the
  spec's `if before`: on an empty workspace, where nothing is focused, a closed app should still start. A `hyprctl`
  failure is `None`, so it starts nothing.

Tests in `tests/test_inbox.py`, with the fake shell already there, `Inbox.origin.clear()` added to `setUp`, and `hyprctl`
helpers, `time.sleep` and `quick._spawn` mocked:

- focus changed starts nothing; no Hyprland starts nothing; a failing `hyprctl` starts nothing; an empty workspace
  with a closed app starts it;
- `capture("window")` still gets its position from the old `_active_window`;
- no change with a closed app starts it, exactly once, with the real mixed-case id;
- a window already active does nothing; a window behind others is focused and not started;
- a class matching only the app name counts as open;
- no match gives the toast; a collision gives the toast and starts nothing;
- a browser's row, including `google-chrome` and `brave-browser`, a host as source, `nixi-job`, and a `notify-send` row
  in category `other` never follow up or toast;
- an unknown key does nothing, and a bad `how` is still refused;
- `origin` holds no text, is capped at 64, and expires on a `tick` with no new rows;
- `dismiss` drops it.

Tests in `tests/test_icons.py`, using its `desktop()` helper, which gets a `Type=Application` line, an optional extra
line, and support for no icon:

- `desktop_for` keeps `org.foo.Bar`, and finds it by id, `StartupWMClass` and full `Name`;
- not by "Foo Mail" from "Foo Mail - Inbox", and "code" doesn't match "Visual Studio Code";
- `Hidden`, `NoDisplay`, `Type=Link` and an icon-less app behave as stated;
- two files with one name return `None`;
- every existing icon test passes unchanged.

**Check:** `cd tests && python3 -B -m unittest test_inbox test_icons test_notify_fit`

**Traps:**
- Never import server under the real HOME: use `_ServerEnv`. Never run real `hyprctl`, `gtk-launch` or a real
  `omarchy-shell` socket in a test: they'd act on the live desktop.
- `Icons._build` hits `continue` for a file with no icon. The new map must be filled first, or apps with no icon are lost.
- Keep `names`, `slugs` and `lookup` working exactly as they are. Icons must not change.
- `Inbox.rows` blanks summary and body under privacy, but `origin` uses only app and source. Never put the summary, the
  body or the toast's name in a log: `Inbox`'s docstring forbids logging row text.
- Read `before` before `activateKey`, and take the `origin` entry first, so a double click follows up only once.
- `follow_up` runs on a daemon thread. It catches its own exceptions, and prints only the type, as `Inbox.loop` does.

### 4. Finish (session model, no file edits beyond this plan)

1. Run the whole suite: `cd tests && python3 -B -m unittest discover`. Expect only failures that also fail on the base
   commit, and name any.
2. Fresh Opus review with only this plan's path and `git diff`, plus Codex and agy read-only reviews of the diff.
3. PR to `nixoarchy-snowflake` `main`, linking the intent, spec and plan, saying which steps Codex and the `coder`
   did, then comment `@codex review`. Merge when CI and the reviews are clear.
4. Deploy p620, with the same steps as #207: check the agent bus, open the `nixos_config` bump PR, comment `@codex review`,
   wait for CI, merge, post on the bus, `AGENT_BUS_ANNOUNCED=1 nh os switch .` from a clean worktree, then export the
   live `HYPRLAND_INSTANCE_SIGNATURE` and run `nixi-companion restart`.
5. By hand on p620, from the user, in the real native window: clicking the moving bubble, the row and the envelope,
   with a native chat app open and behind others, then closed; a closed mail app; and a browser message, which must open
   its tab and start nothing else. No claim that it works without the user saying so. Also check that `gtk-launch` is
   reachable from the service.
6. Razer: `just deploy-via-p620 razer`. p510 is not part of this.

## Tests

`cd tests && python3 -B -m unittest test_notify_fit test_inbox test_icons test_caption_fit test_character_fit test_settings_fit`
all pass, with the step 1 tests unchanged from when they first passed.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`. agy's JSON reports no model. Each finding was checked
against the code at `9aff36f`.

**Confirmed and applied:**

- agy: `_active_window` already exists at `server.py:970`, and redefining it would have broken window capture.
- agy: copying `stdout or b"{}"` would make a `hyprctl` failure look like an empty desktop.
- Both: a burst doesn't become one row. The second stays queued, so the pinned test and the ×N test now say what's true.
- agy: `sfx` and `enqueue` don't go through `post`, and real speech would stall later cases.
- agy: `_window_for` must return an address, `origin` needs its sweep at the top of `tick` and clearing in `setUp`, the
  bubble needs a frame before measuring, and `sendRegion` should check `notifyRow`.
- Codex: `BROWSERS` misses `google-chrome` and `brave-browser`.
- Both: `desktop_for` must build from `built`, or the map leaks between tests.

**Changed on purpose, for the user to see:** Codex flagged `before is not None` as different from the spec's `if before`.
It stays, so a closed app still starts from an empty workspace. A failure is `None`, so nothing unsafe follows.

**Refuted:** agy's quotes of `notifyIdle`, `notifyClear`, `tick` and the plan's `_focus` aren't the real text, though the
points above were confirmed separately.

**Not verified:** `gtk-launch` in the service's environment, real window classes, the native click region, and whether
Hyprland really prints `{}` with nothing focused. No code has been written or run.

## Rollback

Revert the code PR and bump the flake again. `origin` is memory only, and no setting or file is added, so nothing needs
repair. The pinned tests from step 1 can stay.
