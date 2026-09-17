---
status: approved
issue: 14
intent: intent/2026-09-17-14-sparkles-icon.md
---

# Spec: Sparkles instead of the snowflake, on every nixi surface

## Design

The mark is Material Design Icons `creation` — three four-pointed stars, one
large and two small. Apache-2.0, which is compatible with this repo.

It exists in two forms that are the same drawing, and each surface uses
whichever form is native to it:

- **As a font glyph**, at U+F0674 in the Nerd Fonts private use area. Verified
  present in the installed `JetBrainsMonoNerdFont-Regular.ttf` via
  `fc-list ":charset=F0674"`, and verified by rendering it, not by trusting the
  codepoint.
- **As an SVG path**, three subpaths on a `0 0 24 24` viewBox.

### Why sparkles, with evidence

Twelve candidates were rendered as SVG at the 22px the bar actually paints,
then magnified, and judged on the render rather than at full size. That test
is what decided this, and it inverted the ranking taken from 96px previews:
`hand-heart` and `magic-staff` become unreadable smudges, and `wizard-hat`
keeps a hat silhouette but its decorative stars collapse into noise.

Sparkles was the most legible of the twelve at 22px. It is also the only
candidate whose meaning does not need explaining, because it is the common
convention for an AI assistant.

### Per surface

**Bar button — `button/BarWidget.qml`.** Set `text: "󰙴"` and delete the
`iconComponent` block entirely, which removes the ~30-line `Canvas` and its
pixel array.

This is the component's intended path, not a workaround. Omarchy's
`BarIconButton` (`Ui/BarIconButton.qml`) renders `text` through an
`OpticalGlyph` whenever `iconComponent` is null (line 32:
`visible: root.iconComponent === null`), and carries optical-centring
machinery built for glyphs — `glyphPaintedWidth`, `glyphBaselineY`,
`opticalCenterErrorX`. `Style.font.family` is `"JetBrainsMono Nerd Font"`, and
omarchy's own bar indicators already draw MDI glyphs from the Nerd Fonts
private use area; `plugins/bar/indicators/SystemSwitch.qml:22` says so in as
many words.

Colour handling improves as a side effect: the `Canvas` manually tracked
`button.foreground` and repainted on change (`onPxChanged`). The glyph path
inherits theme colour from the bar with no code at all. The 0.10 logic in this
file — the derived `overlayId` and the `omarchy-shell shell toggle` launch —
is untouched.

**Bar plugin metadata — `button/manifest.json:8`.** The description calls the
widget "One snowflake in the bar". It becomes "One sparkle in the bar". This is
user-visible in Omarchy's plugin listing.

**Omarchy menu entry — `nix/hm-module.nix:235` and `install.py:390`.** One
character each: `󰘥` (U+F0625) becomes `󰙴` (U+F0674). In
`install.py` this is the escape `\U000f0674`, eight hex digits — `\u` takes
only four and would silently emit the wrong character followed by a stray
digit. This exact mistake was made and caught during implementation; it is
recorded here so it is not made again.

Both files must change together. They are the two install paths for the same
menu entry, and if they disagree the icon depends on how the user installed.

### Surfaces that no longer exist

The first draft of this spec named a favicon and a `#bot` chat avatar in
`share/ui.html`. v0.10.0 replaced the browser widget with the omarchy-ask
overlay card and deleted that file. The new overlay (`Ask.qml`,
`Conversation.qml`) has no nixi-specific avatar, so there is no SVG surface in
this change at all — it is glyph-only. If an avatar is added later it should
use the same MDI `creation` path.

### Documentation that goes stale

| File | What it says |
| --- | --- |
| `README.md:54` | option table: "The snowflake button (a second plugin)" |
| `docs/FORK.md:60` | fork-divergence table naming the snowflake as nixi's icon |
| `nix/hm-module.nix:103` | user-facing option doc: "Install the snowflake bar button" |
| `button/BarWidget.qml:6` | comment describing the pixel snowflake |

Historical artifacts under `spec/` and `plan/` for issue 8 also mention the
snowflake. Those are records of past decisions and are deliberately left alone.

## Alternatives rejected

- **Wizard hat** (`wizard-hat`, U+F1477). The best story of the twelve and the
  one the icon hunt started from. Rejected on the 22px render: the hat reads,
  but the stars on it turn to noise. A partly-mush icon is worse than a clear
  one.
- **Owl**. Distinctive, charming, survives 22px, and unlike sparkles it is not
  a convention everyone else uses. Rejected because it reads "wisdom,
  education, night" rather than "assistant", and nixi needs a newcomer to
  understand it without being taught.
- **Magic wand** (`auto-fix`). Fits nixi's own tagline of guide, tutor,
  mechanic. Rejected: legible at 22px but noticeably softer than sparkles, and
  sparkles is the clearer half of the same idea.
- **Magic staff, hand-heart, lifebuoy.** The first two are unreadable at 22px.
  `lifebuoy` survives but reads as a support ticket queue.
- **Keeping the snowflake somewhere** — for example sparkles on the bar and the
  Koch snowflake as the chat avatar. Rejected by explicit decision in the
  intent: it preserves the exact problem being fixed, which is two marks
  maintained in two formats.
- **An SVG `Image` in the QML widget** instead of a glyph. Needs Qt's SVG image
  plugin to be present in quickshell, which is unverified, and it would keep
  `iconComponent` set and so forfeit `BarIconButton`'s optical centring.
- **Redrawing sparkles as `Canvas` bezier paths.** Keeps today's guarantees and
  changes nothing for the better, at the cost of the most code of any option.
  The `Canvas` is what this change is trying to delete.

## Risks

- **Font dependency.** A glyph shows tofu if the bar's font is not a Nerd Font.
  This is not a new exposure: `Style.font.family` defaults to
  `"JetBrainsMono Nerd Font"` and omarchy's own indicators already depend on
  it, so nixi fails exactly when the rest of the shell does. A user who has
  overridden the bar font to a non-Nerd family sees tofu, and would already be
  seeing it on omarchy's own indicators.
- **The two install paths drifting.** Mitigated by changing both in one commit
  and grepping for the old codepoint afterwards.
- **The python escape.** `\U000f0674`, not `\u`. Called out above.
- **Two plugins, not one.** Nixi ships a bar widget and an overlay as separate
  Omarchy plugins, because Omarchy gives a third-party plugin one or the other,
  not both. The bar widget lives at `button/` and installs to
  `share/omarchy/plugins/io.github.olafkfreund.nixi-button/`. An earlier draft
  of this spec wrongly called that directory a stale leftover and pointed the
  change at a root `BarWidget.qml` that v0.10.0 had already moved. Verification
  must check the installed `nixi-button` path, not the source tree alone.
- **Deployment lag.** The change only becomes visible after home-manager
  rebuilds and the bar restarts. A user reporting "still the old icon" is most
  likely running the previous store path, not hitting a bug.
- Appearance only. No behaviour, permission, or trust-level surface is touched.

## Verification

1. `nix build .#nixi` succeeds.
2. The built output carries the glyph at the path the desktop actually loads:
   `result/share/omarchy/plugins/io.github.olafkfreund.nixi-button/BarWidget.qml`.
   This is the check the first attempt missed.
3. `grep -rn "F0625\|000f0625" nix/ install.py button/` returns nothing.
4. `grep -rniE "snowflake"` over `*.md *.nix *.qml *.json`, excluding
   `intent/ spec/ plan/`, returns nothing.
5. `install.py` parses, and its menu row parses as JSON with the icon
   resolving to exactly one character, U+F0674.
6. `button/manifest.json` still parses as JSON.
7. Runtime: rebuild home-manager, restart the bar, and confirm sparkles
   renders in the button, is centred, takes the theme colour, and still
   toggles the overlay. Confirm the Omarchy menu Help entry shows sparkles.
