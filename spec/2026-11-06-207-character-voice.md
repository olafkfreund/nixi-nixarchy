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
    # Robot is espeak only: if it can't speak here, the character quietly uses your own voice
    if isinstance(v, str) and v in VOICES and (not VOICES[v].get("espeak") or voice_ready(VOICES[v])):
        return v
    if code is not None:
        return (CFG.get("voice_by_lang") or {}).get(code) or CFG.get("voice") or "girl"
    return CFG.get("voice") or "girl"
```

Every reader that decides what speaks goes through it, and nothing writes `voice` or `voice_by_lang`
because of it:

| Where | Today | Becomes |
|---|---|---|
| `voice_preset()` `server.py:3701`, used by `synth()` at 4427 and `voice_pitch` at 5865 | `CFG.get("voice")` | `voice_key()` |
| `lang_voice_name(code)` `server.py:3617`, which decides what to download | `voice_by_lang[code]`, then `voice` | `voice_key(code)` |
| info payload `server.py:5865` | `"voice"` is the Voice tab's choice | Unchanged. Adds `"voice_by_character"`, `"voice_speaking": voice_key()` and `"voice_pinned"` |
| `diagnostics()` `server.py:5712` | shows `voice` | shows both when they differ |

`"voice"` keeps meaning "what you picked in the Voice tab", so its chips still light up your own choice.
`restore_voice` and the language switch (`server.py:3001`, `3003`) keep working on `voice` and
`voice_by_lang`, and can't touch a character's voice. Agent announcements go through `synth()`, so they
follow without any change.

**A bug to fix along the way.** `voice_ready()` (`server.py:5823`) says Robot is ready in `auto` mode
without checking for espeak, and then `synth()` raises a bare `RuntimeError`. It becomes
`bool(v.get("espeak") and shutil.which("espeak-ng"))`. The Voice tab benefits too.

### 3. What stays in charge

These already sit ahead of the preset in `synth()`, and don't change:

- a pinned Kokoro voice (`kokoro_voice`, `server.py:4433`);
- a pinned English Piper voice (`piper_voice`, `server.py:4441`);
- the cloud voice, which `synth()` never reaches when ElevenLabs is speaking. A character's preset takes
  over if it falls back to local speech, because that fallback calls `synth(local=True)` (`server.py:3504`).

**One exception: Robot.** It's espeak on purpose and skips pinned voices, as the Voice tab's Robot does
today. A character set to Robot sounds like Robot, even with a pin. `voice_pinned` is new, because the page
can't see a pin today.

### 4. Saving, and fetching a voice that isn't downloaded

In `voice_settings()` (`server.py:5750`), `voice_by_character` must be a dict with known keys and known
values, or the call is refused with a sentence, like the other voice keys. The page sends the whole map.

The settings route needs two changes, because the new voice depends on the look:

1. **The look stops changing early.** Today the route assigns `CFG["look"]` at `server.py:6154`, before its
   later checks and outside the locks, so a refused request still changes him. `look()` gains an optional
   raw argument, the route computes `upd["look"] = look(merged)` without touching `CFG`, and `save_config`
   assigns it under the lock.
2. **The fetch happens after the save.** `voice_key()` reads `CFG`, so a fetch before `save_config(**upd)`
   would see the old map. After the save, if `look` or `voice_by_character` is in the update:

   ```python
   name = lang_voice_name(lang.active)   # None for Robot, a pinned voice, Kokoro, or a mode that downloads nothing
   if name:
       fetch_voice(name)
   ```

The existing fetch for `voice` stays as it is. If the cloud voice is on, nothing is fetched now, and
`synth()` fetches on first use if it ever falls back, as it does today.

### 5. The picker

In Settings → Look, in the Character row (`index.html:862`):

- a `<select>` labelled "Voice for the Robot": "My voice", then every entry of `info.voices`;
- only Robot can be disabled, when it isn't ready, the same as its chip (`index.html:3462`). A preset
  that isn't downloaded yet stays selectable and shows it's downloading, because choosing it is what fetches it;
- the row's help text changes from "Changes his body, not his voice…" to "Each character can have its
  own voice. My voice uses your choice in the Voice tab.";
- while the cloud voice is on, or a voice is pinned, a line says which voice is in charge, and the select
  stays usable, because it still applies to the fallback.

Choosing a preset saves, then plays his usual sample, in the voice that now speaks.

In the Voice tab, above `#voiceChips` (`index.html:3459`): when `voice_speaking` differs from `voice`,
a line says "The Robot speaks as Robot. Change it in Look." While that line shows, tapping a chip saves
your choice but plays no sample, because the sample would be in the Robot's voice. `/voice <name>`
(`index.html:3825`) gets the same line as its answer.

## Alternatives rejected

- **Writing `voice` when the character changes.** It's fewer lines, but it destroys your own choice, and
  `restore_voice` would overwrite the character's voice on a language switch.
- **A map per character and language.** Far more settings for no gain, as presets already localize.
- **Storing voice files, not presets.** It breaks Norwegian and Polish.
- **Cloud voices per character.** Declined in the intent, and possible later without changing this map's
  meaning.
- **Starting each character with a suggested voice.** Declined in the intent: his voice would change
  unasked.
- **Letting pins beat Robot too.** It would need a change to `synth()`, and would make the Robot character
  sound unlike itself.
- **Previewing a Voice tab chip in that voice while a character's voice is active.** It needs a new way to
  speak a preset other than the active one. Not worth it for this slice.

## Risks

- **`look()` and `voice_ready()` on every sentence.** Both are small. `voice_ready` runs only for Robot, and adds
  a `shutil.which` for it.
- **Moving the look assignment.** Anything between the assignment and the save that reads `CFG["look"]` would
  see the old look. The plan checks this, and the Snowflake pixel test and look tests cover it.
- **Random look.** `random` covers colours only, and never the character, so it can't change the voice.
- **Robot where it can't speak.** It's disabled when chosen, and if espeak goes later, or the mode becomes
  `kokoro` or `piper`, the character quietly uses your own voice instead of failing.
- **Polish and Norwegian on Piper mode while a voice downloads.** `synth()` raises "No piper voice is downloaded
  yet", and that sentence is skipped. It's the same as the Voice tab today, so there's no new failure.
- **A hand-edited config.** A wrong type or an unknown value is ignored, not a crash. There's a test for it.
- **Stale sentences.** Up to three sentences are prepared ahead, so they may play in the old voice. The next uses
  the new one. Accepted.
- **Other hosts.** p620 and razer only.

## Verification

- New `tests/test_character_voice.py`, on `_ServerEnv`, covering:
  - no entry means today's behaviour, across `voice_preset` and `lang_voice_name`;
  - a character's voice wins over `voice` and `voice_by_lang`, and the others use theirs;
  - switching character and language writes nothing to `voice` or `voice_by_lang`;
  - Polish and Norwegian resolve through `localize`;
  - Robot: with and without espeak, under `auto`, `kokoro`, `piper` and `espeak`, and `voice_ready`'s fix;
  - bad maps, keys and values are ignored by `voice_key` and refused by `voice_settings`;
  - a refused settings request leaves `look` unchanged;
  - saving the map or the look fetches the new voice, not the old, and never for Robot;
  - the info payload's fields.
- A page test, with `nixi_env` and headless Chromium with the GPU off: the select shows and saves, only an
  unready Robot is disabled, and the Voice tab's line appears and goes, with no sample while it shows.
- The Snowflake pixel test and the existing voice, look and language tests still pass.
- On p620, by ear, from the user: the Robot speaks as Robot, then switching to Snowflake speaks as My voice;
  an agent announcement follows. Then razer.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`; agy reported no model.

**Confirmed against the code and applied:**

- Both: `voice_ready` says Robot is ready in `auto` without espeak, and `synth` raises `RuntimeError`.
- Both: the fetch as first drafted read the old map, before `save_config`.
- Both: `CFG["look"]` is assigned before the locks and before later refusals.
- Codex: Robot skips pinned voices, so "pins stay in charge" needed an exception.
- Codex: Voice tab samples would play the character's voice.
- agy: disabling every unready preset would block downloading new ones; only Robot's chip disables.
- agy: the page can't see a pinned voice; `diagnostics` and `/voice` also read the voice.

**Confirmed and accepted, unchanged:** the skipped sentence in Polish or Norwegian on Piper mode while a voice
downloads, which is how the Voice tab behaves today. Up to three prepared sentences in the old voice.

**Not verified:** runtime audio on either host. No tests have been run yet.

## Rollback

Revert the PR. A saved `voice_by_character` is an ignored key from then on, and everything else is untouched.
