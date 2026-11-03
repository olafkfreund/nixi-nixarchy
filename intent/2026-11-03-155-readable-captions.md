---
status: draft
issue: 155
author: olafkfreund
---

# Intent: Nixi's captions and notification card are readable over any window

Code: the companion (`nixoarchy-snowflake`, `app/static/index.html`, CSS
mostly). Artifacts: this repo.

## Problem

- **Captions are drawn straight over whatever is behind Nixi's window.**
  - What he says (`#him`) and what you said (`#you`) sit in `#cap`, which has
    no background. Its only defence is a dark `text-shadow`.
  - Over a terminal, an editor or any busy page, the letters merge with the
    text behind them. The user's screenshot on p620 shows the answer "Here
    are directions to Victoria" over terminal output, and it's hard to read.
- **The "you said" line is the weakest:** 12 px, dim grey (`var(--dim)`),
  and in the same shadow-only treatment.
- **The notification card looks like a smudge.** In the second screenshot
  ("Notification · Herdr · codex finished"), a grey rounded box sits under his
  lower body and fades in from the top. It doesn't separate the text from the
  background, and it looks like a rendering glitch rather than a card.
  - Where that box comes from isn't known yet. It could be the page's `#cap`
    mask over a background, or Hyprland drawing a blur or shadow behind the
    layer's region. Finding out is part of the work.

## Proposed outcome

1. **Every caption is readable over any background,** in the dark and light
   themes. That means what Nixi says, what you said, notification lines and
   short status lines. "Readable" means:
   - text contrast against its own backing of at least 4.5:1 (WCAG AA),
     whatever is behind the window;
   - the backing is opaque enough that a busy terminal behind it doesn't
     compete with the letters.
2. **What you said and what he says read as one block:** a single plate
   holding both lines. "You said" stays visibly secondary, but is legible.
3. **The notification card looks like a card:** one solid, rounded shape
   with a clear edge, placed under Nixi, with no fade or half-box.
4. **It still looks like Nixi.** The plate follows the theme's colours and
   radius, fits his size, and fades in and out with the caption as today.
   No hard black box.

## Affected users and systems

- **Everyone using the companion window,** on every host (p620 and razer
  today).
- **The companion page (`app/static/index.html`):**
  - the `#cap`, `#him` and `#you` styles;
  - the notification caption (`#cap.note`), and whatever draws the grey box;
  - the bar mode (`body.bar #cap`) and full-text mode (`body.fulltext`),
    which restyle the caption.
- **Possibly the Hyprland layer rules** for the `nixi-companion` namespace in
  nixarchy, if the grey box turns out to come from the compositor.

## Constraints

- **GPU safety (a hard rule on p620):** no `backdrop-filter`, no
  `feTurbulence`, no WebGL. All previews run in headless Chromium with the
  GPU off, followed by a `journalctl -k` check.
- **Click-through stays as it is.** The plate must not grow the window's
  input region beyond what `sendRegion` already sends, so the desktop under
  Nixi stays clickable.
- **No reflow jumps.** Karaoke words (`#him .w`) still animate in, and the
  plate grows smoothly with the text rather than snapping.
- **Reduced motion is respected,** as the page already does.
- **Both themes,** and themes that set their own `--panel` and `--text`.

## Open questions

1. **A Settings toggle for high-contrast captions** (a fully opaque plate)?
   My suggestion: no. Make the default readable, and add a toggle only if
   the default isn't enough.
2. **Should the "answering · 0:09" chip above his head get the same plate?**
   It's already a pill and looks readable in the screenshot. My suggestion:
   leave it.
