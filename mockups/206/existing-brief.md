# Drawing brief: what today's four characters could do

Nixi already has four characters: Snowflake, Terminal, Robot and Devil. They were
drawn in #178. Their eyes change with the mood, but their bodies stay still. The
user asked what can be done with them, so show it: add a pose, face and prop for
each mood, in each character's own style.

Your final answer must be the JSON itself, not a plan or a description of it. Do
not run any shell command. Do not modify any file.

Read `/mnt/code/Source-home/GitHub/nixi-206/mockups/206/existing-base.json`. It has
each character's real `ball`, `back`, `front` and `defs`. **Keep that art exactly:
you add to it.** Read the "How it is drawn" and "The moods" sections of
`/mnt/code/Source-home/GitHub/nixi-206/mockups/206/anime-brief.md`. Its rules apply,
with these changes:

- You do not set `eye` or `hideEyes`: these four use Nixi's own eyes, two white
  leaning ovals of rx 23.5, ry 40.5 at x = -27.5 and +27.5, y = -4.5. Do not draw over
  them. Art in `front` must stay below y = 38 or above y = -46.
- Do not draw a character's existing parts again. To move or hide existing art, use
  `.whole` or `.c-<id>.s-<mood> .tCursor` (Terminal's cursor), `.tAntenna` (Robot's
  light) or `.tTail` (Devil's tail). Those are its only named parts.
- `s-idle` needs nothing: the existing motion stays.
- **Sharper and less childish:** the user found round toy art too simple. Use crisp
  shapes with hard-edged highlights, and small interface or light details:
  - **Snowflake:** the six lambdas are his crown. They can spin, glow, frost or
    scatter. Keep his calm glass look.
  - **Terminal:** the screen is the stage: code scrolling, a progress bar, an error
    in red, a sleep-mode screen.
  - **Robot:** antenna, panels, visor lights, steam vents.
  - **Devil:** tail, horns and a small flame; a mischievous, not cute, mood.
- At most 5 KB of pose art per character, with `talk` optional. A mouth is optional
  too: these four may act with brows, props and body alone.

## Output format

One JSON object and nothing else, with no code fence:

{"snowflake":{"defs":"…","css":"…","poses":{"think":{"back":"…","front":"…"},"work":{…},"wait":{…},"happy":{…},"alert":{…},"sad":{…},"sleep":{…},"busy":{…},"boop":{…},"talk":{…}}},
 "terminal":{…},"robot":{…},"devil":{…},
 "notes":"Two sentences on your direction."}
