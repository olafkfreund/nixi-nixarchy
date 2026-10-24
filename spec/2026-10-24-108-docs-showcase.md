---
status: draft
issue: 108
intent: intent/2026-10-24-108-docs-showcase.md
---

# Spec: Show what Nixi gained in #94–#107

## Design

Text and media land in one PR, after nixarchy#1432 is merged and p620 is rebuilt with the
companion on (intent answer 2).

### Media (`docs/media/`)

| File | What it shows | How |
|---|---|---|
| `companion.gif` | Press SUPER+ALT+H and the snowflake appears; a question ("how do I install firefox?") is answered, both spoken (caption bubble) and in the companion; the snowflake melts to the screen edge and comes back | Recorded with `wl-screenrec` on a 16:10 region, then encoded like nixarchy's `tests/demo/encode-gif.sh`: 4 fps, 900 px, palette ≤ 96 colours, **< 1 MB** |
| `companion-approval.png` | In Mechanic, the companion's approval card for a change (a keybinding in a scratch file) | `grim`, the whole desktop at 16:10 |
| `guide-secret-refused.png` | At Guide, the card refusing to read a canary under a throwaway HOME's `~/.ssh` | `grim` |

- A GIF has no sound, so the spoken answer shows as the companion's own caption.
- The question is typed if the companion has a text entry; otherwise the user says it during
  the take.
- All three use the default Omarchy theme, on an empty workspace with no translucent window
  over private content. The theme is restored afterwards.
- The secret shot uses a throwaway `HOME` with a canary key (as in the #102 live check), never
  the real `~/.ssh` and never `/run/agenix*`.
- **Who drives:** the lead, through ai-mirror, after the user grants control on their desktop.
  The user keeps the kill switch (SUPER+SHIFT+ESCAPE). If control isn't granted, the lead
  writes a shot list and the user records.

### The site (`docs/index.html`)

- **A new `<h2>The snowflake companion</h2>`** after "No AI needed" and before "Guide and
  Mechanic". It has `companion.gif` and 2–3 short paragraphs:
  - it's optional, and on nixarchy one line turns it on;
  - it listens ("hey Nixi") and talks;
  - it asks only through Nixi's bridge, so Guide changes nothing and Mechanic shows
    `companion-approval.png`;
  - it can tell you how a herdr agent session is doing and open it, but sending to a session
    always needs a click (#95);
  - a link to the README section.
- **"Guide and Mechanic":** a paragraph, with `guide-secret-refused.png`. Guide keeps secret
  files away from the agent's file tools, its shell, and opencode; Codex isn't offered at
  Guide; a turn that goes silent ends rather than hanging.
- Match the existing markup (`<section class="scene">` / `<figure>`, `loading="lazy"`,
  descriptive `alt`).

### The README

- `#### The snowflake companion (optional)` (`:89`) opens with `companion.gif`.
- `## Agent sessions by voice` (`:246`) links to that section.
- The Trust section (`:192–245`) already describes #96/#97/#102 (written with those PRs). It
  gains only a link to `guide-secret-refused.png`, or nothing.

## Alternatives rejected

- **Text now, media later.** The user chose to land both together.
- **Mock-ups or composited stills of the snowflake.** The intent requires real recordings.
- **Video (`.mp4`) like `nixi-demo.mp4`.** A GIF loads inline on GitHub's README as well as on the
  site. One hero video is enough.
- **A page of its own for the companion.** The site is one page, and a section matches it.

## Risks

- **A private detail ends up in a recording** (notifications, translucency, herdr sessions).
  Mitigation: an empty workspace, Do Not Disturb, and herdr out of shot. Every frame is
  reviewed before commit.
- **The GIF goes over 1 MB.** Shorten the take or cut the palette, per encode-gif.
- **The companion changes after recording** (the fork tracks `main`). The docs describe
  behaviour, not pixel detail. Re-record when it visibly changes.
- **ai-mirror control is refused or times out.** Fall back to the user recording from a shot list.

## Verification

- `ls -l docs/media/companion.gif`: under 1 MB. Each image is 16:10.
- The site renders locally (open `docs/index.html`) and on Pages after merge: images load and
  the alt text is present.
- The README renders on GitHub with the GIF.
- Every frame of each medium has been reviewed for private data (lead), and the user approves
  the media in the PR.
- nixi CI is green (the docs don't affect it, but lint runs).
