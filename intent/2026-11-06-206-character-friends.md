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

The user also pointed at [familiar](https://github.com/bdehooge/familiar), whose
fox persona has nine moods. Each mood is a different pose, face and prop: he
naps on a graphics card, types at a laptop, droops when sad. That is what makes
it readable with the sound off, and today's characters don't have it: their
eyes change with the mood, but their bodies don't. Familiar's art has the same
limits as the pets: 28 MB of AI-generated raster frames, and a fixed look. We take
the idea only.

The user chose original SVG characters over adding sprites (2026-11-06).

## Proposed outcome

- **Four new characters in Settings → Look:** Wizard, Duck, Cat and Pup, drawn
  with soft shading so they feel dimensional, next to today's four.
- **Everything Nixi does keeps working on them:** the same eyes with blinking,
  gaze, moods, swelling while talking, listening and sleep, plus props where
  they fit, stage cards and the click area.
- **Each mood has its own pose, face and prop,** so you can tell what he's doing
  from across the room with the sound off. Each character plays it its own way.
  Nixi's many moods fold into these groups:

  | Group | Nixi moods | What you see |
  |---|---|---|
  | Resting | idle, bored | nearly still, breathing |
  | Thinking | thinking, reading, searching, looking, curious, confused | paw or wing to the chin, something small floating beside him |
  | Working | editing, running | busy with his own tool: staff, laptop, bobbing, wagging |
  | Needs you | pleading | sits up, looks at you, a raised hand |
  | Pleased | happy, joy, excited, wink | a cheer |
  | Alert | error, surprised, scared | startled, a mark over his head |
  | Sad | sad, worried | slumped, ears or hat droop, a small frown |
  | Asleep | sleepy | slumped or curled, small z's |
  | Hot machine | the machine is hot | fanning himself, sweat |
  | Booped | purr, love, when you stroke him with the pointer | a squash and giggle, for as long as the mood lasts |

  - **Talking and listening keep the resting body.** That covers `talking`,
    `listening` and all eleven `t_*` talking faces. Only the eyes change, as they do
    today, so he doesn't pull faces at you mid-sentence. `shy` and `annoyed` also
    stay on the resting body: their half-lidded eyes already say it.
  - **Hot machine isn't one of Nixi's moods.** It shows only while he's `idle` and
    the machine is hot (`SIT.cpu_hot`), so never mid-sentence.
  - **The small previews in Settings show the resting art,** so the Look tab stays
    as light as it is today.
  - **A left click stays what it is today: talk.** Booping uses the stroke gesture
    he already purrs at, and four quick clicks still make him dodge.
  - Motion stops under reduced motion, and props that fight a pose hide during it.
  - **In the notch, bar and pop-out modes there are no poses.** He's too small or
    reshaped there, so only the eyes show the mood.
- **Any character can have its own voice,** the four new ones and today's four:
  - each has a voice picker in Look, showing "My voice" by default;
  - choosing a preset means that character always speaks with it, on the
    computer's own voices (see open question 4 for the cloud voice);
  - going back to a character on "My voice" uses the Voice tab's choice,
    untouched;
  - this applies wherever Nixi speaks with those voices, including agent
    announcements, which reach the same `voice_preset()` through the page;
  - a pinned English Piper voice (`piper_voice`) is the user's own file, and stays
    in charge in English, as it does today;
  - the Voice tab says so when a character's voice is in charge, for example "The
    wizard speaks as Storyteller", so changing it there never seems to do nothing;
  - choosing a character whose voice isn't downloaded fetches it, as the Voice tab
    does today.

Mockups: `mockups/206/characters.html`, with three directions to compare, every
mood, boop and the voice picker.

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
- **Must:** the eyes stay readable on every body, including the light duck and
  pup. Today's outline appears when the eye white's brightness is near `LOOK.body`
  (`index.html:1118`), which a fixed-colour body wouldn't set, so it needs a change.
- **Must:** a pose never draws anything broken with #203's props on. The `fits`
  check today is per character and knows nothing about poses, so a prop that fights
  a pose hides during it.

## Open questions

1. **Which art direction?** See the mockup page: Claude, Codex or agy, or a mix
   per character. **Your choice.**
2. **Do the new characters follow the theme colours?** Recommended: no. They
   keep their own colours, because a blue duck stops being a duck. The eye
   colours stay yours. The body colour picker is hidden for these four, and their
   own colour also fills the notch and bar shapes.
3. **What should a new character's voice default to?** Recommended: "My voice"
   for all, with a suggested preset shown next to the picker, so nothing changes
   until you choose. The alternative is that each starts with its suggestion:
   more charming on first use, but his voice changes without being asked.
4. **Per-character cloud voices?** Recommended: not now. When ElevenLabs is
   speaking, every character uses the cloud voice, and the character's preset
   takes over only if it falls back to local speech. The picker says so while
   the cloud voice is on, so it doesn't look broken. Codex would allow a cloud
   voice per character; agy wouldn't. It can be added later without changing the
   setting's meaning for local voices.
5. **Do Wizard, Duck, Cat and Pup wear props?** Recommended: only those that
   fit, as #178 and #203 do. For example, no hats on the wizard.
6. **All four characters at once?** Recommended: two slices of this one task. Ten
   poses for four characters is forty drawings. So the first slice is a normal
   reviewed PR with the voice link and one complete character: **the Duck**, because
   a light body also proves the eye outline. You live with it on p620, the other
   three follow once it looks right, and the task isn't done until all four ship.
7. **Do today's characters get poses too?** Recommended: not in this task.
   Snowflake must stay pixel-identical, and Terminal, Robot and Devil can follow
   if the new ones work well.
8. **Should each character have its own phrases,** as familiar's persona does (for
   example "Muttering incantations…" while working)? Recommended: not now. Nixi's
   lines are translated into three languages, so per-character lines would multiply
   that work. It can be a later task.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`; agy reported no
model. agy's first two tries gave no findings: one answer was only a plan, and one
asked for a shell command that read-only mode denies. Its third, with no commands
needed, is the one recorded here.

**Confirmed and applied:**

- Codex and agy: the mood table left states unmapped, including the eleven `t_*`
  talking faces.
- Codex: a pinned `piper_voice` is an exception to "always speaks with it".
- Codex: "always" conflicted with the cloud voice answer.
- Codex: the eye outline's trigger was misdescribed.
- agy: the Voice tab must say when a character's voice is in charge.
- agy: downloads must follow the character's voice (`lang_voice_name`).
- agy: `annoyed` doesn't belong in Alert; Hot machine needed a clear priority.
- agy: name the first slice's character, on a light body.

**Partly refuted:**

- agy said that moving the body would leave the eyes and props behind, because
  they're separate from it. In the markup, `#face`, `#accBack`, `#accFront`,
  `#sitBack` and `#sitFront` are all inside `#body`, so they move together.
  `#shadow` is outside it. The real cost it points at stands: `frame()` already
  sets `#body`'s transform, so a pose has to combine with that. That's a spec matter.
- agy's claim that pose art may overlap the eyes used `faceBox`. The eyes end at
  about y = 36 and the poses keep clear to y = 30, so at most a small overlap.

**Left for the spec:** pupil colours that wouldn't show as an outline on a light body,
and which `fits` entries still hold during which pose.

**Not verified:** the rest of `tests/character_fit.mjs`, and how the real eyes look on
these bodies. The mockup uses a stand-in.
