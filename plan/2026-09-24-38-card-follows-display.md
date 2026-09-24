---
status: draft
issue: 38
spec: spec/2026-09-24-38-card-follows-display.md
---

# Plan: The card should follow the display it is on

Approved decisions, carried over so this file stands alone:

- `displayScale` derives from **`screen.height`**, clamped to 1.0-2.0, with
  1080p as the baseline so nothing changes on a 1080p panel.
- It seeds `fontScale`'s **default only**. A stored `fontScale` always wins and
  is never silently rewritten.
- The card geometry clamps gain a `fontScale` term, so zoom grows the card as
  well as the text.
- **Never** set `QT_SCALE_FACTOR`, `QT_AUTO_SCREEN_SCALE_FACTOR` or
  `QT_ENABLE_HIGHDPI_SCALING`; never bind `screen:` on the `PanelWindow`s. Qt6
  plus `wp-fractional-scale-v1` already handles buffer scale, and fractional
  monitors render correctly today.

## The risk the spec deferred here, now resolved

`Ask.qml:152-155` reads `var scale = Number(data.fontScale)` and falls back to
`1` when not finite. `Number(undefined)` is `NaN`, so **unset and a stored `1`
both collapse to `1`** -- confirmed by reading the code. The raw value is still
distinguishable *before* coercion, so step 2 tests `data.fontScale === undefined`
first.

This matters in practice rather than theoretically: `flushSettings()`
(`Ask.qml:184-200`) only runs when the UI changes a setting, so a user who has
never touched font scale, the motion tuner or the agent picker has no
`fontScale` key at all. Measured on p620: `~/.config/omarchy/nixi.json` contains
only `{"trust": …}`. The seeding therefore reaches real users and is not a dead
path.

## Steps

1. `Conversation.qml`: add
   `readonly property real displayScale: Math.max(1, Math.min(2, (panel.screen ? panel.screen.height : 1080) / 1080))`.
   The `panel.screen` null guard is required -- the layer surface is created with
   an unset `wl_output`.
   -> verify by logging it on a 1080p and a 1440p panel: expect `1` and `1.333`.

2. `Ask.qml:152-155`: change the fallback from `1` to the seeded value, testing
   presence before coercion:
   `data.fontScale === undefined ? <seed> : clamp(Number(data.fontScale))`,
   keeping the existing `isFinite && > 0` guard for a present-but-garbage value.
   -> verify by tests A and B below.

3. `Conversation.qml:1195, 1198, 1199`: multiply the `Style.space(560)` and
   `Style.space(540)` terms by `root.fontScale`. Keep the existing
   `Math.min(…, parent.height - Style.gapsOut * 2)` bound untouched so nothing
   can exceed the screen.
   -> verify by runtime check 2.

4. `Conversation.qml:2247-2249`: replace the raw `760`, `800` and
   `Qt.size(480, 420)` with `Style.space()` values multiplied by `fontScale`.
   -> verify by `grep -nE '(implicitWidth|implicitHeight): [0-9]+' Conversation.qml`
   returning nothing.

5. `HarnessSelector.qml:99`: wrap the height in the same
   `Math.min(…, parent.height - Style.gapsOut * 2)` clamp its width already has
   at `:98`.
   -> verify by runtime check 5.

6. Route the text sites that ignore zoom through one shared helper:
   `Conversation.qml:1899, 1927, 2052, 2142, 2174, 2187, 2197, 2232`, and every
   `Style.font.*` read in `MotionTuner.qml` and `HarnessSelector.qml`.
   -> verify by runtime check 4.

7. If `displayScale` is extracted as a pure function into `TextFormat.js`, add
   unit tests for the clamp boundaries. Otherwise cover it by the runtime checks
   alone -- do **not** add a QML test framework, which the spec rejected as
   costing more than the code it covers.
   -> verify by `node --test` if extracted.

## Tests

```bash
nix flake check --print-build-logs
node --test bridge/*.test.js

# The two forbidden classes of change, asserted statically
grep -rn 'QT_SCALE_FACTOR\|QT_AUTO_SCREEN_SCALE_FACTOR\|QT_ENABLE_HIGHDPI_SCALING' nix/ bin/ systemd/
# expect: no output
grep -n 'screen:' *.qml
# expect: no PanelWindow gains a screen binding
```

**Test A -- unset seeds.** With no `fontScale` key in
`~/.config/omarchy/nixi.json`, open the card on a 1440p panel. Expected: text
and card open larger than before, at scale 1.333.

**Test B -- stored value wins.** Set `"fontScale": 1` explicitly in
`nixi.json`, open on the same 1440p panel. Expected: scale exactly 1, i.e. the
deliberate choice is respected and **not** overridden. This is the regression
the resolved risk above exists to prevent, and it must be run on a
higher-than-1080p panel or it proves nothing.

Runtime checks, after rebuild and `omarchy-restart-shell`:

1. **The reported symptom.** The card occupies a comparable fraction of a 1440p
   and a 1080p screen. Before this change it is 21% and 28% respectively.
2. **Zoom grows the card.** Ctrl+= widens and heightens it, not just the text.
   Ctrl+0 returns to the seeded scale, not to 1.
3. **1080p unchanged.** With no stored `fontScale` on a 1080p panel, the card is
   the same size as before -- `displayScale` is exactly 1.
4. **Uniform zoom.** With zoom applied, the permission dialog, status line and
   agent picker scale with the transcript.
5. **Bounds.** On 1366x768 with a large theme base-size, neither the card nor
   `HarnessSelector` exceeds the screen.
6. **Theme not double-scaled.** With a theme `[font] base-size` of 20, the card
   is large but not absurd -- the theme scale and `displayScale` must not
   compound.

## Known limitation, to state rather than hide

`displayScale` is evaluated when the card is constructed and does not re-derive
if the card later opens on a different monitor. On a mixed-resolution setup the
scale reflects wherever it first appeared. This is consistent with `fontScale`
being a single persisted value and is accepted for this change; per-monitor
scale is the deferred follow-up named in the spec.

## Rollback

`git revert` the implementation commit.

- Steps 1, 3, 4, 5, 6 are presentation-only with no persisted state.
- **Step 2 is the one with a tail.** Once the card has seeded `fontScale` and
  anything triggers `flushSettings()`, the seeded value is written to
  `nixi.json` and survives a revert -- the user is left at, say, 1.333 with the
  old code. That is harmless (it is a valid value the user could have chosen)
  but it is not a clean undo. To fully restore, delete the `fontScale` key from
  `~/.config/omarchy/nixi.json` after reverting.
- If only the geometry change is unwanted, revert step 3 alone and keep the
  seeding: text scales with the display, card size stays as today.
