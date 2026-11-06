# Second drawing brief: a pose and face for each mood

Your first set of four Nixi characters is in the file named at the end. Extend
that set and keep its direction. Read `drawing-brief.md` in the same folder
first: all of its rules still apply, including original art only, no logos, no
filters, no eyes, and only `transform` and `opacity` animated.

The idea: **each mood has its own pose, face and prop**, so you can tell the mood
from across the room with the sound off. This is the idea of a persona drawn in
nine moods. Do not imitate any specific existing character.

## The moods

| mood | When | What it should look like |
|---|---|---|
| think | thinking, reading, searching | A paw or wing to the chin, something small floating beside him |
| work | editing, running commands | Busy with his own tool; already drawn in your set, so add a detail |
| wait | he needs you | Sits up and looks at you, one hand raised, a small question or bell |
| happy | a task finished | A cheer: arms up, a little burst |
| alert | a real problem | Startled: mark over his head, body pulled back |
| sad | something failed | Slumped: ears, hat or wings droop, small frown, maybe a rain cloud |
| sleep | you have been away | Slumped sideways or curled, with a blanket or nightcap and small z's |
| busy | the machine is hot | Fanning himself, sweat drops, a small thermometer |
| boop | you clicked him | A one-second surprised giggle: squash and spring, little hearts or stars |

Give each character a **different take** on each mood, in character: the wizard's
"sleep" is not the duck's.

## What you can do

- **Add art per mood:** `poses.<mood>.back` draws behind the body and
  `poses.<mood>.front` over the eyes. The page shows only the current mood's art.
  Use `front` for a mouth or frown, brows, arms and props.
- **Move the whole figure:** `.whole` wraps everything, so
  `.c-duck.s-sleep .whole{transform:rotate(-14deg) translateY(10px)}` slumps him.
- **Hide parts of your base art** in a mood:
  `.c-pup.s-sad .pup-tail{opacity:.3}`.
- **The page sets the eyes for you:** closed in sleep, wide in alert, drooping in
  sad, glancing up in think, arched in happy. Do not draw closed eyes yourself.

The state class on the card is `s-<mood>`. It is also `s-idle` when resting, and
idle uses your base art. Your earlier `s-read` rules still apply during think.

## Limits

- At most 7 KB of new SVG per character, so reuse shapes and gradients.
- Keep the eye area clear down to y = 30, unless the mood is sleep, where a
  blanket may rise to y = 10.
- Same safety rules: no script, no event attributes, no images, no URLs.
- Define new gradients in `defs` with ids that start with your character id, and
  scope all CSS with `.c-<id>`.

## Output format

Return one JSON object and nothing else, with no code fence. Each character's
`defs` and `css` are added to your first set. Omit a mood only if your base art
already says it.

{"wizard":{"defs":"…","css":"…","poses":{"think":{"back":"…","front":"…"},"work":{…},"wait":{…},"happy":{…},"alert":{…},"sad":{…},"sleep":{…},"busy":{…},"boop":{…}}},
 "duck":{…},"cat":{…},"pup":{…},
 "notes":"Two sentences on your direction."}
