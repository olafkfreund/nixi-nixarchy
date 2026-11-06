# Drawing brief: four new Nixi characters

You are drawing a mockup of four whole-body characters for Nixi, a desktop
companion. Return data only, in the format at the end. The mockup page
renders your SVG with one shared pair of eyes.

## The characters

All four are original and generic. Do not trace, imitate or reference any
existing mascot, logo, product or game character. No logos on any object.

| id | Character | While he works | While he reads | When he is pleased |
|---|---|---|---|---|
| wizard | A small grumpy old wizard: pointed hat, big beard, robe, gnarled staff | Taps the staff; a little spark rises from its tip | Hat tilts forward | Staff lifts with a burst of stars |
| duck | A round yellow bath duck | Bobs on the spot | Leans in | A hop |
| cat | A ginger tabby sitting with a plain laptop on its lap | Paws tap the keys in turn | Ears swivel | Tail flicks fast |
| pup | A golden puppy standing up on its hind legs | Tail wags, tongue out | Head tilts | Front paws wave |

## How Nixi draws a character

- SVG user space, viewBox `-150 -150 300 300`. The character must fit inside
  x -125..125 and y -130..105.
- Three layers, in this order: `back` (art behind the body), `ball` (one
  closed path, the silhouette, filled by the page), then the eyes, then
  `front` (art over the eyes).
- **The eyes belong to the page.** Do not draw eyes. Two tilted ellipses of
  rx 23.5, ry 40.5 sit at (x = -27.5 and +27.5, y = -4.5) and move, blink and
  swell by code, so they fill roughly x -60..60, y -50..40. They are white
  with dark blue pupils, so give them a darker face patch behind them if the
  body is light: a white eye on a pale body will not read.
- Characters may have a small muzzle, beak or moustache, in `front`, at or
  below y = 30, as long as it does not cover the eyes.
- **Rich, soft shading is the point.** The user loves characters that look
  rendered and dimensional: use gradients, soft highlights, a rim light and
  layered shapes, not flat outlines. Define gradients in `defs` with ids that
  start with your character id (`wizard-robe`). Filters are not allowed: they
  are too slow in the live animation loop.
- Animate only with CSS classes you define in `css`: `transform` and
  `opacity`, each loop 1-4 seconds. Set `transform-box:fill-box` and a
  `transform-origin`. Use these state selectors, and let idle stay nearly
  still:
  - `.s-work .your-class` while working
  - `.s-read .your-class` while reading
  - `.s-happy .your-class` when pleased
- Scope every CSS rule with `.c-<id>` so characters cannot affect each other,
  for example `.c-cat.s-work .paw-l{...}`.
- No `<script>`, no event attributes, no `<image>`, no `<foreignObject>`, no
  external URLs.
- Keep each character under 6 KB of SVG.

## Output format

Return a single JSON object and nothing else, with no code fence:

{"wizard":{"defs":"…","back":"…","ball":"M… Z","front":"…","css":"…"},
 "duck":{…},"cat":{…},"pup":{…},
 "notes":"Two sentences on your direction."}
