---
status: approved
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
  - the user's ElevenLabs voices are listed (name, accent or description,
    and the languages it speaks). **Each can be previewed before choosing**:
    tapping plays ElevenLabs' own preview clip for that voice. It costs no
    characters and sends none of the user's text. Choosing is a separate,
    explicit action;
  - Nixi speaks with it, and the user can see it is a cloud voice whenever
    it is selected;
  - if ElevenLabs fails (no network, quota, bad key, the daily cap), the
    **fallback voice** speaks instead: the local engine the user picks for
    this, Automatic by default. He says why once per failure kind, never
    silently. If a sentence fails part-way, the fallback picks up at the next
    sentence; it never repeats a sentence already heard. With no local engine
    ready, he stays quiet and shows the text, as today with `tts: off`.
- Before turning ElevenLabs on, Settings says plainly: "What he says out loud
  is sent to ElevenLabs. That can include anything in his answers." The
  user confirms once.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`: `app/server.py` (the engines, the
  config, the speech path), `app/static/index.html` (Settings → Voice), and
  the tests.
- The API key's storage: `nixos_config` (agenix, or 1Password through `op`) and
  the companion's service environment, on p620 and razer.
- Privacy: with ElevenLabs on, the text he speaks leaves the computer.

## Constraints

- **Must:** ElevenLabs is opt-in. Nothing is sent to ElevenLabs until the user
  turns it on and a key exists. Turning it off has three effects:
  - queued cloud speech is dropped;
  - a request already in flight is cancelled, its audio is not played, and
    nothing new starts;
  - text already sent may still have been counted by ElevenLabs. Settings
    says so.
- **Must:** only real speech the user hears goes to the cloud. The warm-up
  synthesis Nixi does on his own (`warm_tts`, `stress_voice`, the start-up
  checks) always uses a local engine, so it costs nothing and sends nothing.
- **Must:** the API key never sits in the config file, the page, a log, the
  agent's prompt, a Nix store path, **or any process environment**. Nixi
  starts agents (`claude`, the bridge) and tools that inherit its
  environment. The key is read from the secret file only at the moment of a
  request. Error messages and diagnostics never echo it or the request
  headers. The page only learns whether a key exists.
- **Must:** only what he would say aloud is sent, after the existing
  `speakable()` clean-up (paths, code and URLs become plain words). Never the
  conversation history, screenshots or attachments. **But** `speakable()`
  doesn't detect secrets, so a reply that reads out something sensitive
  sends it. That is the disclosure the user confirms above.
- **Must:** speaking never blocks or breaks when the cloud fails. A local
  engine takes over within a short timeout.
- **Must:** every engine choice is respected exactly. "Off" means silence. A
  local engine the user picked is never swapped for another: today `synth()`
  can turn a Kokoro preset into piper or espeak, and a missing piper preset
  can use another installed voice. If the picked engine can't speak, that is
  shown, not hidden by a switch.
- **Must:** the mouth and captions follow the audio actually heard, for every
  engine. Time to first sound is about the same as today's local voices
  (well under 2 s for a short sentence).
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
3. **Model and cost.** Recommended: ElevenLabs' fast low-latency model. A
   per-day character cap (default 20 000) can't be exceeded, so a chatty day
   can't run up the bill:
   - it counts only real speech, never previews (those are ElevenLabs' free
     clips);
   - it counts per host;
   - it survives a restart;
   - it is shown and changeable in Settings → Voice.

   Past the cap, the fallback voice speaks and he says so once. Whether to
   stream audio or fetch it sentence by sentence is for the spec. Either way
   the lip-sync rule above holds.
4. **Engine choice per host?** Recommended: one setting, synced like the other
   settings. A host without the secret shows ElevenLabs as not set up.
5. **Languages.** ElevenLabs voices are multilingual. The language choice
   itself is #177. This task only shows each voice's languages and leaves
   room for #177 to pick one.

## Reviews (2026-11-04)

- **Codex** (gpt-6-sol). All folded in:
  - confirmed: the privacy promise was too strong;
  - confirmed: "off" needed an in-flight rule;
  - confirmed: streaming, fallback and lip-sync needed one outcome;
  - confirmed: the cap's scope;
  - confirmed: which voice the fallback uses;
  - confirmed: `synth()` silently swaps engines today.
- **agy** (model not reported). All folded in:
  - confirmed: the key must not be in any environment, because child
    agents inherit it;
  - confirmed: lip-sync needs whole-sentence audio;
  - confirmed: the engine swaps;
  - confirmed: the fallback was underspecified;
  - confirmed: `speakable` doesn't scrub secrets;
  - confirmed: warm-up synthesis would cost cloud characters.
- **The user (mid-review):** previews before choosing; a language choice
  (split out as #177).
