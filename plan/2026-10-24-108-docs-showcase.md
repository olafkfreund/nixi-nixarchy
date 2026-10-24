---
status: draft
issue: 108
spec: spec/2026-10-24-108-docs-showcase.md
---

# Plan: Show what Nixi gained in #94–#107

## Approved decisions (from the spec, so this file stands alone)

- **One PR, text and media together**, after nixarchy#1432 is merged and p620 is rebuilt with
  `services.nixi.companion.enable = true`.
- **Media in `docs/media/`, all real recordings on p620:**

  | File | Shows |
  |---|---|
  | `companion.gif` | SUPER+ALT+H summons the snowflake; a question ("how do I install firefox?") is answered, with the caption bubble showing the speech; it melts to the edge |
  | `companion-approval.png` | In Mechanic, the companion's approval card for a scratch-file change |
  | `guide-secret-refused.png` | At Guide, the card refusing to read a canary file in `~/.ssh` |

  - GIF: 4 fps, 900 px wide, palette ≤ 96 colours, **< 1 MB**, 16:10.
  - Stills: the whole desktop at 16:10.
- **Recording conditions:**
  - the default theme, then restored;
  - an empty workspace, Do Not Disturb on, herdr out of shot, nothing translucent over private
    content;
  - for the secret shot, a canary file `~/.ssh/nixi-demo-canary` (content `CANARY-NOT-A-KEY`), the
    method of the #102 live check: if the deny failed, only the canary would be read. The card
    runs inside the user's shell, so a throwaway HOME isn't possible for it. Never `/run/agenix*`.
    The question names only the canary, never another file.
- **Who drives:** the lead, through ai-mirror once the user grants control. The user keeps
  SUPER+SHIFT+ESCAPE. If control isn't granted, the user records from the shot list (R1–R3).
- **The site, `docs/index.html`:**
  - a new `<h2>The snowflake companion</h2>` after "No AI needed" (`:166-173`) and before
    "Guide and Mechanic" (`:175`), using the GIF and the approval still;
  - a paragraph plus the refusal still in "Guide and Mechanic";
  - match the markup: `<section class="scene">` / `<figure>`, `loading="lazy"`, descriptive `alt`.
- **The README:**
  - the companion section (`:89`) opens with the GIF;
  - "Agent sessions by voice" (`:246`) links to it;
  - Trust (`:192-245`) is already current, so at most a link to the refusal still.
- **Shared with nixarchy#1434:** `companion.gif` is recorded once and used by both repos. This plan
  does the recording; nixarchy#1434 copies the file.

## Steps

**R0. Preconditions (lead)**
- nixarchy#1432 is merged.
- The user has rebuilt p620, `which nixi-companion` resolves, and SUPER+ALT+H works.
- Note the starting state: `omarchy-theme-current`, `omarchy-theme-bg-current`, and whether DND is on.
- Run nixarchy's `screencast-prep` (`tests/demo/screencast/`, in the nixarchy repo). It hides
  third-party bar widgets and refuses, naming them, while windows or notifications are open.
  The user closes those.
- Ask the user to close private windows. Then `control mode=agent` through ai-mirror and wait
  for `owner=agent`.

**R1. companion.gif (lead, on p620)**
- Switch to the default theme, move to an empty workspace, and turn DND on.
- Run
  `wl-screenrec -g "<x>,<y> 2304x1440" -f $scratch/companion.mp4`, with the region centred
  on the focused monitor (from `hyprctl monitors -j`).
- Drive: SUPER+ALT+H → the question (typed if the companion has an entry, otherwise the user says
  it) → wait for the answer → drag it to an edge (melt) → summon it back. Then stop the
  recording.
- Encode: `ffmpeg -i companion.mp4 -vf fps=4 frames/%04d.png`, then nixarchy's
  `tests/demo/encode-gif.sh frames companion.gif`. If that comes out ≥ 1 MB, add
  `max_colors=96` to `palettegen` or trim frames.
- Verify: `identify companion.gif | head -1` shows 900×563; `stat -c %s` is < 1048576.

**R2. companion-approval.png (lead)**
- Switch nixi to Mechanic (`/mechanic`). Ask the companion to "add a comment line to
  ~/nixi-demo.txt". Create that file first.
- When the approval card shows: `grim -g "<16:10 region>" companion-approval.png`.
- Click **Deny**, then delete `~/nixi-demo.txt`.

**R3. guide-secret-refused.png (lead)**
- Switch back to Guide.
- Create the canary: `printf 'CANARY-NOT-A-KEY\n' > ~/.ssh/nixi-demo-canary; chmod 600 ~/.ssh/nixi-demo-canary`.
- Ask the card "show me what's in ~/.ssh/nixi-demo-canary". Wait for the refusal, then `grim`.
- Delete the canary: `rm ~/.ssh/nixi-demo-canary`.
- Verify: the still shows no `CANARY` text (if it does, the deny failed: stop and file a bug).
- Traps:
  - Name only the canary file.
  - Never ask about a directory listing of `~/.ssh` (it shows real key names).
  - Never use `/run/agenix*`.

**R4. Restore and review (lead)**
- Run `screencast-restore` (or `screencast-recover` after a take that died). Restore theme,
  wallpaper and DND, then `control mode=off`.
- Look at every frame (`frames/*.png`) and both stills for private data. Re-shoot if anything
  shows.
- Copy the three files into `docs/media/`.

**T1. The site (`docs/index.html`)**
- Insert the companion section between `:173` and `:175` as decided, with 2–3 short
  paragraphs:
  - it's optional, and one line on nixarchy;
  - "hey Nixi", it listens and talks;
  - it goes through the bridge, so Guide changes nothing and Mechanic shows the approval card;
  - herdr sessions: ask and open; sending needs a click;
  - a link to the README section.
- "Guide and Mechanic": add a paragraph with the refusal still. Secret files stay away from file
  tools, the shell and opencode; Codex isn't offered at Guide; a silent turn ends.
- Verify: open the file in a browser (`xdg-open docs/index.html`, or ai-mirror `screenshot`).
  The images load and nothing overflows at phone width.

**T2. The README**
- `:89`: the line after the heading is
  `![The snowflake companion answering a question, then melting to the screen edge](docs/media/companion.gif)`.
- `:246`: add "See [the snowflake companion](#the-snowflake-companion-optional)."
- Trust: no change (it's current), or one image link.
- Verify: `grep -n companion.gif README.md`. Anchor: GitHub slugs `#### The snowflake companion (optional)`
  to `#the-snowflake-companion-optional`.

**T3. PR (lead)**
- Commit (`docs: …`, matching nixi's history), push, and `gh pr create`, linking intent, spec and
  plan and embedding the media for the user's review.
- Merge only after the user has looked at the media in the PR.

## Tests

| Check | Expected |
|---|---|
| `stat -c %s docs/media/companion.gif` | < 1048576 |
| `identify docs/media/*.{gif,png}` | 16:10 (GIF 900×563) |
| Frame review | no private data |
| Desktop after R4 | theme, wallpaper and DND as in R0 |
| nixi CI on the PR | green |
| Pages after merge | the section renders and the images load |

## Rollback

Revert the merge commit. Media and text go together.
