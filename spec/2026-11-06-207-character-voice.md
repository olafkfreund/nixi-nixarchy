---
status: draft
issue: 207
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: a voice for each character

The first slice of #206. All code is in `olafkfreund/nixoarchy-snowflake`, at main `9aff36f`. Line
numbers are from that commit, so re-find them by name.

## Design

### 1. One new setting, and nothing else stored

```python
"voice_by_character": {},   # {"robot": "robot", "devil": "deep"}: a character on no entry uses "My voice"
```

It goes beside `voice_by_lang` in the defaults (`server.py:177`). Keys are character ids in `CHARACTERS`
(`server.py:281`), values are preset ids in `VOICES` (`server.py:3581`). It stores presets, not voice
files, so `localize()` still works it out per language.

### 2. One function decides

```python
def voice_key(code=None):
    """The preset that speaks. The current character's own voice wins; otherwise the user's own choice."""
    m = CFG.get("voice_by_character")
    v = m.get(look()["character"]) if isinstance(m, dict) else None
    if isinstance(v, str) and v in VOICES:
        return v
    if code is not None:
        return (CFG.get("voice_by_lang") or {}).get(code) or CFG.get("voice") or "girl"
    return CFG.get("voice") or "girl"
```

Every reader of the voice goes through it, and nothing writes `voice` or `voice_by_lang` because of it:

| Where | Today | Becomes |
|---|---|---|
| `voice_preset()` `server.py:3701`, used by `synth()` at 4427 and `voice_pitch` at 5865 | `CFG.get("voice")` | `voice_key()` |
| `lang_voice_name(code)` `server.py:3617`, which decides what to download | `voice_by_lang[code]`, then `voice` | `voice_key(code)` |
| info payload `server.py:5865` | `"voice"` is the Voice tab's choice | Unchanged. Adds `"voice_by_character"` and `"voice_speaking": voice_key()` |

`"voice"` keeps meaning "what you picked in the Voice tab", so its chips still light up your own choice.
`restore_voice` and the language switch (`server.py:3001`, `3003`) keep working on `voice` and
`voice_by_lang`, and can't touch a character's voice. Agent announcements go through `synth()`, so they
follow without any change.

### 3. What stays in charge

These already sit ahead of the preset in `synth()`, and don't change:

- a pinned Kokoro voice (`kokoro_voice`, `server.py:4433`);
- a pinned English Piper voice (`piper_voice`, `server.py:4441`);
- the cloud voice, which `synth()` never reaches when ElevenLabs is speaking. A character's preset takes
  over if it falls back to local speech, because that fallback runs through `synth()`.

### 4. Saving, and fetching a voice that isn't downloaded

In `voice_settings()` (`server.py:5750`), `voice_by_character` must be a dict with known keys and known
values, or the call is refused with a sentence, like the other voice keys. The page sends the whole map.

In the settings route (`server.py:6217`), beside the existing fetch for `voice`: if `look` or
`voice_by_character` is in the update, and the mode is `auto` or `piper`, and the new `voice_key()` has
a Piper voice, call `fetch_voice(localize(...)["piper"])`. So choosing a character or its voice fetches
what it needs, just as the Voice tab does. Until it lands, `synth()` uses what it has, as it already does.

### 5. The picker

In Settings → Look, in the Character row (`index.html:862`):

- a `<select>` labelled "Voice for the Robot": "My voice", then every entry of `info.voices`;
- a preset whose `ready` is false is disabled, with the same reason as the Voice tab's chip;
- the row's help text changes from "Changes his body, not his voice…" to "Each character can have its
  own voice. My voice uses your choice in the Voice tab.";
- while the cloud voice is on, or a voice is pinned, a line says which voice is in charge, and the select
  stays usable, because it still applies to the fallback.

Choosing a preset plays his usual voice sample, if the Voice tab does (the plan checks this).

In the Voice tab, above `#voiceChips` (`index.html:3459`): when `voice_speaking` differs from `voice`,
a line says "The Robot speaks as Robot. Change it in Look.", so changing a chip never seems to do nothing.

## Alternatives rejected

- **Writing `voice` when the character changes.** It's fewer lines, but it destroys your own choice, and
  `restore_voice` would overwrite the character's voice on a language switch.
- **A map per character and language.** Far more settings for no gain, as presets already localize.
- **Storing voice files, not presets.** It breaks Norwegian and Polish.
- **Cloud voices per character.** Declined in the intent, and possible later without changing this map's
  meaning.
- **Starting each character with a suggested voice.** Declined in the intent: his voice would change
  unasked.

## Risks

- **`look()` on every sentence.** It's a small pure function over `CFG`, called once per sentence, and
  it's only slower than a dict lookup by a few microseconds.
- **Random look.** `random` covers colours only, and never the character, so it can't change the voice.
- **Robot on a machine without espeak.** It's refused when chosen, because `ready` is false. If espeak is
  removed later, a chosen engine raises `NoVoice` as it does today for the Voice tab's Robot, and `auto`
  falls back. The same as the Voice tab, so no new failure.
- **A hand-edited config.** A wrong type or an unknown value must be ignored, not crash. `voice_key` checks
  types, and there's a test for it.
- **Stale sentences.** A sentence already synthesised plays in the old voice; the next uses the new one.
  Accepted.
- **Other hosts.** p620 and razer only. p510 runs no companion.

## Verification

- New `tests/test_character_voice.py`, on `_ServerEnv`, covering:
  - no entry means today's behaviour, byte for byte, across `voice_preset` and `lang_voice_name`;
  - a character's voice wins over `voice` and `voice_by_lang`, and the others use theirs;
  - switching character and language writes nothing to `voice` or `voice_by_lang`;
  - Polish and Norwegian resolve through `localize`;
  - bad maps, keys and values are ignored by `voice_key` and refused by `voice_settings`;
  - `lang_voice_name` fetches the character's voice;
  - the info payload's fields.
- A page test, with `nixi_env` and headless Chromium with the GPU off: the select shows and saves, a preset
  that isn't ready is disabled, and the Voice tab's line appears and goes.
- The Snowflake pixel test and the existing voice and language tests still pass.
- On p620, by ear, from the user: the Robot speaks as Robot, then switching to Snowflake speaks as My voice;
  an agent announcement follows. Then razer.

## Rollback

Revert the PR. A saved `voice_by_character` is an ignored key from then on, and everything else is untouched.
