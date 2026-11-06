---
status: draft
issue: 206
author: olafkfreund
---

# Intent: a wizard, duck, cat and pup, each with its own voice

## Problem

The user loves the animated pets in
[desk-pets](https://github.com/V2-VanishsVault/desk-pets): characters with
personality, who visibly do something while Claude works. Nixi's characters
are Snowflake, Terminal, Robot and Devil (#178). They have expressive eyes,
but their bodies mostly stay still, and none is an animal or a person.

The voice is also separate from the character. A voice is chosen once in the
Voice tab, and Settings says a character "changes his body, not his voice". So
a user can't give the robot a robot voice and the wizard a storyteller's voice
and have each one stick.

Copying the pets isn't the answer. The review on 2026-11-06 (Claude, Codex,
agy) found that:

- their art licence is unclear for four of the six, and all of it is
  AI-generated with unverified redistribution terms;
- Clawde imitates Claude's branding, and V2 Ninja carries the author's brand
  and an Apple logo;
- flat frame strips would lose Nixi's eye tracking, blinking, moods, talking,
  props and theme colours.

The user chose original SVG characters over adding sprites (2026-11-06).

## Proposed outcome

- **Four new characters in Settings → Look:** Wizard, Duck, Cat and Pup, drawn
  with soft shading so they feel dimensional, next to today's four.
- **Everything Nixi does keeps working on them:** the same eyes with blinking,
  gaze, moods, swelling while talking, listening and sleep, plus props where
  they fit, stage cards and the click area.
- **They visibly do something, and it follows what he is doing:**

  | Character | Working | Reading | Pleased |
  |---|---|---|---|
  | Wizard | taps his staff, a spark rises | hat tips forward | lifts the staff, stars burst |
  | Duck | bobs | leans in | hops, wings flap |
  | Cat | paws tap a plain laptop | ears swivel | tail flicks |
  | Pup | tail wags, tongue out | head tilts | paws wave |

  At rest they stay nearly still. Motion stops under reduced motion.
- **Any character can have its own voice,** the four new ones and today's four:
  - each has a voice picker in Look, showing "My voice" by default;
  - choosing a preset means that character always speaks with it;
  - going back to a character on "My voice" uses the Voice tab's choice,
    untouched;
  - this applies wherever Nixi speaks, including agent announcements.

Mockups: `mockups/206/characters.html`, with three directions to compare, every
state and the voice picker.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`:
  - `app/static/index.html`: the `CHARACTERS` registry and the Look tab;
  - `app/server.py`: the `CHARACTERS` tuple, a new voice setting, and every
    place that reads the voice (`voice_preset`, `lang_voice_name`, the info
    payload);
  - `tests/character_fit.mjs`: the new characters must pass the same contract.
- `app/quips*.json` isn't touched: their lines stay as they are.
- Everyone who uses the companion, on p620 and razer.

## Constraints

- **Must:** original art only. Nothing traced or copied from desk-pets, no
  logos, and no existing mascot, product or game character.
- **Must:** vector SVG in the page, with no raster sprites, no new binary
  assets and no paid generation in the build.
- **Must:** one shared, code-driven face. A character supplies only its body,
  as #178 decided.
- **Must:** Snowflake stays the default, and stays pixel-identical (the #178
  test).
- **Must:** performance stays as today. No SVG filters and no constant heavy
  repainting: only `transform` and `opacity` animate. Animated Chrome pages have
  hung the AMD GPU before (#138), so tests and previews use headless Chromium
  with the GPU off.
- **Must:** a chosen voice must never overwrite the user's Voice tab choice or
  `voice_by_lang`. It is worked out when he speaks.
- **Must:** the user's settings stay valid. An unknown character or voice falls
  back quietly, and removing the feature's setting changes nothing else.
- **Must:** Norwegian and Polish keep working. They have fewer voices, so some
  presets will sound alike there, and the picker should say so.
- Light bodies need an outline on the eyes to read, using the eye-line setting
  that already exists. Check this against the #203 prop work, which is merged.

## Open questions

1. **Which art direction?** See the mockup page: Claude, Codex or agy, or a mix
   per character. **Your choice.**
2. **Do the new characters follow the theme colours?** Recommended: no. They
   keep their own colours, because a blue duck stops being a duck. The eye
   colours stay yours. The body colour picker is hidden for these four.
3. **What should a new character's voice default to?** Recommended: "My voice"
   for all, with a suggested preset shown next to the picker, so nothing changes
   until you choose. The alternative is that each starts with its suggestion:
   more charming on first use, but his voice changes without being asked.
4. **Per-character cloud voices?** Recommended: not now. When ElevenLabs is
   speaking, every character uses the cloud voice, and the character's preset
   takes over only if it falls back to local speech. Codex would allow a cloud
   voice per character; agy wouldn't. It can be added later without changing the
   setting's meaning for local voices.
5. **Do Wizard, Duck, Cat and Pup wear props?** Recommended: only those that
   fit, as #178 and #203 do. For example, no hats on the wizard.
6. **Is this four characters or fewer?** Recommended: all four. Each one costs
   about the same, and they share the same code.

## Reviews

Filled in below when Codex and agy have read this draft. Their findings don't
approve anything.
