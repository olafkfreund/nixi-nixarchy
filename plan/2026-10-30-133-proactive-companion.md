---
status: draft
issue: 133
spec: spec/2026-10-30-133-proactive-companion.md
---

# Plan: Proactive companion — phase (a)

Phase (a) only: speech that does not open the microphone, the notification
takeover, the arrival animation, and the look layer with the tie and headphones.
Phases (b) and (c) each get their own plan, on top of this one, once it has
merged.

## Approved decisions this plan carries

- **Everything defaults off**, except per-category sounds (`notify_sound: true`)
  and the spoken categories (`notify_speak: ["meeting"]`). With
  `notifications_takeover` off, nothing changes for anyone.
- **Speech said unasked must not open the follow-up window.** Today every
  sentence calls `Wake.talking_until`, which opens it. The fix carries a
  `follow` flag from the page through `/api/say` and `Speaker` to `Wake`.
- **The shell stays the notification server.**
  - It hands rows to the companion only while the companion holds a lease. The
    lease is renewed every second over the shell's own IPC socket: 0.21 ms per
    call, measured. Never by forking `omarchy-shell` (0.12 s CPU per call,
    measured).
  - No Do Not Disturb toggling, and no taking over the bus name.
  - The DND check stays before the delegation check.
  - Not delegated (they keep their own popup): critical rows, rows with a code,
    `bypassesQuiet` rows, and app `Nixi`.
  - A lapsed lease shows every still-queued row as a popup.
  - Popups already on screen when the lease starts finish normally.
- **Notification text never reaches the agent, a log or the disk** in the
  companion.
  - `summary` and `body` are dropped unless `notify_details` is on.
  - Even when on, `SECRET_LINE` and an OTP pattern blank them.
  - Text reaches the page only through `textContent`.
- **Looks** are a separate SVG layer (`#sitBack`, `#sitFront`), never drawn by
  `drawSkin` or `miniNixi`.
  - Zones: tie on the chin, headphones on the sides.
  - Priority meeting > music.
  - A look goes on after 3 s of signal and off after 8 s without it.
  - Flat paths only: no `<filter>`, no new `requestAnimationFrame`.
- **In a meeting:** the tie, no spoken output, wake word paused, arrivals visual
  only. A calendar item one minute away puts the tie on early.
- **Signals are read without forking**, except `playerctl`, which runs only every
  5 s and only while visible. The Meeting Mode signal is that
  `~/.local/state/meeting-mode/active` exists.

## Repositories and branches

| Repo | Path | Branch from | Branch |
|---|---|---|---|
| snowflake | `~/Source/GitHub/nixoarchy-snowflake` | `origin/main` (`89605ba`) | `feat/133-proactive` |
| nixarchy | `~/Source/GitHub/nixarchy` | `origin/main` (`dae6c3a`) | `feat/133-notification-delegate` |
| nixi | this repo | `feat/133-proactive-companion` | (same) |

Both local checkouts are on other branches with work of their own. Create a
worktree for each (`git worktree add ../<repo>-133 -b <branch> origin/main`).
Do not switch the existing checkouts.

## Steps

### Snowflake

1. **Speech without the microphone: server** (`app/server.py`)
   - `Wake.talking_until(cls, end, follow=True)` (line 1559): when `follow` is
     false, set `speaking_until = end` and `follow_from = follow_until = 0.0`.
   - `Speaker.say(cls, text, sid, epoch=None, follow=True)` (line 2175): append
     `(cls.gen, sid, text, follow)` to `todo`.
     - The producer that turns `todo` into `ready` keeps the flag in the `ready`
       tuple.
     - The player loop (around line 2307, `g, sid, text, pcm, … = cls.ready.pop(0)`)
       unpacks it and calls `Wake.talking_until(start + dur + 0.45, follow)`
       (line 2320).
     - Find every place `todo`/`ready` tuples are built or unpacked
       (`grep -n "todo\|ready" app/server.py`) and update each one. The `todo`
       sort key at line 2180 stays `(x[0], x[1])`.
   - `/api/say` (line 3527): `Speaker.say(text, b.get("id"), b.get("epoch"), b.get("follow", True) is not False)`.
   - New test `tests/test_quiet_speech.py`, in the `_ServerEnv` style of
     `tests/test_speakable.py`:
     - `talking_until(t, follow=False)` leaves `follow_until == 0` and
       `speaking()` true until `t`.
     - `talking_until(t)` still opens the window when `CFG["follow_up"] = 4`.

   Verify: `python3 -m unittest discover -s tests` passes (baseline: 40 run, 4
   skipped, OK).

   Traps: `Speaker.stop` and `hush` clear the queues. They must not assume a
   tuple length.

2. **Speech without the microphone: page** (`app/static/index.html`)
   - `say(t)` is at line 1612; `enqueue` posts `/api/say` at line 1289. Add an
     options argument, `enqueue(t, {…, follow:false})`, that adds `follow:false`
     to that post body.
   - Add `function sayAside(t)`, identical to `say` but passing `follow:false`.
   - The attention handler (line 1525) changes `say(ev.name+' needs you')` to
     `sayAside(…)`.

   Verify:
   - Set `follow_up` to 4 in settings and run
     `nixi-companion attention --from claude test`.
   - The page never shows the listening ring after the sentence.
     `curl -s -H "X-Nixi-Token: …" localhost:<port>/api/state` reports `follow`
     false.
   - Ask a question by voice; the reply still opens the window.

   Traps: the page posts sentence by sentence, so every sentence of an aside
   must carry the flag.

3. **Settings keys** (`app/server.py`, `app/static/index.html`)
   - Add to the defaults (near line 194): `"proactive": False,
     "notifications_takeover": False, "notify_details": False, "notify_speak":
     ["meeting"], "notify_sound": True, "look_meeting": False, "look_music": False`.
   - Add the boolean keys to the save list at line 3625.
   - `notify_speak` needs its own validation: a list of the strings `mail`,
     `chat`, `meeting`, `video`, `download`, `other`, at most 6 entries. Copy
     how `projects` is validated.
   - Settings page: a "Desktop" `row`, using the `label.tg` toggle markup of the
     existing toggles (line 598 style):
     - a master toggle for `proactive`
     - beneath it, toggles for takeover, details, sounds, tie and headphones
     - one chip row for spoken categories

     Wire them the way the `ambient_*` toggles are wired (`grep -n ambient_system
     app/static/index.html`).

   Verify:
   - Toggle each one; `~/.config/nixi-companion/config.json` (or the file
     `save_config` writes) has the value after a restart.
   - A bad `notify_speak` value posted to `/api/settings` is refused.

### nixarchy

4. **Shell patch `pkgs/omarchy/903-notification-delegate.patch`**
   - Make it from the store file:
     1. Copy `share/omarchy/shell/plugins/notifications/Service.qml` out of the
        built `omarchy` package. Apply 902 first; 903 sits on top of it.
     2. Edit the copy.
     3. Run `diff -u` with `a/`/`b/` paths relative to `share/omarchy`.
   - Changes, using line numbers in the unpatched file:
     - Next to `doNotDisturb` (line 52): add `property double delegateUntil: 0`,
       `property var delegatedQueue: []`, and
       `function delegated() { return Date.now() < delegateUntil }`.
     - `handleNotification` (line 578), right after the `if (muted) { … return }`
       block. If `delegated()` and the row is eligible:
       - Record it: `if (!Delivery.isEphemeral(row)) storeRecord(row, "delegated")`.
       - Keep it live: `liveKeys[key].row = row`.
       - Queue it: push
         `{key: key, app: row.app, source: row.source, summary: row.summary, body: row.bodyLine, urgency: row.urgency, category: categoryOf(row)}`.
         When the queue is longer than 32, `showRow` the oldest entry's live row
         and drop it.
       - `return`.

       Eligible means none of:
       - `Delivery.bypassesQuiet(row)`
       - `String(row.code || "")`
       - `notification.urgency === NotificationUrgency.Critical`
       - `row.app === "Nixi"`
     - `function categoryOf(row)`: the table in spec §2, matched on lower-cased
       `row.app`, `row.source` and `row.summary`.
     - `activate(key, instant)` (line 1069): change
       `var row = at >= 0 ? toasts.get(at) : null` to fall back to
       `(liveKeys[key] && liveKeys[key].row) || null`.
     - In the `ShellIpc { target: "notifications" }` block (line 1396), add:
       - `function delegate(ms: int): string`
         - With `ms > 0`: set `delegateUntil = Date.now() + Math.min(ms, 10000)`,
           return `JSON.stringify(delegatedQueue)`, and clear the queue.
         - With `ms <= 0`: run `lapse()` and return `"[]"`.
       - `function activateKey(key: string): string`: `"none"` unless
         `liveKeys[key]`, else `service.activate(key, true)` and `"ok"`.
       - `function dismissKey(key: string): string`: the same check, then
         `service.closeToast(key, "dismissed", true)`.
     - `function lapse()`: set `delegateUntil = 0`, then `showRow` each queued
       entry's `liveKeys[key].row` and clear the queue.
     - A `Timer { interval: 1000; repeat: true; running: service.delegateUntil > 0 }`
       whose `onTriggered` calls `lapse()` once `Date.now() >= delegateUntil`.
   - `pkgs/omarchy/default.nix`: after line 2090, add a line in the same form as
     902:
     `patch -d "$out/share/omarchy" -p1 --forward --fuzz=0 < ${./903-notification-delegate.patch}`,
     with a comment that names #133 and "CARRIED until omacom/omarchy takes it".

   Verify: `nix build .#omarchy` (or the attribute 902 builds under, found with
   `grep -n omarchy flake.nix`) succeeds. In the result, `grep -c delegateUntil
   …/Service.qml` is at least 3.

   Traps:
   - With `--fuzz=0`, any context drift fails the build. That is intended.
   - `activate` is also used by mouse clicks on a popup. Rows in `toasts` must
     behave exactly as before.
   - `closeToast` on a key with no popup already goes through `finishClose`
     (lines 748-756). Do not add a second path.

5. **Session test** (`tests/session.nix`, after the #1032 block, line ~820)
   1. Assert DND is off, then run `dismissAll`.
   2. Send `omarchy-shell notifications delegate 8000` and expect `[]`.
   3. `notify-send -a teams-for-linux -- delegated-133 hi`.
   4. Within 10 s, `omarchy-shell notifications delegate 8000` returns JSON
      containing `delegated-133` and `"category":"chat"`.
   5. Check that no popup file mentions it:
      `! grep -l delegated-133 /home/omarchy/.local/state/omarchy/notifications/*.json`.
   6. Check that it is in history:
      `grep -l delegated-133 …/notifications/history/*.json`.
   7. Lapse test:
      - Delegate with `ms=2000` and send `lapse-133`, without draining.
      - Wait 5 s; a popup file mentions `lapse-133`.
   8. `notify-send -u critical -- crit-133 x` while delegated gives a popup
      file.

   Comment it in the #1032 block's style, with measured timings.

   Verify: `nix build .#checks.x86_64-linux.session -L` passes.

### Snowflake (continued)

6. **`class Inbox`** (`app/server.py`, after `class Ambient`, before line 1110)
   - `sock_path()`:
     1. Derive from `OMARCHY_PATH` and `WAYLAND_DISPLAY` as spec §3 says.
     2. If connecting fails, glob `$XDG_RUNTIME_DIR/omarchy-shell-*.sock` and keep
        the first that answers `notifications ping` with `OK`.
     3. Cache the result. Re-resolve after any `OSError`.
   - `call(method, *args, timeout=1)`: connect, send
     `notifications\x1f<method>\x1f<args…>\x1e`, read until `\x1e`, and return
     the text after `OK\x1f`, or `None`. Cap the reply at 64 KiB.
   - `want()`: `CFG proactive and notifications_takeover and not Wake.asleep and BUS.subs and not cls.stalled`.
   - `loop()` (a daemon thread started next to `Ambient.start()`; find the call
     with `grep -n "Ambient.start" app/server.py`), each second:
     - If `want()`: `rows = json.loads(call("delegate", "5000") or "[]")`.
     - If it was wanted before and is not now: `call("delegate", "0")` once.
     - Each row is checked: a dict with `key` matching `^[A-Za-z0-9:_-]{1,64}$`
       and `category` in the six names.
     - Then `BUS.pub(t="notify", key=…, app=row["app"][:60], source=row["source"][:80], category=…, summary=…, body=…)`.
     - `summary` and `body` are `""` unless `notify_details`. When on, they are
       cut to 120 characters and blanked if `SECRET_LINE.search` or the OTP
       regex matches.
   - Stall guard:
     - `unseen = {key: time}`; `/api/notify/seen {key}` removes a key.
     - With 3 or more keys older than 5 s: set `cls.stalled = True` and call
       `delegate 0`.
     - Any `seen` clears `stalled`.
   - `/api/sleep` (line 3541): when `Wake.asleep` becomes true, call
     `Inbox.call("delegate", "0")` before returning.
   - New `POST /api/notify/act {key, how}`: validate the key; `how` must be
     `open` or `dismiss`. Call `activateKey` or `dismissKey` and return
     `{"ok": reply == "ok"}`.
   - New `POST /api/notify/seen {key}`.
   - Both use the window token like the other page endpoints (not in
     `TOOL_PATHS`).
   - Never `print` a row, write one to a file, or pass one to `run_bridge` or
     `run_claude`.
   - New test `tests/test_inbox.py`:
     - A fake shell: a `socketserver.UnixStreamServer` in a temp
       `XDG_RUNTIME_DIR` that answers `ping` and `delegate`.
     - Tests:
       - the path derivation, and the fallback that skips a dead socket file
       - a reply over 64 KiB is refused
       - a row with a bad key or category is dropped
       - with `notify_details` off, summary and body are empty
       - with it on, `"Your code is 482910"` is blanked
       - the stall guard calls `delegate 0`
       - `want()` is false while asleep

   Verify: the unit tests pass. Live, with the step 4 patch on this desktop:
   `notify-send -a teams-for-linux Ana hi` with the companion visible gives no
   shell popup and an event on `/api/events`.

   Traps:
   - `OMARCHY_PATH` in a long-lived session can name an older tree. This
     desktop has two stale sockets that refuse connections; the fallback must
     handle that.
   - The shell is not ours to block: socket calls use a 1 s timeout and run only
     on the Inbox thread.

7. **Arrival animation** (`app/static/index.html`)
   - In the event handler next to `ev.t==='attention'` (line 1521), handle
     `ev.t==='notify'`:
     1. Post `/api/notify/seen`.
     2. If `busy`, recording, speaking or an approval is pending: push to
        `notifyQ` and return. Drain it from the place that clears `busy` and
        ends speech (`spk_done`).
     3. If the key is shown already: update the text only.
     4. If 3 or more rows of one category arrived within 3 s: show one row with
        a count.
     5. Otherwise play the arrival from the spec §4 table:
        - `wake()`
        - a glance at the caption
        - `G.jelly.kick(-.45)` and `popPupils()`
        - `poke(mood, ms)` from the table
        - `burstLines(col, 3)` in orb mode, or `notchPulse(col)` and `dropSync()`
          in bar mode
        - `capShow()`, with the row set through `textContent` only: a glyph,
          then the category label and app or site, then the summary when
          present
        - `sfx(cat)` if `notify_sound` and not muted
        - `sayAside(label)` only if the category is in `notify_speak` and there
          is no meeting

     Clear the caption after 5 s, unless the user hovers it.
   - Clicking `#cap` or `#chip` while a row is shown posts `/api/notify/act {key, how:"open"}`.
     `Esc` posts `dismiss`.
   - In `sfx()` (`grep -n "function sfx" app/static/index.html`), add `chat`:
     two sine tones, 587 then 880 Hz, about 90 ms each.

   Verify, on this desktop with the switch on:
   - Send one notification of each category, using `notify-send -a` with
     `teams-for-linux`, `thunderbird`, `firefox` (summary "Download complete")
     and a YouTube-like source. Each plays its variant.
   - Five quick chat notifications give one row with a count.
   - Clicking a Firefox notification focuses Firefox.
   - While Nixi is answering, a notification waits until he is done.

   Traps:
   - Never use `innerHTML` with row text.
   - `excited` and `joy` moods trigger strong bursts in `onMood` (line 1043).
     Use only the table's moods.
   - Reuse `#cap`; do not add another DOM panel. `sendRegion()` must run after
     the caption grows, or the click region will not cover it (see how
     `attention` calls it).

8. **Look layer, tie and headphones** (`app/static/index.html`, `app/server.py`)
   - Page:
     - Add `<g id="sitBack"></g>` right after `#accBack` and `<g id="sitFront"></g>`
       right after `#accFront` (lines 501-513).
     - Add `#sitBack,#sitFront` to every CSS rule that hides `#accBack` or
       `#accFront` (`grep -n "accBack\|accFront" app/static/index.html`).
     - Add `function drawSit(name)`, which draws into those groups with `sv()`
       and the `LOOK` palette:
       - **tie**: a knot polygon at `-7,54 7,54 5,62 -5,62` and a blade at
         `-5,62 5,62 9,88 0,97 -9,88`, in `LOOK.pupL` with a `shade(…, -.2)`
         stroke, swaying with `G.wob` around the pivot `[0,56]`.
       - **headphones**: a band path `M-64 -4 A66 66 0 0 1 64 -4`, stroke 7 in
         `acc`, in `sitBack`. Two cups (`rect` 14×36, rx 7, at x ±62, centred on
         y -4) in `sitFront`.
     - Add springs `G.sit` and `G.sitMusic` to `G` (line 977, where
       `G.jelly` is). In `frame()`, set the groups' opacity and
       `scale(.7+.3*x)` about their anchors from those springs.
     - On `ev.t==='situation'`, keep `SIT={meeting, music}`:
       - Hold a look on for 3 s and off for 8 s, with timestamps per look and
         no timers.
       - Each look needs its `look_*` setting.
       - When the meeting look turns on, give one `G.jelly.kick(.35)`.
   - Server (`Ambient`):
     - Add a fast tick inside `Ambient.loop`. It ticks every 20 s today; make
       the sleep 2 s and run the existing sources on their own TTLs, which
       `due` already supports.
     - `meeting = os.path.exists(XDG_STATE_HOME/meeting-mode/active)`.
     - `music`: `playerctl status` through `cls.run`, at most every 5 s, only
       when `look_music` is on and not asleep. It is true when any line is
       `Playing`.
     - Calendar: `meeting` is also true when `cls.events` has an item starting
       within 60 s.
     - Publish `BUS.pub(t="situation", meeting=…, music=…)` only when a value
       changes, and once when the page reconnects.
   - Meeting rules (server):
     - `Wake.should_run` (line 1584) returns false while `Ambient.meeting`.
     - `/api/say` drops the request (and publishes `spk_skip`) while
       `Ambient.meeting` and the body has `follow:false`. Replies to the user
       still play.

   Verify:
   - `mkdir -p ~/.local/state/meeting-mode && touch ~/.local/state/meeting-mode/active`:
     the tie springs on within 5 s.
   - `rm` it: the tie goes after about 8 s.
   - Play a track in `cliamp`: headphones appear. Pause it: they go.
   - Wear the crown skin: crown and headphones show together.
   - The settings skin picker shows no tie.
   - Over 5 minutes, count `lowFx` trips (`grep -n lowFx` shows where it is set;
     add a temporary `console.count`) with looks on and off. The count must not
     rise.

   Traps:
   - `drawSkin` empties `#accBack`/`#accFront` on every look sync. Never draw
     into those from `drawSit`.
   - Do not create a meeting-mode file on a machine where Meeting Mode is
     running a real call. Use a scratch `XDG_STATE_HOME` for the test if
     Meeting Mode is installed.

### nixi

9. **Docs** (`README.md`): a short section under the companion:
   - what the snowflake can now show
   - each switch
   - that notification text stays on the machine and never reaches the agent
   - that the shell keeps its own popups for critical alerts and codes

   Link the intent and spec. `nix flake check` stays green
   (`tools/test_nixi.py` checks README anchors).

10. **Review and PRs**
    - A fresh `opus` review agent gets only this plan path and the three diffs.
    - Three PRs:
      - nixarchy (steps 4-5)
      - snowflake (steps 1-3 and 6-8)
      - nixi (this branch: intent, spec, plan, step 9)

      Each links the other two and all three artifacts. Merge nixarchy first;
      the snowflake works without it, because a `delegate` call that answers
      `SKIP` means no lease and normal popups.

## Implementers

- Steps 1-8 go to one `coder` agent (Sonnet), step by step through
  `SendMessage`, as the managed policy requires for a plan with three or more
  editing steps.
- Steps 9-10 and every live desktop check are done by the session model.
- A step that needs the live desktop (2, 6, 7 and 8 verify) is handed back to
  the session model for the desktop check. It drives the desktop through
  ai-mirror only with the user's control grant.

## Tests

| Where | Command | Expected |
|---|---|---|
| snowflake | `python3 -m unittest discover -s tests` | all pass; 2 new files |
| nixarchy | `nix build .#checks.x86_64-linux.session -L` | passes with the new block |
| nixarchy | build of the omarchy package | 903 applies with `--fuzz=0` |
| nixi | `nix flake check` | green |
| desktop | spec verification 1-8 | each as written |

## Rollback

- **Users:** turn off `notifications_takeover` or `proactive` in settings. The
  next tick sends `delegate 0` and popups return at once. Hiding or closing the
  companion has the same effect.
- **nixarchy:** revert the 903 commit. `delegate` then answers `SKIP`, the
  companion holds no lease, and nothing else changes.
- **snowflake:** revert the PR. No data migration is needed: the new `CFG` keys
  are ignored by older builds, and nothing new is written to disk.
