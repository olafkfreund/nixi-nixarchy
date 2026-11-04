---
status: draft
issue: 176
author: olafkfreund
---

# Intent: Choose the speech engine, and optional ElevenLabs voices

## Problem

Settings → Voice offers seven preset voices (Girl, Cute, Guy, Deep, British,
Storyteller, Robot). The engine behind them is picked automatically:
Kokoro if it is installed, else piper, else espeak (`CFG["tts"] = "auto"`,
`tts_engine()` in `app/server.py`). It can only be changed in the config
file. The hint even says to run `./install.sh` for "the nicer Kokoro
voices", without saying which engine is in use now.

The user would also like ElevenLabs voices: a cloud engine with much more
natural voices, used only if they choose it.

## Proposed outcome

- Settings → Voice shows which engine speaks now, and lets the user pick one:
  Automatic, Kokoro, piper, espeak, ElevenLabs, or Off. An engine that isn't
  installed or set up is shown but can't be picked, with a short reason.
- The voice grid shows that engine's voices, so each preset is something the
  engine really has. Tap to hear it, as today.
- **ElevenLabs is off until the user turns it on and gives a key.** Then:
  - the user's ElevenLabs voices are listed and can be picked, and tapping one
    plays a sample;
  - Nixi speaks with it, and the user can see it is a cloud voice whenever
    it is selected;
  - if ElevenLabs fails (no network, quota, bad key), he falls back to the
    local engine for that reply and says why once, never silently.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`: `app/server.py` (the engines, the
  config, the speech path), `app/static/index.html` (Settings → Voice), and
  the tests.
- The API key's storage: `nixos_config` (agenix, or 1Password through `op`) and
  the companion's service environment, on p620 and razer.
- Privacy: with ElevenLabs on, the text he speaks leaves the computer.

## Constraints

- **Must:** ElevenLabs is opt-in. Nothing is sent to ElevenLabs until the user
  turns it on and a key exists. Turning it off stops all requests at once.
- **Must:** the API key never sits in the config file, the page, a log, the
  agent's prompt or a Nix store path. It is read from a secret at run time
  (`nixos-secrets`), and the page only learns whether a key exists.
- **Must:** only what he would say aloud is sent, after the existing
  `speakable()` clean-up (paths, code and URLs are already spoken in plain
  words). Never the conversation, file contents or screenshots.
- **Must:** speaking never blocks or breaks when the cloud fails. A local
  engine takes over within a short timeout.
- **Must:** every engine choice is respected exactly. "Off" means silence, and
  "piper" never quietly becomes Kokoro.
- Keep the existing presets and the lip-sync timing working for the local
  engines.

## Open questions

1. **Where the key comes from.** Recommended: an agenix secret
   (`/run/agenix/elevenlabs-api-key`), declared in `nixos_config` and passed to
   the companion as a file path, the same way other services get secrets. The
   other option is `op read` from 1Password at start, which needs the
   1Password agent to be unlocked.
2. **Which ElevenLabs voices.** Recommended: the voices on the user's own
   account (`/v1/voices`), cached for a day, plus a "default" pick. The other
   option is a fixed list of premade voices.
3. **Model and cost.** Recommended: ElevenLabs' fast low-latency model,
   streamed, with a per-day character cap in the config (default 20 000) so a
   chatty day can't run up the bill. Past the cap, he falls back to local and
   says so once.
4. **Engine choice per host?** Recommended: one setting, synced like the other
   settings. A host without the secret shows ElevenLabs as not set up.
