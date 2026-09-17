---
status: approved
issue: 14
author: olafkfreund
---

# Intent: Sparkles instead of the snowflake, on every nixi surface

## Problem

Nixi has no single icon. It has four, all drawn differently, and they do not
agree with each other:

| Surface | File | Today |
| --- | --- | --- |
| Bar button | `button/BarWidget.qml:35-64` | 11x11 pixel snowflake, hand-drawn on a `Canvas` (~30 lines) |
| Bar plugin metadata | `button/manifest.json:8` | describes itself as "One snowflake in the bar" |
| Omarchy menu entry | `nix/hm-module.nix:235`, `install.py:390` | `help-circle-outline` (U+F0625), not a snowflake at all |

Two problems follow from that.

The first is that the snowflake does not say what nixi is. It is a pun on the
nix flake, which lands for people who already know what Nix is and reads as
"weather widget" to everyone else. Nixi is the thing a newcomer asks for help,
and its icon should look like help, not like a package manager in-joke.

The second is that the bar mark is hand-painted. It is an 11x11 pixel array
drawn on a QML `Canvas`, which manually tracks the button's foreground colour
and repaints on change, where omarchy's own bar indicators are one-line font
glyphs that inherit centring and theme colour from the component. Changing
nixi's mark today means editing a pixel grid; it should mean changing one
character. The Omarchy menu entry meanwhile shows a generic question mark that
matches nothing else nixi draws.

## Proposed outcome

Nixi is sparkles everywhere.

- The bar button, the favicon, the header avatar, every bot message bubble and
  the Omarchy menu entry all show the same mark.
- That mark reads as "assistant" without explanation, and stays legible at the
  22px the bar actually renders at.
- Changing it later is a small edit in one obvious place per surface, not a
  re-drawing exercise in three formats.
- Nothing about nixi's behaviour changes. This is appearance only.

## Affected users and systems

- Everyone running nixi: the bar button and the menu entry change appearance
  after the next rebuild. No action required of them.
- `BarWidget.qml`, `share/ui.html`, `nix/hm-module.nix`, `install.py`.
- `nix/hm-module.nix:71` describes the button as a snowflake in user-facing
  option documentation and goes stale with this change.
- The imperative installer (`install.py`) and the Home Manager module both
  write the menu entry, so they have to move together or the two install paths
  disagree.

## Constraints

- Must stay legible at 22px monochrome on the bar. This is the binding
  constraint and it is what eliminated most candidates.
- Must not add a binary asset or a build-time dependency to render an icon.
- Must not regress the bar button's optical centring, which omarchy's
  `BarIconButton` handles for glyphs but not for arbitrary painted content.
- The icon must carry a license compatible with this repo. MDI is Apache-2.0.
- Both install paths (Nix module and `install.py`) must end up identical.
- Appearance only: no change to what the button does or what nixi can do.

## Open questions

None. Two things worth recording as decided rather than open:

- The nix-flake reference is being dropped deliberately. Sparkles says
  "assistant" and says nothing about Nix, and that trade was made knowingly in
  favour of the icon reading correctly to newcomers.
- Sparkles is a widely used AI-assistant convention. That is the reason to use
  it, not an objection to it: it is legible precisely because it is familiar.


## Correction (2026-09-17)

This intent was first written against a stale local `master` (v0.9.7) and
named four surfaces, two of which no longer exist. v0.10.0 replaced the
browser widget with the omarchy-ask overlay card, which deleted
`share/ui.html` and with it the favicon and the `#bot` chat avatar. The bar
widget also moved to its own plugin at `button/`, because Omarchy gives a
third-party plugin either a bar widget or an overlay, not both.

The decision is unchanged: sparkles everywhere, in whichever form is native
to the surface. Only the inventory above was wrong, and it is now corrected
against `origin/master` at 1a7f9cb.
