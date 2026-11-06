# Drawing brief: a laptop, an anime girl and an anime man

You are drawing a mockup of three whole-body characters for Nixi, a desktop
companion that sits on the user's desktop. The user reviewed an earlier set of
round toy animals and said: "a bit too simple and childish, make them more anime
like". Your job is to show how good this can look in hand-written SVG.

Your final answer must be the JSON itself, not a plan or a description of it. Do
not run any shell command. Do not modify any file. For the feel of the motion
only, you may read the `css` fields in
`/mnt/code/Source-home/GitHub/nixi-206/mockups/206/agy-poses.json`: the user likes
how those floating props, rain, z's and squash-and-stretch move. Do not reuse its
characters.

## The characters

All are original. Do not imitate or reference any existing anime, game, mascot,
person, product or logo. No logo on anything.

| id | Character | Direction |
|---|---|---|
| laptop | A sleek modern laptop with no brand, its screen as the face | Thin metal body, dark glowing screen, keyboard deck with lit keys. Anime eyes on the screen, with small interface details around them. It should feel like a cool android, not a toy |
| girl | The face of an anime girl: a young woman in her twenties, head and shoulders | Modern key-visual style: expressive, confident, stylish hair with real shape, simple collar or jacket. An adult face with adult proportions: not childlike, and nothing sexualised |
| man | The face of an anime man: an adult in his late twenties, head and shoulders | Modern key-visual style: defined jaw, stylish hair, collar or jacket. Cool and capable, not a boy |

## The style: this is the point

- **Anime key-visual look.** Clean dark line art with some variation in line
  weight. **Cel shading:** hard-edged shadow shapes in a second tone, not soft
  gradients everywhere. Hair built from layered locks with a bright specular band
  and rim light. Skin with one shadow tone under the hair and chin, a small nose
  mark, and a small mouth.
- **Real proportions, not chibi.** A narrower face with a defined chin, eyes large
  but in proportion, and hair that frames the face. No round ball bodies.
- Avoid: pastel toy shading, huge round heads, a dot-and-curve mouth on a blob.

## How it is drawn

- SVG user space, viewBox `-150 -150 300 280`. Fit within x -125..125 and
  y -130..105.
- Layers in order: `back` (behind everything, such as back hair), `ball` (one closed
  path, the silhouette, filled by `fill`), then the eyes, then `front` (over the
  eyes: fringe, nose, mouth, keyboard).
- `fill` is three colours, top to bottom, for the silhouette.
- **The page draws and moves the eyes, using your settings,** so it can blink and
  look at the pointer. Do not draw open eyes yourself. Set these, in the same user
  space:

  ```json
  "eye": {"cx": 34, "cy": -8, "rx": 22, "ry": 19, "tilt": 4,
          "white": "#f8f4f0", "outline": "#2a1f28",
          "iris": "url(#girl-iris)", "irisRx": 15, "irisRy": 18,
          "pupil": "#1b1020", "pupilR": 7,
          "lashes": "<path …/>"}
  ```

  - `cx` is the distance from the centre to each eye. The left eye mirrors the
    right.
  - `lashes` is SVG for the **right** eye, in that eye's own coordinates, with the
    eye centre at 0,0. Draw the heavy upper lash line, the wing and any fold here. It
    moves with the eyelid and the page mirrors it for the left eye.
  - Anime eyes are wider than tall at the lid, with a tall iris cut off by the upper
    lid. The iris needs a gradient, a dark top and a bright lower crescent. The page
    adds the highlights.
- A character may set `"hideEyes": ["sleep","happy","boop"]` to hide the page's eyes
  in those moods and draw its own closed or `^ ^` eyes in that mood's `front`.
- **Eyebrows and mouths belong to each mood,** in `poses.<mood>.front`. They do the
  acting. The resting brow and mouth go in `front`, and a mood can hide them with a
  class you add, for example `.c-girl.s-sad .brow-rest{opacity:0}`.
- **Talking:** in `poses.talk.front`, draw an open mouth inside
  `<g class="talk-mouth">`. The page scales that group's height with the voice.
  Hide the resting mouth during talk. The laptop can use a glowing voice bar instead.
- Animate only with CSS in `css`, using `transform` and `opacity`. Set
  `transform-box:fill-box` and a `transform-origin`. No filters.
- `.whole` wraps the entire figure. The card has class `c-<id>`, and `s-<mood>` for
  the current mood. Scope every rule, for example `.c-man.s-sad .whole{…}`.
- At rest the character should still feel alive: hair drifts or a screen flickers,
  subtly, using `.s-idle`.
- No `<script>`, event attributes, `<image>`, `<foreignObject>`, `<use>`, `<style>`,
  external URLs or `filter`. Start every gradient id with the character's id.
- At most 9 KB of SVG for each character's `defs`, `back`, `ball` and `front`, and at
  most 5 KB for its poses. Share shapes by keeping poses small: a brow, a mouth, a
  prop.

## The moods

Every mood must read at a glance with the sound off.

| mood | When | Girl and man | Laptop |
|---|---|---|---|
| think | thinking, reading | Eyes aside, brow raised, a hand to the chin or a floating glyph | Spinner or scrolling lines beside the eyes |
| work | editing, running | Focused brows, glowing code lines reflected or floating | Keys light up in waves, code scrolls |
| wait | he needs you | Looks at you, brows up, small mouth open, a small mark | Prompt cursor blinking, screen nudges forward |
| happy | a task finished | Big smile, closed `^ ^` eyes or bright eyes, sparkle | `^ ^` on screen, a bright check, lid bounces |
| alert | a real problem | Wide eyes, sweat drop, a sharp mark | Screen flashes a warning tint, a warning triangle |
| sad | something failed | Downcast, tear at the eye, soft shadow over the brow | Dim screen, a crack-free "x" frown, lid droops |
| sleep | you are away | Eyes closed, head tilted, hair settled, z's | Lid half closed, screen dark with a sleeping light |
| busy | the machine is hot | Flushed, sweat, fanning with a hand, tired eyes | Heat shimmer, a thermometer, a hot glow on the deck |
| boop | he is stroked | Flustered blush lines, a startled smile, a small heart | Screen blushes, a squash, a heart in the corner |
| talk | speaking | A moving mouth | A voice bar |

## Output format

One JSON object and nothing else, with no code fence:

{"laptop":{"fill":["#…","#…","#…"],"defs":"…","back":"…","ball":"M… Z","front":"…","css":"…","eye":{…},"hideEyes":[],"noShadow":false,"poses":{"think":{"back":"…","front":"…"},"work":{…},"wait":{…},"happy":{…},"alert":{…},"sad":{…},"sleep":{…},"busy":{…},"boop":{…},"talk":{…}}},
 "girl":{…},"man":{…},
 "notes":"Two sentences on your direction."}
