---
status: approved
issue: 14
spec: spec/2026-09-17-14-sparkles-icon.md
---

# Plan: Sparkles instead of the snowflake, on every nixi surface

Rebuilt on `origin/master` at 1a7f9cb (v0.10.0). The first version of this
plan was written against a stale local `master` (v0.9.7) and targeted files
that v0.10.0 had moved or deleted. See "Correction" below.

## Approved decisions

Nixi's mark becomes Material Design Icons `creation` — three four-pointed
stars — on every surface it has. The snowflake is removed entirely, including
the nix-flake pun, which was dropped by explicit decision.

At v0.10.0 every remaining surface is a Nerd Font glyph, so this change is
glyph-only:

- **Glyph:** U+F0674 in the Nerd Fonts private use area, literal `󰙴`. Used by
  the bar button and the Omarchy menu entry.
- In `install.py` the same character is written as the escape `\U000f0674` —
  **eight** hex digits. `\u` takes four and silently emits the wrong character
  plus a stray digit.

The SVG path form is not needed here, because v0.10.0 deleted
`share/ui.html`. If an avatar is reintroduced it should use the MDI `creation`
path:

```
M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74
```

Load-bearing facts:

- Nixi ships **two** Omarchy plugins: the overlay (`io.github.olafkfreund.nixi`)
  and the bar widget (`io.github.olafkfreund.nixi-button`, source at `button/`),
  because Omarchy gives a third-party plugin one or the other, not both.
- The desktop loads the widget from
  `share/omarchy/plugins/io.github.olafkfreund.nixi-button/BarWidget.qml`.
  Verification must check that built path, not just the source tree.
- `BarIconButton` renders `text` through an `OpticalGlyph` whenever
  `iconComponent` is null, which hands us optical centring and theme colour.
- `nix/hm-module.nix` and `install.py` are two install paths for one menu
  entry and must change together.

## Steps

1. `button/BarWidget.qml`: change `text: ""` to `text: "󰙴"` → verify by grep.
2. `button/BarWidget.qml`: delete the whole `iconComponent: Component { ... }`
   block including the `Canvas` and its pixel array. Leave `overlayId` and
   `launch()` untouched → verify `grep -c Canvas` is 0 and braces balance.
3. `button/BarWidget.qml:6-8`: rewrite the comment, which claims "no font
   glyphs, so it can never tofu" → verify by grep for `snowflake`.
4. `button/manifest.json:8`: "One snowflake in the bar" becomes "One sparkle in
   the bar" → verify the file still parses as JSON.
5. `nix/hm-module.nix:235`: `icon = "󰘥";` becomes `icon = "󰙴";` → verify by
   grep for the old codepoint.
6. `install.py:390`: `\U000f0625` becomes `\U000f0674` → verify the file parses
   and the row parses as JSON with a one-character icon.
7. `nix/hm-module.nix:103`: reword "Install the snowflake bar button".
8. `README.md:54`: reword the option-table entry.
9. `docs/FORK.md:60`: update the fork-divergence table row.

Steps 5 and 6 land in the same commit. All steps may land as one commit.

## Tests

```bash
# 1. old codepoint gone from every install path
grep -rn "F0625\|000f0625" nix/ install.py button/       # expect: no output

# 2. no stale user-facing prose
grep -rniE "snowflake" --include="*.md" --include="*.nix" \
  --include="*.qml" --include="*.json" . \
  | grep -vE "^(\./)?(intent|spec|plan)/"                # expect: no output

# 3. the Canvas is gone
grep -c "Canvas" button/BarWidget.qml                    # expect: 0

# 4. installer parses; menu row is valid JSON with a one-char icon
python3 -c "import ast;ast.parse(open('install.py').read());print('parses')"
grep -c 'U000f0674' install.py                           # expect: 1

# 5. plugin manifest still valid
python3 -c "import json;json.load(open('button/manifest.json'));print('ok')"

# 6. package builds
nix build .#nixi

# 7. THE CHECK THE FIRST ATTEMPT MISSED:
#    the built plugin path the desktop actually loads carries the glyph
grep -c '󰙴' \
  result/share/omarchy/plugins/io.github.olafkfreund.nixi-button/BarWidget.qml
                                                         # expect: 1
```

Runtime checks, which the greps cannot cover:

- Rebuild home-manager, then restart the bar. Sparkles renders in the button,
  is centred in its slot, takes the theme foreground colour, and still toggles
  the Nixi overlay.
- Open the Omarchy menu. The Help entry shows sparkles, not a question mark.

Until home-manager is rebuilt the desktop keeps loading the previous store
path and the icon will not appear to change. That is deployment lag, not a
bug.

## Rollback

`git revert` the implementation commit. The change is appearance-only and
touches no state, no service, no trust surface and no on-disk format, so a
revert is complete and needs no migration.

## Correction

The first version of this plan was written against a stale local `master`
(v0.9.7) that had never been fetched, and it targeted:

- a root `BarWidget.qml` — v0.10.0 moved it to `button/BarWidget.qml`
- `share/ui.html`'s favicon and `#bot` avatar — v0.10.0 deleted that file when
  the omarchy-ask overlay card replaced the browser widget

It also recorded the installed `io.github.olafkfreund.nixi-button` directory
as a stale leftover. It is not: it is the current, deliberate second plugin,
and it is the only thing the bar loads.

The decisions were never wrong, only the file inventory. `master` has since
been fast-forwarded to `origin/master` and this plan rebuilt against it.

## Out of scope

`preview.png` shows the old bar icon, is referenced nowhere in the repo, and
needs a manual re-capture.
