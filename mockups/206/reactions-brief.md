# Drawing brief: reactions for Nixi's characters

Nixi is a desktop companion. The user reviewed anime redesigns and rejected them:
**"I like our version that exists much more."** They want today's characters, cute
with big eyes, but with far more animation that reacts to what is happening on the
computer and in connected services. You are adding those reactions. You are not
redesigning anything.

Your final answer must be the JSON itself, not a plan or a description of it. Do not
modify any file.

Read `/mnt/code/Source-home/GitHub/nixi-206/mockups/206/existing-base.json`. It holds
the real art of today's four characters: `snowflake`, `terminal`, `robot`, `devil`.
Keep that art exactly as it is. All four are dark navy bodies by default, in a soft,
glossy, rounded style with big white eyes.

## The style: cute

- Soft, round, friendly and readable at 120 px. Gradients and gentle highlights are
  welcome. Warm, clear colours. A prop should look like a little toy.
- Big gestures, few details. Think of a small pet reacting: it jumps, droops, peeks,
  hides, perks up.
- Not sharp, not technical, no HUD panels, no aggressive angles, no sarcasm.
- Original art only, with no logos, brands or existing characters.

## How it is drawn

- SVG user space, viewBox `-150 -150 300 280`. Bodies are about radius 85 around 0,0.
  Keep everything within x -135..135 and y -135..110.
- **The page draws the eyes, using Nixi's real code.** Two big leaning ovals at
  x = -27.5 and +27.5, y = -4.5, about 47 wide and 81 tall, so they fill y -46..38. They
  blink, follow the pointer and take the mood's shape. Do not draw eyes, and never cover
  them, except the sunglasses in the `sun` and `done` reactions.
- Layers, from back to front: `sky` (fixed behind him, it doesn't move with his body),
  `back`, then the body, then the eyes, then `front`.
- The figure is wrapped in `.whole`. Its base art behind the eyes is wrapped in
  `.base-back`. Named parts you may move: Terminal `.tCursor`, Robot `.tAntenna`, Devil
  `.tTail`. For Snowflake, `.base-back` holds his six lambdas, so they can spin or
  droop.
- Animate with CSS only: `transform` and `opacity`. Set `transform-box:fill-box` and a
  `transform-origin`. No filters.
- The card has class `c-<character>` and `r-<reaction>`. Scope every rule, for example
  `.r-rain .drop{…}` or `.c-devil.r-load .whole{…}`.
- No `<script>`, event attributes, `<image>`, `<foreignObject>`, `<use>`, `<style>`,
  external URLs or `filter`. Start gradient ids with `fx-`.
- **The motion the user likes:** floating props, rain drops, rising z's and hearts,
  ringing bells, squash and stretch, a hop, a shiver. Loops of 1-3 seconds.

## The reactions

One shared prop per reaction, in `props`. It should work on every character. Then a small
touch for each character in `touch`, which is what makes it theirs: mostly a CSS rule on
its own parts, or one small extra shape. The page sets the eye mood for you.

| id | When | Eyes | The idea |
|---|---|---|---|
| load | CPU high | worried | Sweat drops, fanning himself, a little thermometer rising |
| memory | memory low | scared | Clutches a tiny overflowing box, a sock falls out |
| error | a service failed or a system error | error | A small warning sign pops up, he flinches, a tiny wrench |
| soon | a meeting in 10 minutes | surprised | A small alarm clock rings and hops |
| meeting | in a meeting | listening | A small headset and a shushing finger or a "quiet" dot, he sits very still |
| message | a new chat message | curious | A speech bubble pops up and bobs, he leans toward it |
| email | a new email | reading | An envelope flies in and opens, a letter peeks out |
| ask | an agent wants approval | pleading | Holds up a small sign with a question mark and bounces, puppy eyes |
| approved | you approved | joy | A big green tick, a happy hop |
| denied | you said no | sad | A small red cross, he shrugs, accepts it |
| done | an agent finished | happy | A little trophy or confetti, a proud pose |
| open | he opens an app for you | looking | A tiny window opens with a pop, he points to it |
| rain | it is raining | looking | An umbrella over his head, drops falling in `sky` |
| snow | it is snowing | excited | Snowflakes in `sky`, a small snowball, a beanie |
| sun | hot and sunny | happy | A sun in `sky`, sunglasses slide down over his eyes, an ice cream |
| wind | windy | worried | Leaves blow past in `sky`, he leans and holds on |
| workout | time to move | excited | A headband and small dumbbells, he does squats by hopping |
| water | drink some water | joy | A small water glass with a straw, happy sips |

## Limits

- Each prop at most 1.2 KB of SVG plus its CSS. Each touch at most 350 bytes.
- `me` base art at most 6 KB.

## Output format

One JSON object and nothing else, with no code fence:

{"defs":"…shared gradients…",
 "props":{"load":{"sky":"…","back":"…","front":"…","css":"…"}, … all 18 …},
 "touch":{"snowflake":{"load":{"back":"…","front":"…","css":"…"}, … all 18 …},"terminal":{…},"robot":{…},"devil":{…},"me":{…}},
 "notes":"Two sentences on your direction."}
