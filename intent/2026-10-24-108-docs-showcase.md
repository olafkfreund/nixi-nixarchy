---
status: draft
issue: 108
author: olafkfreund
---

# Intent: Show what Nixi gained in #94–#107

## Problem

Seven changes merged on 2026-10-23. A reader of nixi's README or site
(<https://olafkfreund.github.io/nixi-nixarchy/>, `docs/index.html`) sees little or none of them:

- **The snowflake companion (#94).** A desktop snowflake that listens and talks, asking only
  through Nixi's bridge. The README has an install section (`README.md:89`) but no picture.
  The site doesn't mention it.
- **Agent sessions by voice (#95).** Ask how a herdr agent session is doing, or open it. Sending
  to it always needs a click. The README has a short text section (`README.md:246`). The site has
  nothing.
- **Guide keeps secrets out of reach (#96, #97, #102).** This covers shell reads of secret files,
  Codex refused at Guide, opencode answering at Guide without reading secrets, and the stall guard.
  The "Guide and Mechanic" part of the site predates all of it.
- **#103 and #106 (the settings race, YOLO during a switch)** are invisible fixes. They need, at
  most, a line in the architecture invariants, which they already have.

The site's showcase is "Sam's first session", "No AI needed" and "Guide and Mechanic". It has
no media of the companion.

## Proposed outcome

- **The site** gains a section on the snowflake companion, with real media: the snowflake on
  the desktop, a spoken question answered, and an approval card. Its "Guide and Mechanic" part
  says what Guide now keeps out of the agent's reach.
- **The README:**
  - the companion section opens with a picture;
  - the voice-sessions section links to it;
  - the Trust section names the new Guide protections in a few lines.
- All media are recorded on a real desktop running the merged code. None are mock-ups.

## Affected users and systems

- nixi: `README.md`, `docs/index.html`, `docs/media/`.
- People reading the README or the Pages site.
- No code changes.

## Constraints

- Media come from a live run after nixarchy#1432 is merged and p620 is rebuilt with the companion
  on. Until then this task can do text only.
- Don't show or claim what the companion leaves out (README "What this build leaves out"), such
  as screenshots, history or a self-updater.
- Recordings must not show secrets, real file contents from `~/.ssh`, tokens or personal data.
  Use a throwaway HOME or canary files, as in the #102 live check.
- Keep media small: nixarchy's rule is GIFs under 1 MB at 900 px. Follow it here too.

## Open questions

1. **Which media to record.** Recommendation:
   - a GIF of the companion: summon, ask "how do I install firefox", hear and see the answer,
     melt to the edge;
   - a still of a Mechanic approval card from the companion;
   - a still of Guide refusing a secret read.
2. **Should this wait for the companion to run on p620, or ship the text now and the media in a
   second PR?** Recommendation: wait, so text and media land together.
