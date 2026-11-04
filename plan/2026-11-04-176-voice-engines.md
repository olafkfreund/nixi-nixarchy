---
status: approved
issue: 176
spec: spec/2026-11-04-176-voice-engines.md
coders:
  1: codex   # the ElevenLabs client: key handling, HTTP, redirect refusal (security logic)
  2: coder   # engine choice, settings keys and state: careful but plain
  3: codex   # speak_sentence, cap reservation, speaker generations and off (concurrency)
  4: agy     # large page change: Voice tab engine chips, ElevenLabs section, page path
  # 5: dropped (the existing api-elevenlabs secret is reused; see revisions)
reviewers:
  - codex    # second model on the diff, read-only
  - agy      # second model on the key handling, the cap and off/fallback races, read-only
---

# Plan: Choose the speech engine, and optional ElevenLabs voices

## Approved decisions (the spec plus its binding revisions)

- **Code:** fork `olafkfreund/nixoarchy-snowflake`, branch
  `feat/176-voice-engines`, worktree `../nixoarchy-snowflake-176`; and
  `nixos_config` (step 5) in its own worktree. Line numbers are from the code
  map; re-find them by name.
- **Settings keys** (`/api/settings`, 5454):
  - `tts` ∈ `auto|kokoro|piper|espeak|elevenlabs|off`;
  - `tts_fallback` ∈ `auto|kokoro|piper|espeak`;
  - `eleven_voice` matching `^[A-Za-z0-9]{10,40}$`;
  - `eleven_daily_chars` from 1 000 to 500 000 (default 20 000);
  - `eleven_on`, accepted only with `confirm: "cloud"`;
  - `tts: elevenlabs` is refused unless `eleven_on` is set and a voice is
    chosen.
- **Exact engines:** `synth(text, engine=None, local=False)`. The swaps at
  3922, 3929–3933 and 3942 happen only under `auto`. Explicit choices raise
  `NoVoice(reason)`.
  - `state_info` gains `engines: [{id,label,ready,reason}]`, `tts_choice`,
    `tts_fallback` and `eleven: {key,on,voice,used_today,cap,voices,error}`.
    It never contains the key.
  - Robot is disabled under explicit kokoro or piper.
  - Explicit piper with `piper_voice` set uses that file.
- **`app/eleven.py`:**
  - **`_key()`:** `realpath` of `CFG.get("eleven_key_file",
    "/run/agenix/elevenlabs-api-key")`. The result must be under
    `/run/agenix.d/`, `/run/secrets/` or `$CREDENTIALS_DIRECTORY`, or equal
    to the configured path when that path isn't a symlink. It is opened with
    `O_NOFOLLOW` as a regular file of at most 256 bytes, owned by the user or
    root; read per request, never cached, logged or put in `os.environ`.
    `has_key()` returns a bool.
  - **HTTP:**
    - host `api.elevenlabs.io`, header `xi-api-key`, an injectable `urlopen`;
    - 1.5 s to connect and first byte, 4 s per sentence in total;
    - errors become `ElevenError(kind)` with a message built only from the
      kind and status;
    - status map: 401/403 → `auth`; 429 → `quota`, retried once after a
      `Retry-After` of at most 2 s; 402 → `quota`; 404 or 422 → `bad_voice`;
      5xx and timeouts → `network`.
  - **`voices()`:** `GET /v1/voices`, cached 24 h in
    `DATA_DIR/eleven-voices.json`. Per voice: `{id, name, category,
    description ≤ 120, accent, languages, preview_url}`.
  - **`speak()`:** `POST /v1/text-to-speech/{voice}?output_format=pcm_22050`
    with `model_id: "eleven_flash_v2_5"`, one sentence per request. The PCM
    is wrapped as a WAV for `tidy_full`.
  - **`preview(voice_id)`:**
    - only for a voice in the cached list;
    - its `preview_url` must be `https://storage.googleapis.com:443/...`;
    - redirects are refused with a raising redirect handler;
    - at most 1 MB + 1 byte read, a 5 s timeout, content type `audio/mpeg`
      or `audio/wav`.
- **Usage:** `DATA_DIR/eleven-usage.json` `{date, used, reserved}`, written
  atomically under a lock.
  - **Before sending:** require `used + reserved + n ≤ cap`, then add `n` to
    `reserved`.
  - **Success:** move it to `used`.
  - **Definite failure before sending:** release it.
  - **Timeout or reset after sending:** count it as used.
  - A new date resets the counts. Previews never reserve.
- **`speak_sentence(text, gen, reply)`:** one function for both playback
  paths, `Speaker` and `/api/tts`. It does the engine choice, the
  reservation, the cloud call, then the fallback to `tts_fallback` (returned
  as normal audio). A note is published once per kind per day. `auth`,
  `cap` and `bad_voice` stick until the reply id changes.
- **Generations:**
  - each queue item carries `(engine, gen, reply)` when `say()` enqueues it;
  - the maker (3623) checks the item's `gen` against the current one right
    before sending, under the condition lock. A stale cloud item is dropped
    without a request; a stale local item is spoken with the current
    engine;
  - turning ElevenLabs off or changing `tts` bumps `gen`, stops the current
    player (the existing `Speaker.stop()` path: it ends `paplay` and releases
    the floor), and publishes `spk_done` for the dropped item;
  - **the page path:** a `tts_gen` bus event and the `gen` in the settings
    response let the page drop queued and decoded clips from an older
    generation.
- **The preview route:** `GET /api/eleven/preview/<voice_id>`, authenticated
  with `X-Nixi-Token`. The page `fetch()`es it and plays a `blob:` URL.
- **Local only:** `warm_tts()`, `stress_voice()` (including its `say` loop)
  and the startup log use `local=True`; under `elevenlabs` that means
  `tts_fallback`.
- **Diagnostics:** "elevenlabs: on/off, key present/absent, used n/cap",
  and `tts first-sound ms`.
- **Page:**
  - the engine chips (with disabled reasons);
  - an ElevenLabs section, always visible, holding:
    - the key status and how to add one;
    - the on switch with the notice ("What he says out loud is sent to
      ElevenLabs. That can include anything in his answers.") and confirm;
    - the off note ("Text already sent may still count on your ElevenLabs
      account.");
    - the voice list with ▶ Preview and Choose;
    - the usage bar and the cap field;
    - the fallback chips;
  - every cloud-provided field is built with `textContent`/`hx()`, and the
    existing voice grid (3179) moves to the same builder;
  - ☁ on the caption plate while ElevenLabs speaks; the hint line says
    "Speaking with ElevenLabs (cloud)".
- **Key delivery:** `nixos_config` declares `age.secrets.elevenlabs-api-key`
  (owner `olafkfreund`, mode `0400`) on p620 and razer. The companion's
  default `eleven_key_file` is `/run/agenix/elevenlabs-api-key`, so no
  companion setting changes. The user creates the encrypted file.

## Steps

Each step is one commit, made by the lead after checking. Fork tests run from
`tests/`. Name the step in the commit.

**1. The ElevenLabs client** — codex
- `app/eleven.py` (new), per the decisions: `_key`, `has_key`, `voices`,
  `speak`, `preview`, `ElevenError`, the usage reservation functions
  (`reserve`, `settle(ok, sent)`, `today()`).
- Tests: `tests/test_eleven.py`, all with a stubbed `urlopen`:
  - the key: an agenix-like symlink layout is accepted; a symlink to
    `$HOME/x` is refused; missing → `has_key` false; over 256 bytes is
    refused;
  - the voice list is parsed and cached, and an expired cache refreshes;
  - `speak` returns a WAV that `tidy_full` times;
  - the status map, including the 429 retry once;
  - error text never contains the key (assert on a known fake key);
  - usage:
    - two concurrent reservations at the cap → one refused;
    - a timeout after sending is counted;
    - a refused connection is released;
    - a new date resets;
  - preview:
    - the host allowlist;
    - a 302 to `http://127.0.0.1` is refused;
    - 1 MB + 1 byte is refused;
    - a wrong content type is refused;
    - an unknown voice id is refused.
- Check: `python3 -m unittest test_eleven`.
- Traps:
  - never put the key in an exception's args;
  - `urllib` follows redirects by default;
  - `os.open` with `O_NOFOLLOW` on the realpath, not the link.

**2. Engine choice, settings and state** — coder
- `app/server.py`:
  - the settings keys and validation (5454 ff.);
  - `tts_engine()` with `elevenlabs` (3208);
  - `synth(text, engine=None, local=False)` with `NoVoice` and swaps only
    under `auto` (3912–3945);
  - `state_info` additions (5193 ff.);
  - Robot and explicit-piper readiness in `voices`;
  - `warm_tts`, `stress_voice` and the startup log made local (3403, 3849,
    6129);
  - the diagnostics lines (3182, 5163).
- Tests:
  - `tests/test_tts_engine.py` (new):
    - an explicit engine never swaps, and `auto` keeps the swaps;
    - `elevenlabs` gives `None` until it is on, a key exists and a voice is
      chosen;
    - `warm_tts` and `stress_voice` never import or call `eleven.speak`;
  - `tests/test_settings_176.py` (new):
    - the keys are validated;
    - `eleven_on` without `confirm` is refused;
    - `tts: elevenlabs` before on is refused;
    - `state_info` has `engines` with reasons, and a recursive search finds
      no key value;
  - the environment builders for claude (4203) and the bridge (4308)
    contain no `ELEVEN*` variable.
- Check: `python3 -m unittest test_tts_engine test_settings_176 test_floor_wiring test_speakable`.
- Traps: `CFG` defaults (162 ff.) need the new keys; BRIDGED mode pops some
  keys in settings, so check these aren't affected.

**3. Speaking through it: one sentence path, generations, off** — codex
- `app/server.py`:
  - `speak_sentence()`, used by the `Speaker` maker (3623) and `/api/tts`
    (5361);
  - queue items carry `(engine, gen, reply)`;
  - the generation check under the condition lock;
  - off and engine change: bump `gen`, `Speaker.stop()`, `spk_done` for the
    dropped item, the `tts_gen` bus event;
  - the reply boundary for sticky errors;
  - the notes once per kind per day;
  - `/api/eleven/preview/<voice_id>` (token-authenticated);
  - the first-sound timing in diagnostics.
- Tests (`tests/test_floor_wiring.py` extended, plus
  `tests/test_eleven_speaker.py` new):
  - a failing cloud sentence is spoken by the fallback once, with no repeat,
    the mouth timing present, and the note once;
  - `auth` sticks until a new reply;
  - off mid-sentence stops the player, releases the floor and sends
    `spk_done`;
  - a stale queued cloud item never calls `speak`, while a stale local item
    still speaks;
  - `/api/tts` in page mode uses the same fallback;
  - the preview route returns 403 without the token and plays with it;
  - nothing reaches `eleven.speak` while `eleven_on` is false.
- Check: `python3 -m unittest test_eleven_speaker test_floor_wiring test_eleven test_tts_engine`.
- Traps:
  - the maker calls `synth` outside the condition lock, so capture the
    generation inside it;
  - don't drop local items on a cloud-only change.

**4. Settings → Voice and the page path** — agy
- `app/static/index.html`:
  - the Voice tab (844–853), with the engine chips and the ElevenLabs section
    per the decisions;
  - the voice grid (3179) and the ElevenLabs list built with
    `textContent`/`hx()`;
  - Preview through `fetch` with the token and a `blob:` URL;
  - Choose; the usage bar; the cap field; the fallback chips;
  - the ☁ on the caption plate while ElevenLabs speaks;
  - the hint line;
  - the page playback path (`enqueue`, 1835): track the generation and drop
    stale clips on `tts_gen`.
- Tests (`tests/voice_fit.mjs` + `tests/test_voice_fit.py`, new; headless
  `--disable-gpu`; stubbed server responses):
  - the chips with disabled reasons;
  - the ElevenLabs section is visible before the engine is chosen;
  - the notice and confirm come before on;
  - Preview plays from its own origin without changing the setting;
  - Choose posts `eleven_voice`;
  - a voice named `<img src=x onerror=alert(1)>` renders as text;
  - the usage bar; the ☁ while speaking;
  - stale clips are dropped after `tts_gen`;
  - no request leaves the page's origin.
- Check: `python3 -m unittest test_voice_fit test_settings_fit`. The latter
  exists only if #175 has landed; otherwise just `test_voice_fit`.
- Traps:
  - #175 also edits the Settings markup. Whichever lands second merges and
    re-runs both page tests;
  - agy edits with its file tools; headless Chromium only.

**5. The secret in nixos_config** — coder
- `~/.config/nixos` worktree, `feat/176-elevenlabs-secret`:
  - `secrets.nix`: `"secrets/elevenlabs-api-key.age".publicKeys = allUsers ++
    [ p620 razer ];` (follow the file's existing pattern);
  - `hosts/common/nixos/omarchy-nixi-companion.nix`: `age.secrets.elevenlabs-api-key
    = { file = ../../../secrets/elevenlabs-api-key.age; owner = "olafkfreund";
    mode = "0400"; };`, guarded by `lib.mkIf (builtins.pathExists …)`, so
    the build passes before the user has created the file.
- Check: `nix eval` / build `.#nixosConfigurations.p620.config.system.build.toplevel`
  with and without the file present (a dummy, never committed).
- Traps:
  - never commit a plaintext key, or a fake key as an `.age` file;
  - `~/.config/nixos` stays on main, and the work happens in a worktree.

**6. Review, PR, deploy, live check** — lead
- The fork's full suite and `nix build`.
- Reviews:
  - a fresh Opus agent (this plan plus the diff);
  - `codex review --base origin/main`;
  - agy `--mode plan` on the key handling, the cap and the races.

  Fix and commit.
- PRs (fork, then nixos_config), each with `@codex review`; merge.
- Bump `nixi-companion` and deploy from a clean worktree, announced on the
  bus; restart the companion.
- **The user creates the key** (the lead gives the command, and never handles
  the key):

  ```bash
  agenix -e secrets/elevenlabs-api-key.age
  ```

  The user commits and pushes that, then the lead deploys again.
- Live on p620 (ai-mirror control, the user approves):
  1. the engine chips show readiness;
  2. ElevenLabs: notice → on → voices → Preview (usage unchanged) → Choose →
     the ElevenLabs engine;
  3. he speaks, the mouth matches, the ☁ shows, and usage goes up;
  4. blocking `api.elevenlabs.io` (a test nft rule) → the fallback voice and
     one note;
  5. off mid-sentence → it stops, and the next reply is local;
  6. an explicit piper with its model missing → a visible reason.

## Tests

| Command | Expected |
|---|---|
| fork, from `tests/`: `python3 -m unittest discover -s .` | all pass |
| fork: `nix build .#nixi-companion` | builds |
| nixos_config: build p620 and razer toplevel | builds, with and without the secret file |

## Rollback

- Users: set the engine to Automatic, or switch ElevenLabs off.
- Code: revert the fork merge, or roll back the bump.
- The secret declaration is guarded and harmless without the file.

## Deviations (made during implementation)

- **Step 1:** `settle(n, ok, sent)` takes the reserved length explicitly, so
  concurrent requests settle the right counts. Also added: the key kinds
  `key` and `preview` for refusals.

## Revisions after review (binding; these override the steps above where they differ)

Codex (gpt-6-sol) and agy (model not reported) reviewed the draft. Each
finding was checked against the code and `nixos_config`.

1. **Reuse the existing key; step 5 is dropped.** `nixos_config` already
   declares `secrets/api-elevenlabs.age` for all hosts
   (`modules/secrets/api-keys.nix` 63; `secrets.nix` 27). It is used by
   omarchy-voice and is mounted at `/run/agenix/api-elevenlabs`: a regular
   file, mode 0400, owned by the user, present on p620 today.
   - The companion's default `eleven_key_file` becomes
     `/run/agenix/api-elevenlabs`.
   - There is no new secret and no `nixos_config` change. The user doesn't
     need to add a key.
   - This deviates from the spec's example path, not from its rule (an agenix
     file, never in the environment).
2. **Key path rules** (they tighten spec revision 2):
   - the realpath must be under `/run/agenix/`, `/run/agenix.d/`,
     `/run/secrets/`, or `$CREDENTIALS_DIRECTORY` **only when that variable
     is set and non-empty**;
   - the "equal to the configured path" clause is dropped, so a changed
     `config.json` can't point the header at an arbitrary user file;
   - it is opened `O_RDONLY|O_NOFOLLOW` on the realpath, and `os.fstat(fd)`
     checks a regular file, `0 < size ≤ 256`, and an owner of root or the
     user.
3. **Off can't start a cloud request after it returns.**
   - The maker takes the condition lock, checks the item's `gen`, marks the
     item `sending`, and only then releases the lock and calls the API.
   - Off takes the same lock and bumps `gen`, so any item not yet marked
     `sending` will never send. An item already `sending` is in flight: its
     audio is discarded, and it is counted by the usage rule.
   - **The page path:** `/api/tts` does the same check under the same lock,
     via `speak_sentence`.
   - Test: off is called between the check and the send, using an event
     injected in a fake `speak`, and no second request is made.
4. **Off and engine changes don't use `Speaker.stop()`.** It clears every
   `todo`/`ready` item (3604). A new `Speaker.cut_cloud(gen)`:
   - stops the current player only if the current item is a cloud item;
   - drops only cloud items from `todo` and `ready`, publishing `spk_done`
     for each so the page clears `spkMap`;
   - re-synthesises local items with the current engine.

   A switch between local engines changes nothing in the queue. Tests cover:
   - local → local keeps the queue;
   - cloud → off keeps local items, and the page captions clear.
5. **The reply id, end to end.**
   - The page sends `reply` (the id of the answer being spoken, which it
     already tracks for captions) with every `/api/say` and `/api/tts` call.
   - The server stores it on the queue item.
   - `ask()` (a new turn) clears the sticky errors. A new `reply` id clears
     them too.
   - Step 4 (page) and step 3 (server) share this contract. Step 3 adds the
     server side; step 4 adds the page side and a test.
6. **One deadline per sentence.**
   - The deadline is `t0 + 4 s`. A 429 is retried once only if
     `Retry-After ≤ 2 s` and the remaining time is at least `Retry-After + 1.5
     s`.
   - Each attempt's socket timeout is `min(1.5, remaining)` for connect and
     first byte, then the body is read until the deadline.
   - Tests use a fake clock and a fake `urlopen` that sleeps, to prove the
     1.5 s first byte and the 4 s total, including the retry.
7. **Approved behaviours now named in the steps and checks:**
   - an unknown or deleted `eleven_voice` → "voice no longer on your
     account", and the fallback (steps 1 and 3);
   - explicit espeak offers Robot plus an espeak voice for each preset
     (step 2);
   - the `/api/settings` refusals return `400 {"error": "<sentence>"}`, which
     the page shows under the control (steps 2 and 4);
   - `stress_voice`'s `say` loop test moves to step 3, where the speaker
     changes land.
8. **Step 2 BRIDGED note:** the new keys are client-side settings and are not
   popped in BRIDGED mode. A test confirms they persist there.
