---
status: draft
issue: 155
intent: intent/2026-11-03-155-readable-captions.md
---

# Spec: Nixi's captions and notification card are readable over any window

All changes are in the companion page, `app/static/index.html`
(nixoarchy-snowflake). Line numbers are at `main` `9076c04`.

## What's there today (checked)

- **Markup** (`:654`): `<div id="cap"><div id="you"></div><div id="him"></div></div>`,
  then `<div id="wk"></div>`.
- **`#cap`** (`:165`):
  - a fixed box: `top: 296px`, `height: 100px`, full width (`left` and
    `right` at 12 px);
  - flex column, aligned to the bottom;
  - no background, a `text-shadow` only;
  - a top-fade `mask-image` (34%).
- **`#you`** (`:258`): 12 px, `var(--dim)`, a lighter shadow.
- **`#him`** (`:270`): 14.5 px, `width: 100%`, `max-height: 4.5em`,
  `overflow: hidden`.
- **`#wk`** (`:257`): 11 px mono, `var(--dim)`, no shadow.
- **Notifications** add the class `note` to `#cap` (`:1928`). That pulls in
  the panel's `.note` list-item box (`:397`: grey background, border,
  padding and radius), and the mask fades it: that's the grey half-box.
  `sendRegion` then makes all of `#cap` clickable (`:3013`,
  `add(cap,4)`).
- **Theme colours** come from the Omarchy theme (`:880`): `--panel` is the
  theme background, `--text` the foreground, and `--dim` is
  `dark_foreground` or `muted` or the foreground. So `--dim` against
  `--panel` can be any contrast.
- **Notch (bar) mode** (`:114-120`) clears background, mask and shadow on
  `#cap`. It stays out of scope, as the intent says.

## Design

### 1. Each line gets its own backing, like film subtitles

- **`#you` and `#him` each become a backing that hugs their text:**
  - `width: fit-content` and `max-width: 100%`, centred by `#cap`'s
    existing `align-items: center`;
  - `padding: 4px 10px`, and the theme radius (10 px).
- **The backing colour:** `--cap-bg: color-mix(in srgb, var(--panel) 90%,
  transparent)`.
  - It's a flat colour, so there's no `backdrop-filter` and no blur.
  - 90% means a busy window behind only shows through at 10%: enough to
    feel part of the desktop, never enough to compete with the letters.
- **One unit:** when both lines show, `#you` sits directly on top of `#him`
  (the gap goes from 3 px to 0), with the same backing colour.
  - `#you` loses its bottom radius and `#him` its top radius, so the two
    read as one tab shape with "you said" as its small header.
  - When only one line shows, it keeps all four corners.
- **The shadow goes:** `#cap`'s `text-shadow` is removed, because on a
  backing it only blurs the letters. In notch mode it was already off.
- **The mask goes:** `#cap`'s top-fade `mask-image` is removed, because it
  would fade the backing. Older karaoke lines are still cut by `#him`'s
  existing `max-height: 4.5em` and `overflow: hidden`, now inside the
  backing's padding.
- **Growing and shrinking:** the backing grows one line at a time with the
  text. Words wrap at spaces as today, so the width settles per line, and a
  `transition` on `max-width` and `padding` (0.2 s) softens the change.
  Under reduced motion there's no transition.

### 2. Readable colours in any theme

- **`#him`:** `var(--text)` on `--cap-bg`. Its size (14.5 px) and weight
  (500) are unchanged.
- **`#you`:** a new `--cap-dim`, computed in JS when the theme is applied
  (`:880`, next to `--dim`):
  - start from `--dim`; while its contrast against `--panel` is below
    4.5:1, mix it 10% further towards `--text`;
  - stop after at most 10 steps, which ends at `--text` itself.
  - Size goes from 12 px to 12.5 px.
- **`#him.err`** (`#ff8a8a`) and inline code (`var(--tint)`) get the same
  treatment: `--cap-err` and `--cap-code`.
- **A helper,** `contrast(a, b)`, uses the WCAG relative-luminance formula,
  about 10 lines next to the existing `shade()`. It works on the theme's
  hex colours, not on composited pixels.
  - The backing is 90% `--panel`, so the real background stays within a
    10% blend of `--panel` over anything. The 4.5:1 target is checked
    against `--panel` with a margin: the computed colours aim for 4.8:1.
    That covers the 10% blend over pure white or pure black.

### 3. The notification card

- **Rename the class** the page sets on `#cap` from `note` to `ntf`
  (`:1928`, `:2082` and `sendRegion` `:3013`). The panel's `.note` rule
  then no longer applies to the caption. That one change removes the grey
  half-box.
- **The notification line** is `#him` in the same backing as above, plus a
  1 px `var(--line)` border, so it reads as a card. It keeps its icon
  (`noteIcon`) and its click.
- **Clickable area:** `sendRegion` adds `#him`'s box, the card itself,
  instead of all of `#cap` (`add(himEl, 4)`). The clickable area shrinks
  from 100 px by full width to the card.

### 4. The nixi-mode status line (`#wk`)

- It gets the same backing as a small pill: `width: fit-content`, centred
  with `margin: 0 auto`, `padding: 2px 8px`, radius 999 px.
- Its colour is `--cap-dim`, and its size goes from 11 px to 11.5 px. It
  stays mono and single-line with an ellipsis.
- When it's empty it has no backing: `#wk:empty { display: none }`.

### 5. What stays the same

- **Notch (bar) mode:** its existing rules already clear the background and
  mask. Add the new `background` and `border` to the existing `none`
  overrides there, so nothing leaks in.
- **Full-text mode** keeps its taller box. The backing simply hugs more
  lines.
- **Fading in and out** (`#cap.off`) is unchanged, so the backing fades with
  the text.
- **The "answering · 0:09" chip** is unchanged (open question 2 in the
  intent, the suggested answer).

## Alternatives rejected

- **One big plate the size of `#cap`.** That would be a 100 px dark box even
  for a one-word caption, and it would make the whole box clickable for
  notifications. Backings that hug each line stay small and look like
  subtitles.
- **A stronger `text-shadow` or a stroke on the letters.** It's still
  unreadable over busy text, and it looks heavy.
- **`backdrop-filter: blur()`.** Ruled out: it hung the GPU on p620 before.
- **A fixed dark colour instead of `--panel`.** It would clash with light
  themes, which get a light backing with dark text this way.
- **Leaving the `.note` class and overriding its styles on `#cap`.** That
  couples the caption to a list-item style again. A separate class name is
  cleaner, and it's three lines.

## Risks

- **A theme with a very transparent or odd `--panel`:** `color-mix` keeps
  the theme's own opacity, multiplied by 90%. In practice the Omarchy
  themes use opaque backgrounds.
- **Width jitter while words stream in:** the backing's width follows the
  longest line as it grows. The 0.2 s transition softens this. If it still
  feels jumpy live, we can pin the width per line (a deviation).
- **WebKitGTK (the real window) and `color-mix`:** `color-mix` is already
  used on the page (`#chip`, `#ask`), so WebKitGTK supports it.
- **Hosts:** p620 and razer, the usual deploy.

## Verification

- **A contrast unit test** (`tests/caption_contrast.mjs`, run by a Python
  wrapper like the others):
  - for the default theme, a light Omarchy theme, and a theme whose
    `dark_foreground` is nearly the background, apply the theme and read
    the computed `--cap-dim`, `--cap-err`, `--cap-code` and `--text`;
  - assert each is at least 4.5:1 against the 90% backing composited over
    pure black and over pure white.
- **The page test** (`stages_fit.mjs` or a new caption fit test, GPU-free
  headless):
  - `#him` and `#you` have a background and hug their text: narrower than
    `#cap` for a short caption;
  - `#cap` has no `mask-image` outside notch mode;
  - a notification gives `#cap` the class `ntf` and not `note`;
  - `#him` has a border;
  - the region sent includes `#him`'s box and not `#cap`'s full box;
  - `#wk:empty` shows nothing;
  - notch mode: `#cap` still has no background.
- **Before and after previews** in headless Chromium with the GPU off:
  - over a screenshot of a busy terminal, for a short answer, a three-line
    answer, "you said" plus an answer, a notification, and `#wk`;
  - in the dark and light themes;
  - `journalctl -k` checked after each.
- **Live on p620,** after deploy:
  - ask something over a terminal, and trigger a notification;
  - check `journalctl -k` for GPU resets.

## Open questions

1. **The backing strength:** 90% `--panel` is my suggestion. 95% is nearly
   opaque; 85% shows more of the desktop. The previews will show 90%, and
   we can adjust after you've seen them.
