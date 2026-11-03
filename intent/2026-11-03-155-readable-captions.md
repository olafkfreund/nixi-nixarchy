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
  - **Cause (found in review, confirmed in the code):** when a notification
    shows, the page adds the class `note` to the caption
    (`cap.classList.add('note')`, `index.html:1928`). The page's general
    `.note` rule (`index.html:397`) is meant for list items in the panel,
    and gives the caption its grey background, border, padding and radius.
    `#cap`'s top-fade mask (`mask-image: linear-gradient(to bottom,
    transparent 0, #000 34%)`) then fades the top of that box. `#cap` is a
    fixed 100 px tall box, full width, so the box is too.
- **The status line in nixi mode (`#wk`)** is weaker still: 11 px, dim, with
  no shadow and no backing.

## Proposed outcome

1. **Every caption is readable over any background,** in the dark and light
   themes. That covers what Nixi says, what you said, notification lines and
   the nixi-mode status line (`#wk`). "Readable" means:
   - the main text, the "you said" line, error text and inline code each
     reach a contrast of at least 4.5:1 (WCAG AA) against what is actually
     on screen behind them, checked over both a pure black and a pure white
     window, and over a busy terminal;
   - this holds for the built-in themes and for a theme that sets its own
     `--panel`, `--text` and `--dim`.
2. **What you said and what he says read as one unit.** "You said" stays
   visibly secondary, but is legible. How (one backing or two) is for the
   spec.
3. **A notification has a clear, complete boundary,** with no fade and no
   half-box, sized to its content rather than to a fixed 100 px box.
4. **It still looks like Nixi.** The plate follows the theme's colours and
   radius, fits his size, and fades in and out with the caption as today.
   No hard black box.

## Affected users and systems

- **Everyone using the companion window,** on every host (p620 and razer
  today).
- **The companion page (`app/static/index.html`):**
  - the `#cap`, `#him` and `#you` styles;
  - the notification caption (`#cap.note`), and whatever draws the grey box;
  - the nixi-mode status line (`#wk`);
  - full-text mode (`body.fulltext`), which makes the caption taller.
- **Not the notch (bar) mode.** There the caption already sits inside the
  black notch shape ("one black shape, no separate box", `index.html:114`),
  so it keeps no backing of its own.

## Constraints

- **GPU safety (a hard rule on p620):** no `backdrop-filter`, no
  `feTurbulence`, no WebGL. All previews run in headless Chromium with the
  GPU off, followed by a `journalctl -k` check. The headless preview doesn't
  prove the live path, so there's also a live check on p620 after deploy,
  with `journalctl -k` afterwards.
- **Click-through stays the same or gets better.** The clickable area of a
  notification must not grow. It should shrink from today's full
  100 px-by-full-width box to the content.
- **No reflow jumps.** Karaoke words (`#him .w`) still animate in. Any
  backing grows line by line with the text, not word by word, and never
  snaps.
- **Reduced motion is respected,** as the page already does.
- **Both themes,** and themes that set their own `--panel` and `--text`.

## Open questions

1. **A Settings toggle for high-contrast captions** (a fully opaque plate)?
   My suggestion: no. Make the default readable, and add a toggle only if
   the default isn't enough.
2. **Should the "answering · 0:09" chip above his head get the same plate?**
   It's already a pill and looks readable in the screenshot. My suggestion:
   leave it.
