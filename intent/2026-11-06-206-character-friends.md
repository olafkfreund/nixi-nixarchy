---
status: draft
issue: 206
author: olafkfreund
---

# Intent: anime characters with moods and voices

## Problem

Nixi's characters are Snowflake, Terminal, Robot and Devil (#178). Their eyes are
expressive, but their bodies stay still, so you can't tell what he's doing with the
sound off unless you read his eyes. The user wants more personality, in a more
grown-up style. They liked the motion in the first mockups, but found round toy
characters "a bit too simple and childish", and asked for "more anime like" instead.

The voice is also separate from the character. A voice is chosen once in the Voice
tab, and Settings says a character "changes his body, not his voice". So a user can't
give the robot a robot voice and have it stick.

Two projects inspired this, and we take ideas from them, not art:

- [desk-pets](https://github.com/V2-VanishsVault/desk-pets): characters who visibly do
  something while Claude works. Its art licence is unclear for four of six pets; Clawde
  imitates Claude's branding, and V2 Ninja carries the author's brand and an Apple logo.
- [familiar](https://github.com/bdehooge/familiar): a persona with nine moods, each a
  different pose, face and prop. 28 MB of AI-made raster frames, with a fixed look.

## Proposed outcome

- **Three new characters in Settings → Look,** next to today's four:
  - a **Laptop**, a sleek unbranded machine with its screen as the face;
  - an **anime girl's face**, a young woman in her twenties, head and shoulders;
  - an **anime man's face**, an adult in his late twenties, head and shoulders.
- **Today's four get moods too.** Snowflake, Terminal, Robot and Devil keep their art
  and gain a pose, face and prop per mood.
- **Everything Nixi does keeps working on all seven:** blinking, gaze, moods, swelling
  or moving with the voice, listening and sleep, plus props where they fit, stage cards
  and the click area.
- **Each character can have its own eyes and mouth.** Anime faces need their own eye
  shape, iris and lashes, and a mouth that moves when he talks. The code still drives
  them, so they blink, follow you and react. This is new work in the face engine,
  not just settings: today every character shares one eye size (`EYE`), and one flat
  pupil with no iris or lashes. Characters that gain a mouth talk with it, and their
  eyes stop morphing through the `t_*` faces. Devil keeps the mouth it has.
- **Each mood has its own pose, face and prop,** so you can tell what he's doing from
  across the room with the sound off. Nixi's moods fold into these groups:

  | Group | Nixi moods | What you see |
  |---|---|---|
  | Resting | idle, bored | nearly still, breathing, hair drifts |
  | Thinking | thinking, reading, searching, looking, curious, confused | hand to the chin, something small floating beside him |
  | Working | editing, running | busy: code reflected, keys lit |
  | Needs you | pleading | looks at you, a small mark |
  | Pleased | happy, joy, excited, wink | a cheer, `^ ^` eyes |
  | Alert | error, surprised, scared | wide eyes, a sharp mark |
  | Sad | sad, worried | downcast, a tear |
  | Asleep | sleepy | eyes closed, head tilted, small z's |
  | Hot machine | the machine is hot, while he's `idle` (`SIT.cpu_hot`) | flushed, sweat, fanning |
  | Booped | purr, love, when you stroke him with the pointer | flustered, a small heart |
  | Talking | talking, listening, the eleven `t_*` faces | the resting pose, with the mouth moving where he has one |

  - `shy` and `annoyed` stay on the resting pose: their half-lidded eyes already say it.
  - **A left click stays what it is today: talk.** Booping uses the stroke gesture he
    already purrs at, and four quick clicks still make him dodge.
  - Motion stops under reduced motion, and props that fight a pose hide during it.
  - **In the notch, bar and pop-out modes there are no poses.** He's too small or
    reshaped there, so only the eyes show the mood.
  - **The small previews in Settings show the resting art,** so the Look tab stays light.
  - **Headphones and glasses that appear by themselves** for music and the like bypass
    today's `fits` check and are sized for a ball-shaped head. They stay off the Laptop
    and the faces until they've been fitted.
- **Any character can have its own voice,** all seven:
  - each has a voice picker in Look, showing "My voice" by default;
  - choosing a preset means that character always speaks with it, on the computer's own
    voices (see open question 5 for the cloud voice). It wins over the language's saved
    preset, and speaks through that language's voices;
  - going back to a character on "My voice" uses the Voice tab's choice, untouched;
  - this applies wherever Nixi speaks with those voices, including agent announcements,
    which reach the same `voice_preset()` through the page;
  - a pinned English Piper voice (`piper_voice`) is the user's own file, and stays in
    charge in English, as it does today;
  - the Voice tab says so when a character's voice is in charge, for example "The laptop
    speaks as Robot", so changing it there never seems to do nothing;
  - choosing a character whose voice isn't downloaded fetches it, as the Voice tab does
    today.

Mockups: `mockups/206/characters.html`, with three drawn directions, a painted test,
every mood, boop and the voice picker.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`:
  - `app/static/index.html`: the `CHARACTERS` registry, the eyes, which today have one
    shape for all (`EYE`), a new mouth, and the Look tab;
  - `app/server.py`: the `CHARACTERS` tuple, a new voice setting, and every place that
    reads the voice (`voice_preset`, `lang_voice_name`, the info payload);
  - `tests/character_fit.mjs`: the new characters and poses must pass the same contract.
- Everyone who uses the companion, on p620 and razer.

## Constraints

- **Must:** original art only. Nothing traced or copied from desk-pets or familiar, no
  logos, and no existing anime, game or mascot character.
- **Must:** both anime characters are adults, drawn with adult proportions, and nothing
  sexualised. Only faces, necks and clothed shoulders. "Anime girl" is the working name;
  Settings could say "Anime woman". Their eyes must be smaller than today's, which are
  half the character's height and would read as a child on a human face.
- **Must:** one code-driven face. Mood, gaze, blink and talk logic isn't copied per
  character. A character supplies only its art and its eye and mouth settings. This
  changes #178's rule that every character shares one eye shape.
- **Must:** Snowflake stays the default. Its resting look stays pixel-identical, but its
  other moods will change if it gains poses, so the #178 pixel test needs updating (see
  open question 3).
- **Must:** performance stays as today. No SVG filters and no constant heavy repainting.
  New pose art animates only `transform` and `opacity`; the eyes keep drawing as they do.
  Animated Chrome pages have hung the AMD GPU before (#138), so tests and previews use
  headless Chromium with the GPU off.
- **Must:** a chosen voice never overwrites the user's Voice tab choice or `voice_by_lang`.
  It is worked out when he speaks.
- **Must:** the user's settings stay valid. An unknown character or voice falls back
  quietly.
- **Must:** Norwegian and Polish keep working. They have fewer voices, so some presets
  will sound alike there, and the picker should say so.
- **Must:** a pose never draws anything broken with #203's props on. The `fits` check
  today is per character and knows nothing about poses, so a prop that fights a pose
  hides during it.
- If painted art is chosen: each image is generated by us, with a model whose licence
  allows it (Flux Schnell is described as Apache 2.0, to confirm), its prompt, seed and
  settings recorded next to the file, and no third-party art as input. That doesn't
  prove an image resembles nothing, so each gets a look for lookalikes, and its copyright
  is unsettled, so anyone could reuse it. Binary images enter the repo for the first time.

## Open questions

1. **How should the anime faces be drawn?** See the mockup page.
   - **Hand-written SVG:** moves freely, recolours, small and fully original, but looks
     like a flat vector avatar. All three drawn sets stop short of real anime.
   - **Painted art with live eyes and mouth:** looks far more like anime, but one picture
     can't tilt its head or raise a hand. The outcome's poses would need about ten images
     per character (roughly 250 KB per face before decoding), or simple overlays such as
     tears and blush, as in the mockup. Painted eyes and mouth must be removed from each
     image, Nixi's squish must be switched off for it because it would warp a face, and it
     blurs when enlarged. Theme colours can't reach it.
   - **Recommended:** decide after one tryout. Build one painted face in the real page, in
     the first face slice, with overlays for the moods. Keep SVG for the Laptop and today's
     characters, where it already looks good. If the tryout fails, fall back to the best
     SVG face. **Your choice, since anime was the request.** The mockup's painted test is
     simpler than the real thing: it has no squish, and it covers the painted eyes.
2. **Which drawn direction for the SVG characters?** Recommended: agy's. Your choice.
3. **Does Snowflake get poses?** Recommended: yes, and its pixel test stays for the resting
   pose only, so it looks the same when resting.
4. **What should a new character's voice default to?** Recommended: "My voice" for all,
   with a suggested preset shown next to the picker, so nothing changes until you choose.
5. **Per-character cloud voices?** Recommended: not now. When ElevenLabs is speaking,
   every character uses the cloud voice, and the picker says so. The character's preset
   takes over only if it falls back to local speech.
6. **All at once?** Recommended: slices of this one task, each a normal reviewed PR, and
   each character arrives with its poses:
   1. the voice link alone;
   2. the pose engine and per-character eye settings, with the Laptop;
   3. irises, lashes and mouths, with the two faces, including the painted tryout;
   4. poses for today's four.

   The task isn't done until all seven ship.
7. **Should each character have its own phrases,** as familiar's persona does?
   Recommended: not now. Nixi's lines are translated into three languages, so
   per-character lines would multiply that work.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`; agy reported no model.
Codex's first run couldn't read the files, because the prompt forbade the shell it reads
with, so its second run is the one recorded. The review of the earlier wizard, duck, cat
and pup draft is in this file's git history.

**Confirmed and applied:**

- Both: per-character eyes are engine work, not settings (`EYE`, `PUP`, `index.html:1317`).
- Both: recommending painted faces was premature. A fixed picture contradicts the poses, and
  squish and tilt would warp it. It's now a tryout.
- agy: painted eyes and mouth must be removed from the image.
- agy: `t_*` eye shapes would fight a real mouth; Devil's mouth needed stating; automatic
  headphones and glasses bypass `fits`; adult faces need smaller eyes; the precedence over
  `voice_by_lang` wasn't stated.
- Codex: the rollout never said when the new characters get poses; "only `transform` and
  `opacity`" didn't match how the eyes draw; provenance records can't prove an image is
  unique; "anime girl" sits awkwardly beside the adult requirement.

**Refuted:**

- agy said the character must also be saved on the server for agent speech to find its voice.
  It already is: `look()` in `server.py` validates and reads `look.character` from `CFG`.

**Not verified:** `tests/character_fit.mjs` beyond its start, the real memory cost of images,
and Flux Schnell's licence terms, which I recalled but didn't check.
