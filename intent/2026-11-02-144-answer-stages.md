---
status: draft
issue: 144
author: olafkfreund
follows: intent/2026-11-02-142-notification-app-icons.md
---

# Intent: A visual stage for each kind of answer

Code: `olafkfreund/nixoarchy-snowflake` (Nixi's page and server) and, for running a
shown command, nixi's bridge in this repo. Artifacts live here.

## Problem

Nixi answers everything the same way: a short caption under him and his voice.
That fails for answers you need to see or act on:

- **Commands are pointed at but never shown.** Since #94 S26 (`cf0ef9f`,
  2026-10-28) nixi mode has no terminal sheet, only a one-line caption, and
  since S24 (`7e26817`) the voice says "the command on screen" instead of
  reading the command. So "how do I install Firefox?" gives you a command you
  can't see, copy or run.
- **Facts, weather and explanations** are squeezed into a caption that scrolls
  away. There's no room for a heading, a few points or a forecast.
- **Requests that end in another app** (a video, directions, a link) have no
  hand-off: Nixi can describe a video or a route but not show the choices or
  open them.
- Nixi already has charming props for notifications (envelope, chat bubble, TV,
  headphones), but nothing for his own answers, so the most important moments
  look the least special.

## Proposed outcome

- Each kind of request gets its own **stage** that pops out beside Nixi, with
  its own look and animation, and Nixi reacting to it:
  - **commands:** a chalk blackboard listing each command with **Copy** and
    **Run this**;
  - **facts and explanations:** a board of rich text (heading, short points);
  - **weather:** current conditions and, where real data exists, a forecast;
  - **video:** a little movie screen of results; choosing one plays it outside
    Nixi;
  - **directions and places:** an old-map stage (parchment, compass, inked
    route) with **Open in Google Maps**;
  - and stages for the other common requests, chosen from a reviewed catalogue
    of what people actually ask him.
- Running a command from the board follows nixi's trust level exactly: Guide
  never runs it, Mechanic shows the approval card with the exact command, YOLO
  auto-approves, secret paths are always refused.
- The stages are usable by voice ("run the first one", "open it", "close"), by
  keyboard and by mouse, and they look like one family.
- The command shown on the board is the command that runs, byte for byte.

## Affected users and systems

- Everyone using Nixi in nixi mode; the companion page and server
  (`app/static/index.html`, `app/server.py`).
- nixi's bridge, if running a shown command needs a new request type there.
- Outside services, only on request: a video search, and a map or route
  lookup.
- p620 for the live checks.

## Constraints

- **Trust is never bypassed.** The page never runs anything itself, a command
  cannot be edited between the board and the run, and approval stays with the
  bridge.
- **GPU safety.** CSS, SVG and canvas2D only, no WebGL or WebGPU, and no video
  playback inside Nixi's window (Chrome previews crashed Hyprland twice on this
  machine). Previews are tested in headless, GPU-free Chromium only.
- **Privacy.** The page makes no third-party requests. Anything sent outside
  (a search query, an address) is sent only when you ask, and the stage says
  so. Home location is never sent unless you set it.
- **Untrusted content.** Model and web text is shown as text, never as HTML.
  Nothing runs or opens just because it appears.
- Accessible: keyboard, contrast and reduced motion, following the Omarchy
  theme.
- Doesn't steal focus or cover the bar, and fits a 2560×1440 monitor.
- **Fun, but never in the way** (the user's words: "make sure this is not
  stopping the workflow, this is for fun but it needs to be usable as well").
  The answer and the command are readable at once, before or without any
  animation; animation never delays them; a stage never blocks typing or
  clicking elsewhere and closes with one key or word.

## Open questions

1. Which stages ship first? Proposed: commands with Copy, then Run; then facts
   and weather; then directions and video. The rest follow the catalogue review.
2. Directions: draw the **real route** (the server fetches it, for example
   from OpenStreetMap, which means sending the addresses there), or a
   **decorative** inked path with just the destination and the Google Maps
   button?
3. Video: hand off to **mpv** or to the **browser**?
4. Should a stage stay open until closed, or fade after a while like the
   caption does?
