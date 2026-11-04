---
status: approved
issue: 176
intent: intent/2026-11-04-176-voice-engines.md
---

# Spec: Choose the speech engine, and optional ElevenLabs voices

Code: `olafkfreund/nixoarchy-snowflake` `main`. Line numbers are from the code
map of 2026-11-04 (`app/server.py` 6146 lines, `index.html` 3760).

## Design

### 1. The engine is a setting, and the choice is exact

- **`/api/settings`** (`server.py` 5454) gains four keys, each validated:
  - `tts` ∈ `auto | kokoro | piper | espeak | elevenlabs | off`;
  - `tts_fallback` ∈ `auto | kokoro | piper | espeak`, default `auto`;
  - `eleven_voice`, an ElevenLabs voice id matching `^[A-Za-z0-9]{10,40}$`;
  - `eleven_daily_chars`, an int from 1 000 to 500 000, default 20 000.

  `tts` is in `CFG` today (162) but can't be set from the page.
- **`tts_engine()`** (3208) adds `elevenlabs`: chosen, switched on (see 3), and
  a key file readable. Explicit modes already return `None` when their engine
  is missing, so there is no cross-engine swap at this level.
- **`synth(text, engine=None, local=False)`** (3912) takes the engine to use
  explicitly. The silent swaps in it happen **only under `auto`**:
  - (a) Kokoro → piper/espeak for a preset without a Kokoro voice (3922);
  - (b) "any downloaded piper model" while the preset's model downloads
    (3929–3933);
  - (d) espeak when piper has no model (3942).

  With an explicit `kokoro`, `piper` or `espeak` they raise `NoVoice(reason)`
  instead. The speaker reports it (`spk_skip` with the reason, shown once as
  a note) rather than switching.
- **`state_info()`** (5193) gains `engines`: one entry per engine, `{id,
  label, ready, reason}`. Example reasons: "not installed", "voice
  downloading", "no key — see Settings help", "off". It also gains
  `tts_choice` (the setting), `tts_fallback`, and the `eleven` block (section
  3). `tts` stays the engine in use.
- **The voice grid** (`voices`, 5221–5226) lists the presets the chosen engine
  can really say. Under `kokoro`, Robot (espeak-only) is shown disabled with
  "espeak voice". Under `elevenlabs`, the grid is replaced by the ElevenLabs
  list (section 4).

### 2. The ElevenLabs client: `app/eleven.py` (new)

- **Key:**
  - `key_path()` is `CFG["eleven_key_file"]` (default
    `/run/agenix/elevenlabs-api-key`).
  - `_key()` opens it per request with `O_NOFOLLOW`, as a regular file of at
    most 256 bytes, strips it, and returns it. It is never cached in a module
    global, never logged, never put in `os.environ`, and never in `CFG`.
  - `has_key()` only checks that the file is readable. That bool is all the
    page sees.
- **HTTP:**
  - `urllib.request` with an injectable `urlopen`, as Ambient does (1477), so
    tests stub it;
  - host `api.elevenlabs.io` only, with the header `xi-api-key`;
  - timeouts of 4 s for the voice list and 6 s per sentence;
  - on any error it raises `ElevenError(kind)`, where `kind` ∈ `network | auth
    | quota | cap | bad_voice | other`. The message is built from the kind and
    the HTTP status only, never from response headers or the request.
- **Voices:** `voices()` calls `GET /v1/voices` and caches it for 24 h in
  `DATA_DIR/eleven-voices.json`. Per voice it keeps `{id, name, category,
  description (≤ 120), accent, languages (verified_languages codes),
  preview_url}`. A deleted or unknown `eleven_voice` shows "voice no longer on
  your account", and speech uses the fallback.
- **Speech:**
  - `speak(text, voice)` calls `POST /v1/text-to-speech/{voice}?output_format=pcm_22050`
    with `{"text": text, "model_id": "eleven_flash_v2_5"}`, one sentence per
    request, as the speaker already chunks;
  - the raw 16-bit PCM is wrapped as a WAV, so `tidy_full` (3429) trims and
    times the words exactly as for local engines. Lip-sync and `dur` then
    follow the audio actually played;
  - no streaming in v1: a sentence is a few hundred milliseconds of synthesis
    with the flash model, which meets the "well under 2 s" first-sound goal.

### 3. Turning it on, the cap, and turning it off

- **On:**
  - `eleven_on` is set only by `POST /api/settings {"eleven_on": true,
    "confirm": "cloud"}`. The page sends that after its notice: "What he says
    out loud is sent to ElevenLabs. That can include anything in his
    answers."
  - Choosing `tts: elevenlabs` while `eleven_on` is false is refused with
    "turn on ElevenLabs first".
  - The state carries `eleven: {key, on, voice, used_today, cap, voices,
    error}`.
- **The cap:** `DATA_DIR/eleven-usage.json` holds `{"date": "YYYY-MM-DD",
  "chars": n}`, written atomically under a lock, so it survives restarts and
  counts per host.
  - Before a request: if `n + len(text) > cap`, it raises `cap`.
  - After a successful request: `n += len(text)`.
  - Previews never count (section 4).
- **Off:** setting `eleven_on: false`, or `tts` to another engine:
  - bumps a generation counter in the speaker;
  - clears queued sentences that were made for ElevenLabs;
  - a request already in flight finishes in its thread, but its audio is
    dropped at the generation check before playing. `urllib` can't abort a
    socket safely; nothing new starts.

  The notice on the off switch says "Text already sent may still count on
  your ElevenLabs account."
- **Fallback:**
  - when `speak()` raises, that sentence is synthesised with `tts_fallback`
    (local only);
  - the next sentences try ElevenLabs again, except after `auth`, `cap` or
    `bad_voice`, which stick for the reply;
  - he says the reason once per kind per day as a short note: "ElevenLabs
    didn't answer, so I'm using my own voice.";
  - a sentence is never repeated, because the fallback covers only the
    sentence that failed;
  - if the fallback can't speak either: `spk_skip`, and the text stays on
    screen.

### 4. Settings → Voice

- **Engine row:** chips for Automatic, Kokoro, piper, espeak, ElevenLabs and
  Off, from `engines`. A disabled chip shows its reason on hover and focus.
  The current engine is marked, and the hint line says which engine is
  speaking now.
- **With ElevenLabs chosen**, an ElevenLabs section replaces the preset grid:
  - **Status:** key found or not. Without a key it shows how to add one: an
    agenix secret, and the `nixos_config` option in section 5.
  - **On/off switch:** with the notice and confirmation before turning on.
  - **Voice list:** name, accent, short description and language codes. Each
    row has **▶ Preview** and **Choose**.
    - Preview fetches ElevenLabs' own sample through the server,
      `GET /api/eleven/preview/<token>`. The token maps to that voice's
      `preview_url`, allowlisted to `https` on ElevenLabs' sample host from
      the voice list, ≤ 1 MB, with a 5 s timeout. It plays in the page with
      `<audio>`.
    - Preview costs no characters, sends no user text, and doesn't change
      the setting.
    - Choose sets `eleven_voice`.
  - **Usage:** "Used 3 210 of 20 000 characters today" with a bar, and the cap
    as a number field.
  - **Fallback voice:** chips for Automatic, Kokoro, piper and espeak.
- **"Tap to hear" for local presets stays as it is** (3340: save, then say a
  line). It is local, so it costs nothing.

### 5. Getting the key to the companion

- **`nixos_config`:**
  - an agenix secret `secrets/elevenlabs-api-key.age` for the user's host
    keys (p620, razer), `owner = <user>`, `mode = "0400"`;
  - the Nixi home-manager or companion module passes the **path** as
    `eleven_key_file` in the companion's config, never the value.
  - The user creates the secret with `agenix -e`; it isn't in this repo's
    tests.
- **The value never reaches a child process.** It is read only inside
  `eleven._key()` for the request headers. Nothing is added to `os.environ`.
  The claude (4203) and bridge (4308) environments are unchanged, and a test
  asserts no `ELEVEN` variable is in either.

### 6. Only real speech uses the cloud

- `warm_tts()` (3403), `stress_voice()` (3849) and the startup log (6129) call
  `synth(..., local=True)`. Under `elevenlabs` they use `tts_fallback`.
- `doctor()` (3182) and `diagnostics()` (5163) print `elevenlabs: on/off, key
  present/absent, used n/cap`. Never the key or the path's contents.

## Alternatives rejected

- **Streaming audio over WebSocket or chunked HTTP:** `tidy_full` needs a
  whole sentence to time the words. Per-sentence requests with the flash
  model meet the latency goal without a second timing path.
- **The key in an environment variable:** the agent and bridge inherit it
  (4203, 4308).
- **The key in `config.json`:** the config is shown in diagnostics and is a
  plain file in the home directory.
- **1Password `op read` at start:** it needs an unlocked agent at boot, and
  holds the key in memory for the process lifetime.
- **A fixed list of premade voices:** the user wants their own account's
  voices, including clones.
- **The page fetching `preview_url` itself:** that is a request from the page
  to a third party. The server proxies it, allowlisted.

## Risks

- **ElevenLabs' API changes** (model id, output format): kept in one module;
  a failure falls back to local, with a note.
- **Cost:** capped per host per day. Two hosts can each use the cap. That is
  documented next to the cap field.
- **Privacy:** confirmed by the user at opt-in. Text after `speakable()` can
  still contain secrets.
- **Removing the silent swaps for explicit choices** can make an explicitly
  set piper (or Kokoro) silent where it used to quietly use another voice.
  That's intended; the reason is shown. `auto` keeps the old forgiving
  behaviour, and it is the default.
- **The PCM sample rate (22 050 Hz)** differs from piper's. The player already
  takes the rate per clip (`audio_player_cmd(rate)`, 3528).

## Verification

- **Unit** (`tests/test_eleven.py`, new; `urlopen` stubbed, a temp key file):
  - key read per call; a missing or symlinked key gives `has_key` false;
  - the voice list is parsed and cached, and an expired cache refreshes;
  - `speak()` returns a WAV that `tidy_full` times;
  - each error kind maps correctly; the error text never contains the key;
  - the cap blocks at the limit, survives a reload of the usage file, and
    resets on a new date;
  - previews never touch usage;
  - preview host allowlist and size cap.
- **Engine** (`tests/test_tts_engine.py`, new; `synth` internals stubbed):
  - an explicit kokoro, piper or espeak never swaps (raises `NoVoice`), while
    `auto` keeps the swaps;
  - `elevenlabs` with `eleven_on` false or no key → `tts_engine()` None;
  - `warm_tts` and `stress_voice` never call `eleven.speak`.
- **Speaker** (`tests/test_floor_wiring.py`, extended):
  - a failing ElevenLabs sentence is spoken by the fallback once, with no
    repeat, and the note once per kind;
  - off mid-reply drops the queued cloud sentences and the in-flight audio;
  - `auth` sticks for the reply.
- **Settings** (`tests/test_settings_176.py`, new): the new keys are validated;
  `eleven_on` without `confirm` is refused; `tts: elevenlabs` before on is
  refused; `state_info` has `engines` with reasons and no key value anywhere.
- **Environment:** the claude and bridge env builders contain no `ELEVEN*`
  variable, and nothing writes to `os.environ`.
- **Page** (`tests/voice_fit.mjs` + `test_voice_fit.py`, new, headless
  `--disable-gpu`):
  - engine chips render with disabled reasons;
  - the ElevenLabs section: the notice and confirm before on; Preview plays
    from `/api/eleven/preview/…` (own origin) without changing the setting;
    Choose posts `eleven_voice`;
  - the usage bar; the fallback chips;
  - no request leaves the page's origin.
- **Full suite and `nix build`**, and `nix build` of `nixos_config` for p620
  and razer with the secret declared.
- **Live on p620**, after the user has added the key:
  1. the engine chips show which engines are ready;
  2. ElevenLabs: the notice, on, the voice list, Preview plays and nothing
     counts, Choose; he speaks with it, the mouth matches, and usage goes up;
  3. block `api.elevenlabs.io` with a test firewall rule: the fallback voice
     speaks with one note;
  4. off: he speaks locally at once;
  5. an explicit piper with its model missing gives a visible reason, not a
     silent other voice.

## Approval (2026-11-04)

The user approved this spec while the Codex and agy reviews were still
running. Real findings from those reviews will be added as a "Revisions after
review" section. Any that change the design are shown to the user before the
plan.
