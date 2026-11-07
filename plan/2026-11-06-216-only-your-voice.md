---
status: draft
issue: 216
spec: spec/2026-11-06-216-only-your-voice.md
coders:
  1: codex   # small, tricky: recorder fallback order and a zero-frame counter inside the hot mic loop
  2: coder   # one parser and its tests
  3: codex   # the counters' state, the event plumbing and the [ignore] gate: easy to get subtly wrong
  4: coder   # page wiring that follows existing patterns (send opts, MENU, settings rows)
  5: agy     # a self-contained Nix option and an eval check that mirrors hm-companion-peers
reviewers:
  - codex    # reads the diff natively with `codex review`, catches logic slips in steps 1 and 3
  - agy      # a second, independent read; its citations are verified before use
---

# Plan: Nixi answers you, not your speakers

## Decisions carried over from the approved spec

- **Part 1, a missing or silent mic is said.**
  - If `mic_device` is set but not in `list_mics()`, the recorders run without a device (the default mic), and one
    `note` says: "The mic you chose (<label>) is gone. I'm using the default mic, so I may hear your speakers."
  - With no `pactl`, the setting is used as today.
  - 10 s of exactly-zero frames from the chosen source gives one note: "The mic you chose (<label>) sends no sound."
  - `Wake.loop()` publishes `open_mic()`'s error as a note, once per new error.
- **Part 2, the echo canceller option.** `services.nixi.companion.echoCancel.enable` (default `false`) writes
  `~/.config/pipewire/pipewire.conf.d/61-nixi-echo-cancel.conf`, with source `nixi-echo-cancel-source`, built like
  Meeting AI's. It doesn't change `mic_device`, and needs one PipeWire restart. Not turned on for any host in this
  plan.
- **Part 3, `media_playing()`.** It returns true, false or `None`. True means some stream is uncorked, not muted, on a
  sink that isn't muted, and isn't named `Nixi`. `None` means unknown: no `pactl`, or bad JSON. It's called once per
  heard phrase, in `Wake.check()`. `Ambient.music` is left as it is.
- **Part 4, counters and "that wasn't me".**
  - Daily totals, 14 days at most, in `DATA_DIR/heard-counts.json`, keyed path × media × outcome:
    - path: `wake`, `follow`, `barge`
    - media: `on`, `off`, `unknown`
    - outcome: `sent`, `ignored`, `not_me`
  - Written at most once a minute and on exit. No text, no event times.
  - `GET /api/heard` needs the token. One line in the mic settings shows the week.
  - The path and media go on the `wake` and `barge` events, and come back in `/api/ask` as `heard`.
  - Counted where they happen: `sent` in the ask handler, `ignored` at `gate["ignored"]`.
  - One in-memory slot, `(path, media, time)`, for marking `not_me` within 2 minutes.
  - Marking:
    - Spoken: "that wasn't for you", "not you" or "I wasn't talking to you", plus nb and pl, full-phrase only. While
      he talks, it stops him. Afterwards he says "Sorry." with no follow-up window.
    - A "that wasn't me" button in his menu, shown only within the 2 minutes.
- **Part 5 is not built.** It needs the counters' week and the user's go-ahead.

## Where the work happens

- Steps 1 to 4: `olafkfreund/nixoarchy-snowflake`, new worktree `/mnt/code/Source-home/GitHub/nixi-216-code` on
  `feat/216-only-your-voice` from `origin/main` (8f2275e). Line numbers below are from 8f2275e.
- Step 5 and these artifacts: `olafkfreund/nixi-nixarchy`, worktree `/mnt/code/Source-home/GitHub/nixi-216`, branch
  `feat/216-only-your-voice`.

Traps for every step:

- Run tests from `tests/`. New test servers use `tests/nixi_env.py`, never the real HOME.
- No real `pactl`, `parecord`, `hyprctl` or `gtk-launch` in tests: stub `subprocess.run`, `Popen` and `shutil.which`.
- Never `pkill -f`. Commits only after the check passes (`&&`).
- The full suite takes about 37 min. Save it to a log, don't pipe it to `tail`. `test_stages_fit`, `test_voice_fit` and
  `test_whisper_switch` are flaky under load (also on main).

## Steps

1. **`app/server.py`, part 1, the mic.**
   - `mic_cmds()` (`:2881-2895`): when `dev` is set and `list_mics()` is non-empty and has no `id == dev`, set
     `dev = ""` and call `_mic_note(f"The mic you chose ({dev}) is gone. I'm using the default mic, so I may hear your speakers.")`.
   - New `_mic_note(text)` next to it: publishes `BUS.pub(t="note", text=text)` and prints to stderr, only when `text`
     differs from the last one sent. It resets when `mic_device` changes, or when the device is found again.
   - `Wake.session()` (`:3300-3360`): count consecutive all-zero frames (`not any(fr)`) while `CFG.get("mic_device")`
     is set. At `10 * RATE * 2 // FRAME` frames, call `_mic_note(f"The mic you chose ({dev}) sends no sound.")` once
     per session.
   - `Wake.loop()` (`:3293-3297`): next to the existing stderr print, `_mic_note(f"I can't open the mic: {e}")`, under
     the same `str(e) != last` test.

   Check: new `tests/test_mic_choice.py` covers:
   - a missing device is left off all three recorders and noted once;
   - a present device is kept;
   - an empty `list_mics()` keeps it;
   - the zero-frame note fires once after 10 s of zeros and not for near-silence (values ±1);
   - the loop error is noted once per new error.

   ```bash
   cd tests && python3 -B -m unittest test_mic_choice test_follow_hold test_floor_wiring
   ```

   Traps: `list_mics()` runs `pactl` and must be stubbed. The zero check must cost nothing per frame beyond `any()`.

2. **`app/server.py`, part 3, `media_playing()`.** New function after `Beat` (`:3151-3212`):
   - It runs `Ambient.run(["pactl", "-f", "json", "list", "sink-inputs"])` and `... "list", "sinks"`.
   - Returns `None` if `pactl` is missing or the JSON doesn't parse.
   - Otherwise returns true for any input with `corked` false, `mute` false, its `sink` index not muted, and
     `properties["application.name"] != "Nixi"`.

   Check: new `tests/test_media_playing.py` with sample JSON covers:
   - none playing;
   - corked;
   - muted stream;
   - muted sink;
   - Nixi only (false);
   - a browser (true);
   - bad JSON (`None`);
   - no pactl (`None`).

   ```bash
   cd tests && python3 -B -m unittest test_media_playing
   ```

   Traps: `Ambient.run` returns `None` on any failure (`:1452-1457`); call `shutil.which("pactl")` first so "missing" is told apart.

3. **`app/server.py`, part 4, counters, events, marking.**
   - New `class HeardCounts` near `Wake`:
     - `add(path, media, outcome)` adds to today's cell;
     - `snapshot()` returns the last 7 days plus totals;
     - `save()` writes atomically (tmp + `os.replace`, as at `:431-432`), at most once a minute from `add`, and from the
       existing shutdown path;
     - loading drops days older than 14 and any non-numeric value;
     - `last = (path, media, monotonic)` is the one slot.
   - `Wake.check()` (`:3367-3400`):
     - get `media = {True: "on", False: "off", None: "unknown"}[media_playing()]` after transcription;
     - add `path` and `media` to the three `BUS.pub` calls (`barge` with `listen=True` gets `path="barge"`, `wake` gets
       `"wake"`, the follow-up gets `"follow"`).
   - New `_not_me_re(lang)` beside `_stop_re` (`:3130-3140`):
     - the phrases are en "that wasn't for you|not you|i wasn't talking to you|that wasn't meant for you", nb "det var
       ikke til deg|ikke deg", and pl "to nie do ciebie|nie ty";
     - it uses the same wrap and tail, with `fullmatch`;
     - in `check()`, it's tested before the stop test.
     - While he's speaking, a match does what stop does (`barge`, `listen=False`), plus `HeardCounts.mark_not_me()`.
     - Otherwise, if `HeardCounts.last` is under 120 s old, it marks and calls `Speaker.say("Sorry.", None, None, False,
       None)`.
     - Otherwise it does nothing, and the phrase is not passed on as a request.
   - The ask handler (`:6697`):
     - read `heard = body.get("heard")`;
     - if it's a dict with a valid path and media, `HeardCounts.add(path, media, "sent")` and set `last`;
     - in the gate (`:6736`), when `gate["ignored"]` becomes true and `heard` was set, `add(..., "ignored")`.
   - `POST /api/heard/not-me` (token): marks if `last` is within 120 s, and returns `{"ok": bool}`.
   - `GET /api/heard` (token, beside `/api/companion-plugins` at `:6070`) returns `snapshot()` plus
     `"mark_open": bool`.

   Check: new `tests/test_heard_counts.py` covers:
   - cells, rollover, the 14-day prune, the file holding only numbers, keys and dates;
   - `wake` and `barge` events carry `path` and `media`;
   - the not-me phrases, full-phrase only, en, nb and pl, during speech and after, and past 120 s;
   - ask with `heard` counts `sent`, an `[ignore]` reply counts `ignored`, ask without `heard` counts nothing;
   - both routes refuse without the token.

   ```bash
   cd tests && python3 -B -m unittest test_heard_counts test_follow_hold test_nixi_ask test_window_token
   ```

   Traps:
   - `stages.lang_active()` is the language source used by `_stop_re`; use the same.
   - The shutdown path is the `finally:` after `srv.serve_forever()` (`:6976-6980`, beside `BRIDGE.close()`). There's no
    `atexit` or SIGTERM handler, so a kill can skip it. Up to a minute of counts can be lost, and that's accepted. Don't
    add a signal handler for this.
  - `Ambient.run` returns `None` on a non-zero exit, a timeout or a missing binary (`:1452-1457`).

4. **`app/static/index.html`, part 4, the page.**
   - The `wake` handler (`:2281-2289`): pass `{heard:{path:ev.path,media:ev.media}}` through `send()` for both the
     follow and the name branches. For `startRec('auto')` after a bare name, keep it for the next `send` from that
     recording. The `barge` handler (`:2290-2291`) does the same with `listen`.
   - `send()` (`:2922`, post at `:2973`): add `heard:opts.heard` to the `/api/ask` body when set.
   - `MENU` (`:3131`): add `['notme',"that wasn't me"]` before `'set'`, with an `ICON.notme`. It's shown only while
     `GET /api/heard` says `mark_open`. Check that when he's asked to open the menu, and hide it the way `.nx` items
     are hidden in nixi mode.
   - Clicking it posts `/api/heard/not-me`, then `tick('noted — that one wasn\'t for me')`.
   - The mic row (`:941`): add `<div class="h" id="heardLine"></div>`. Fill it where `/api/devices` is loaded
     (`:3629`), from `GET /api/heard`, as "This week: N times by name, M follow-ups · K not for me (J while media
     played)". Leave it empty when all are zero.

   Check: extend `tests/settings_fit.mjs` / `test_settings_fit.py` for the line, and add a page test that a `wake` event
   with `path` and `media` reaches the `/api/ask` body, and that the menu item hides without `mark_open`.

   ```bash
   cd tests && python3 -B -m unittest test_settings_fit test_notify_fit test_character_fit
   ```

   Traps:
   - Headless Chromium `--disable-gpu` only, through the existing `_browser.py`.
   - Messages and notifications must show exactly as today (`test_notify_fit` pins it).
   - The radial menu spaces items by `MENU.length`, so check the arc still fits in the notch layouts (`NOTCH_MENU`).

5. **`nix/hm-module.nix` (nixi-nixarchy), part 2.**
   - Under `companion` (`:118-217`): `echoCancel.enable = lib.mkEnableOption "..."`. The description says it adds
     `nixi-echo-cancel-source`, doesn't select it, and needs a PipeWire restart or new login.
   - In the `companion.enable` block (`:368`): `xdg.configFile."pipewire/pipewire.conf.d/61-nixi-echo-cancel.conf"`,
     under `lib.mkIf cfg.companion.echoCancel.enable`. The text copies Meeting AI's
     (`~/.config/pipewire/pipewire.conf.d/60-meetingai-echo-cancel.conf`) with `nixi-` names, the description "Nixi
     echo-cancelled mic", and `flags = [ ifexists nofail ]`.
   - `flake.nix`: new check `hm-companion-echo-cancel`, built like `hm-companion-peers`. Off: the file is absent. On:
     its text contains `nixi-echo-cancel-source`, `monitor.mode = true` and `nofail`.

   Check:

   ```bash
   nix build .#checks.x86_64-linux.hm-companion-echo-cancel .#checks.x86_64-linux.hm-companion-peers
   nix flake check
   ```

   Traps: run it in the nixi-216 worktree, not `~/.config/nixos`. Not enabled for any host here.

6. **Review, PRs and deploy.** These stay with me.
   - The full suite in `nixi-216-code`, saved to a log, and the same on `origin/main` for any failure.
   - `codex review --base origin/main` and agy on the diff. A fresh `code-reviewer` on opus gets the plan path and
     `git diff` only.
   - A PR in nixoarchy-snowflake (steps 1 to 4), and a PR in nixi-nixarchy (artifacts and step 5). `@codex review` on
     both. CI green, then merge.
   - Bump `nixi-companion` in nixos_config (lock node `nixi-companion_2`) with a PR, `@codex review`, CI and merge. Post
     on the agent bus, then `AGENT_BUS_ANNOUNCED=1 nh os switch .` on p620 from the clean worktree
     `~/.config/nixos-nixi-167`, then restart Nixi with the live Hyprland signature. razer gets it from the nightly
     upgrade.
   - Hand the user the p620 checklist: "hey Nixi" and "stop" with nothing playing, over a video, over music and in a
     call. Then the "that wasn't for you" phrase and the menu button. Then a working week with the tally.

## Tests

```bash
cd tests && python3 -B -m unittest test_mic_choice test_media_playing test_heard_counts test_settings_fit test_follow_hold test_nixi_ask test_notify_fit
cd tests && python3 -B -m unittest discover > ../suite-216.log 2>&1; tail -5 ../suite-216.log
```

Expected: all of these pass. The full suite matches `origin/main` apart from the known flakes.

## Rollback

- Code: revert the merge in nixoarchy-snowflake, bump nixos_config again, then switch and restart. The counts file can be
  deleted (`~/.local/share/nixi-companion/heard-counts.json`). Nothing else reads it.
- Module: the option is off by default, so reverting changes no host.
- The mic trial: set `mic_device` back to `alsa_input.usb-Razer_Inc_Razer_Seiren_V2_Pro_UC2152L04200038-00.mono-fallback`
  and restart Nixi.
