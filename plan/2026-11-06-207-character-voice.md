---
status: approved
issue: 207
spec: spec/2026-11-06-207-character-voice.md
coders:
  1: codex   # small, tricky logic: one resolver that every speech path depends on
  2: codex   # small, tricky logic: moving the look assignment and ordering the fetch after the save
  3: coder   # ordinary page work across several existing handlers
reviewers:
  - codex    # already holds the voice code from the spec review, and found the Robot and pin gaps there
  - agy      # independent read of the page and the settings flow
---

# Plan: a voice for each character

Each character can have its own voice preset. A character with no entry uses "My voice", which is today's
behaviour. This is everything needed to implement it, without opening the intent or spec.

## Decisions carried over from the approved spec

- One new setting, `voice_by_character`, default `{}`. Keys are ids in `CHARACTERS`, values are ids in `VOICES`.
  It stores presets, not voice files, so `localize()` still resolves them per language.
- `voice_key(code=None)` alone decides. The current character's voice wins, otherwise the user's own choice.
- Nothing writes `voice` or `voice_by_lang` because of a character. `"voice"` still means the Voice tab's choice,
  so its chips light up your own pick. `restore_voice` and the language switcher stay as they are.
- A pinned Kokoro or English Piper voice, and the cloud voice, stay in charge, with no change to `synth()`.
- **Exception:** Robot is espeak on purpose and skips pins. A character set to Robot sounds like Robot.
- If Robot can't speak here, or the mode becomes `kokoro` or `piper`, the character quietly uses your own voice.
- A refused settings request must not change the look.
- Only Robot can be disabled in the picker. An undownloaded preset stays selectable, because choosing it fetches it.
- While a character's voice is active, Voice tab chips and `/voice` save your choice and play no sample.
- Accepted as they are: up to three prepared sentences play in the old voice, and a sentence is skipped in Polish or
  Norwegian on Piper mode while a voice downloads.
- Not doing: writing `voice` on a character change, a per-character-and-language map, storing voice files, cloud
  voices per character, suggested default voices, pins beating Robot, or previewing other presets.

## Where the work happens

- Code: repo `olafkfreund/nixoarchy-snowflake`, new worktree `/mnt/code/Source-home/GitHub/nixi-207-code`, branch
  `feat/207-character-voice`, from `origin/main` at `9aff36f`. Lines below are from that commit, so find them by name.
- This plan lives in `olafkfreund/nixi-nixarchy`, branch `feat/206-character-friends`.
- Coders don't commit, deploy or restart. The session model reviews, runs the check and commits each step.

## Steps

### 1. The resolver: `app/server.py`, new `tests/test_character_voice.py`

- `:177`, beside `voice_by_lang`: add `"voice_by_character": {},`.
- Before `lang_voice_name` (`:3610`), add:

  ```python
  def voice_key(code=None):
      """The preset that speaks. The current character's own voice wins; otherwise the user's own choice."""
      m = CFG.get("voice_by_character")
      v = m.get(look()["character"]) if isinstance(m, dict) else None
      # Robot is espeak only: if it can't speak here, the character quietly uses your own voice
      if isinstance(v, str) and v in VOICES and (not VOICES[v].get("espeak") or voice_ready(VOICES[v])):
          return v
      if code is not None:
          return (CFG.get("voice_by_lang") or {}).get(code) or CFG.get("voice") or "girl"
      return CFG.get("voice") or "girl"
  ```

- `lang_voice_name` `:3617`: `preset = VOICES.get(voice_key(code), VOICES["girl"])`. The mode and pin checks above
  it stay first.
- `voice_preset` `:3702`: `k = voice_key()`.
- `voice_ready` `:5823`, in the final return: `bool(v.get("espeak"))` becomes
  `bool(v.get("espeak") and shutil.which("espeak-ng"))`.
- `diagnostics` `:5712`: keep `(voice: X)`, and when `voice_key()` differs, make it `(voice: X, speaking: Y)`.
- `state_info` `:5865`: keep `"voice"`, and add:
  - `"voice_speaking": voice_key()`;
  - `"voice_pinned"`, true only for a pin that actually applies, because `synth()` uses the Kokoro pin only on Kokoro
    and the Piper pin only on Piper in English. Compute `eng = tts_engine(True)`, then
    `bool(eng == "kokoro" and CFG.get("kokoro_voice") or eng == "piper" and lang.active == "en" and CFG.get("piper_voice"))`;
  - `"voice_by_character"`: only the valid entries of the map, and `{}` if it isn't a dict. The page sends the whole
    map back, so one hand-edited bad entry would otherwise make every later save fail.

Tests in `tests/test_character_voice.py`, on `_ServerEnv` from `test_speakable`, as `test_look_character.py` does:

- no entry means today's behaviour, for `voice_preset` and `lang_voice_name`;
- a character's voice beats `voice` and `voice_by_lang`, and other characters use theirs;
- switching character and language writes nothing to `voice` or `voice_by_lang`;
- Polish and Norwegian resolve through `localize`;
- Robot with and without espeak, under `auto`, `kokoro`, `piper` and `espeak`, plus the `voice_ready` fix;
- a non-dict map, an unknown value and a non-string value are ignored, with no crash;
- `state_info()` carries the three fields; `voice_pinned` is false for a Kokoro pin while Piper speaks, and a bad
  map entry is left out of `voice_by_character`;
- `diagnostics()` shows both voices when they differ, and one when they don't.

**Check:** `cd tests && python3 -B -m unittest test_character_voice test_look_character test_lang test_whisper_switch`

**Traps:**
- Never import server under the real HOME. `_ServerEnv` handles it (#176).
- `CFG` is shared across a test process, so set the map and look with `mock.patch.dict(server.CFG, ...)`. A leftover
  map would change other tests' voices.
- Mock espeak with `mock.patch.object(server.shutil, "which", ...)`, and keep `piper_bin` and `kokoro_ready` explicit,
  so the result doesn't depend on what this machine has installed.
- `voice_key` calls `voice_ready`, so neither `voice_ready` nor what it calls may ever call `voice_preset` or
  `voice_key`. That holds today. Don't change it.

### 2. Saving: `app/server.py`, `tests/test_character_voice.py`

- `look` `:285`: `def look(raw=None):`, first line `lk = dict((CFG.get("look") if raw is None else raw) or {})`.
- Settings route `:6151-6155`: remove `CFG["look"] = cur`, and use `upd["look"] = look(cur)`. `save_config` assigns it.
- `voice_settings` `:5750`: if `"voice_by_character"` is in `b`, it must be a dict where every key is in `CHARACTERS`
  and every value passes `isinstance(v, str) and v in VOICES`. The `isinstance` matters: `VOICES` is a dict, so a list
  from the request would raise `TypeError` instead of being refused. Otherwise return a sentence, like the other voice
  keys: "A character's voice must be one of the voices listed." A good map goes into `upd`.
- Settings route, after the `with _switch_lock:` block at `:6215-6222` closes, inside `if upd:`:

  ```python
  if "look" in upd or "voice_by_character" in upd:
      name = lang_voice_name(lang.active)   # None for Robot, a pinned voice, Kokoro, or a mode that downloads nothing
      if name:
          fetch_voice(name)
  ```

  The existing fetch for `voice` stays. `fetch_voice` starts a thread and does nothing if the file exists, so
  the many look saves from colour changes cost nothing.

Tests drive `/api/settings` over an in-process `HTTPServer`, like `post()` in `tests/test_idle.py`, with these
differences:

- Keep the **real** `save_config`, which is safe under `_ServerEnv`. `test_idle.py` mocks it, and that could never
  check the file.
- Mock `fetch_voice` so nothing touches the network, and mock `piper_bin` and `kokoro_ready`, so `lang_voice_name`
  gives a name on any machine (it returns `None` when Kokoro is installed).

Cases:

- a request with a new look that is refused later (`whisper_model` `tiny.en` with language `pl`) leaves `CFG["look"]`
  unchanged;
- a good look request saves the look, normalised, to `CFG` and to the config file;
- saving the map, or changing to a character with an entry, fetches the new voice, not the old;
- it never fetches for Robot, under cloud mode, or with a pinned voice;
- a bad map, key or value, including a list as a value, gets a 400 with the sentence, and changes nothing.

**Check:** the step 1 command, plus `test_idle test_plugin_maps test_plugin_stage`.

**Traps:**
- Nothing between `:6155` and the save reads the look. `look()` is called only by `state_info`, which runs after the
  save, and by `voice_key`. Checked on 2026-11-06 at `9aff36f`; re-check with `grep -n 'look()\|"look"' app/server.py`.
- The fetch must come after the save, because `voice_key()` reads `CFG`. A fetch before it sees the old map.
- `voice_settings` runs before `:6140`, so it can only return a sentence, as its neighbours do.
- Tests that set `CFG["look"]` directly (`test_plugin_maps.py:93`) must keep working, so `look()` with no argument
  stays the same.

### 3. The page: `app/static/index.html`, `tests/voice_fit.mjs`

- Character row `:862`, under `#characterGrid`: add `<label for="charVoice" id="charVoiceLabel">`,
  `<select id="charVoice"></select>` and `<div class="h" id="charVoiceNote"></div>`. The help text becomes "Each
  character can have its own voice. My voice uses your choice in the Voice tab."
- `renderSettings`, beside `#characterGrid` `:3533`: use `const ch=L.character||'snowflake'`, because `LOOK_DEFAULT`
  has no `character` and the bare value can be undefined. The label is `` `Voice for the ${bodyL.label}` ``, so the
  default reads "Voice for the Snowflake". Fill the select with "My voice" (value `""`), then each of `info.voices`,
  built with `textContent`. Disable an option only when `v.id==='robot'&&v.ready===false`, as the chip does at `:3462`.
  Add ` ⇣` to the label when `v.downloading`. The value is `(info.voice_by_character||{})[ch]||''`.
- `#charVoiceNote`: when `info.tts_choice==='elevenlabs'`: "The cloud voice comes first. This is used when it falls
  back to a local voice." Otherwise when `info.voice_pinned`: "A pinned voice is in charge, except for Robot."
  Otherwise empty. The select stays usable in all cases.
- Move the sample at `:3744` into one helper `voiceSample()`, with the same three `pageLine`s plus
  `if(muted) toggleMute(); shush();`, and call it from there and the new handler.
- `setEl` change handler `:3767`:

  ```js
  if(id==='charVoice'){ const c=curLook().character||'snowflake', m={...(info.voice_by_character||{})};
    if(e.target.value) m[c]=e.target.value; else delete m[c];
    return setSetting({voice_by_character:m}).then(ok=>{ if(ok) voiceSample(); }); }
  ```

- Add one helper `otherVoiceLine()`. It returns `''` unless `info.voice_speaking&&info.voice_speaking!==info.voice`,
  and otherwise `` `The ${character label} speaks as ${voice label}. Change it in Look.` ``, using
  `(CHARACTERS[curLook().character]||CHARACTERS.snowflake).label` and the label from `info.voices`.
- Voice row `:898`: give "Tap one to hear it." the id `voiceTap`, and add `<div class="h" id="voiceOther" hidden></div>`
  above `#voiceChips`. The chips block `:3459` sets `#voiceOther`'s text and `hidden` from `otherVoiceLine()`, and hides
  `#voiceTap` while the line shows, since a tap then plays nothing.
- Chip handler `:3742`: after a good save, keep the download `tick`, then play `voiceSample()` only if
  `otherVoiceLine()` is empty. It's checked after the save on purpose: tapping the chip that matches the character's
  voice clears the line and plays that voice, which is the voice you tapped.
- `/voice` `:3825`: `if(arg){ const ok=await setSetting({voice:arg}); const l=ok&&otherVoiceLine(); if(l) tick(l); }`.
  The no-argument path stays.

Tests, added to `tests/voice_fit.mjs`, which `tests/test_voice_fit.py` already runs on a throwaway server:

- the select appears in Look with My voice and every preset, and saves the map, with `state_info` agreeing;
- only an unready Robot is disabled; an undownloaded preset is not;
- the note shows for a pin and for the cloud voice, and goes when neither applies;
- with a character's voice active, `#voiceOther` shows, `#voiceTap` hides, and tapping a chip plays no sample and
  still saves `voice`; back on My voice, the line is hidden and tapping plays the sample;
- `/voice guy` shows the line while a character's voice is active.

In those last two, set the character's voice to a preset other than the chip tapped and other than `guy`, such as
`deep`, or the line correctly goes away and the test proves nothing.

**Check:** `cd tests && python3 -B -m unittest test_voice_fit test_character_fit test_settings_fit`, with no new
console errors from the page.

**Traps:**
- `voice_fit.mjs` leaves `tts: "elevenlabs"` saved on its server by check 5, and later checks change only the page's
  `info`. Before these checks, post `{tts:'auto'}` to `/api/settings`, or the cloud note never goes away.
- `/api/settings` can't set a pin, and espeak is whatever the machine has. For the pin note and the unready Robot, set
  `info.voice_pinned` or `info.voices` on the page and call `renderSettings()`. The server side of both is step 1's tests.
- Chrome previews hung the AMD GPU and crashed Hyprland twice. Use only the tests' headless Chromium with
  `--disable-gpu`, through `_browser.start_browser`. Never open a normal Chrome.
- New test servers use `nixi_env`. A temp HOME alone still reaches the live voice lock, window and shell.
- `setSetting` redraws Settings, so the select keeps focus only if the node stays. Fill its options, and don't
  rebuild the row.
- An older `state_info` has no `voice_speaking`, so `otherVoiceLine` must treat undefined as "no line".
- `<select>` is already drawn by the page's own CSS at `:497-499`. Add no new select styling.
- UI text here is English only. Only spoken lines (`pageLine`) are translated, and this adds none.

### 4. Finish (session model, no file edits beyond this plan)

1. Run the whole suite: `cd tests && python3 -B -m unittest discover`. Expect only failures that also fail on `9aff36f`,
   and name any.
2. Fresh Opus review with only this plan's path and `git diff`, plus Codex and agy read-only reviews of the diff.
3. PR to `nixoarchy-snowflake` `main`, linking the intent, spec and plan, saying which steps Codex and the `coder`
   did, then comment `@codex review`. Merge when CI and the reviews are clear.
4. Deploy p620: check the agent bus first (a hold on p620 deploys from main was posted for Flea #2694). Open the
   `nixos_config` PR with `nix flake update nixi-companion`, comment `@codex review`, wait for CI, merge, post on the
   bus. Then `AGENT_BUS_ANNOUNCED=1 nh os switch .` from a clean worktree, never from a dirty `~/.config/nixos`, and
   `export $(systemctl --user show-environment | grep ^HYPRLAND_INSTANCE_SIGNATURE=); nixi-companion restart`.
5. By ear on p620, from the user: the Robot speaks as Robot, then Snowflake speaks as My voice, and an agent
   announcement follows. No claim that it sounds right without the user saying so.
6. Razer: `just deploy-via-p620 razer`. p510 is not part of this.

## Tests

`cd tests && python3 -B -m unittest test_character_voice test_look_character test_lang test_whisper_switch test_idle test_voice_fit`
all pass, and the Snowflake pixel test in `test_character_fit` passes unchanged, which shows a character with no
entry looks and speaks as today.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`. agy's JSON reports no model, and its text calls
itself "Gemini 4 Argon (Medium)", which isn't verified. Each was checked against the code at `9aff36f`.

**Confirmed and applied:**

- Codex: the pin note could name a voice that isn't speaking, and the cloud note was wrong after a fallback.
- Both: `test_idle.py` mocks `save_config`, so copying it couldn't check the file.
- Codex: "Tap one to hear it" stayed visible while tapping plays nothing.
- agy: `v in VOICES` raises `TypeError` on a list from the request.
- agy: `L.character` can be undefined on the page.
- agy: one bad hand-edited entry would make every later save fail, as the page sends the whole map back.
- agy: `voice_fit.mjs` leaves ElevenLabs on, and pins and an unready Robot can't be set through the API.
- agy: route tests need `piper_bin` and `kokoro_ready` mocked; the `voice_ready` line was wrong; `diagnostics` had no
  test; the label wording needed spelling out.

**Refuted as a defect:** agy's finding that tapping the chip matching the character's voice wrongly plays a sample.
It's the voice you tapped, and it's what speaks. The plan now says so, and its test warning came from this finding.

**Not verified:** no code has been written or run, and agy didn't read `test_character_fit` or `test_settings_fit`.

## Deviations during implementation (from the Opus diff review, 2026-11-06)

- `otherVoiceLine()` also returns `''` while the cloud or a pinned voice is what speaks, except for Robot, because "speaks
  as Deep" would be false. Chips then play their sample, as today.
- `diagnostics` says `character: Y` rather than `speaking: Y`, for the same reason.
- `voice_key` doesn't read the look when the map is empty, so that path is exactly today's.
- The fetch after a save runs for a look change only if some character has a voice, so a colour change can't retry a
  failed download of your own voice.
- The select rebuilds its options only when they change, so a redraw during a download can't close an open list.
- Choosing an undownloaded preset ticks the same "downloading that voice" line as a chip.
- Added tests: `synth` really uses espeak for Robot under pins; the select's node is kept.

## Rollback

Revert the code PR and bump the flake again. A saved `voice_by_character` becomes an ignored key, and `voice` and
`voice_by_lang` were never changed, so nothing needs repair.
