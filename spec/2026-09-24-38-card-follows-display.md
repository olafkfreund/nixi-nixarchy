---
status: approved
issue: 38
intent: intent/2026-09-24-38-card-follows-display.md
---

# Spec: The card should follow the display it is on

Approved direction: derive an initial scale from **`screen.height`**, clamped,
used as `fontScale`'s **starting value** when settings carry none. The user can
still override it and the override persists.

## Design

Four changes, in dependency order.

**1. A derived display scale (`Conversation.qml`).**

```qml
readonly property real displayScale:
  Math.max(1, Math.min(2, (panel.screen ? panel.screen.height : 1080) / 1080))
```

1080p is the baseline, so today's appearance is unchanged on a 1080p panel --
the scale is exactly 1. A 1440p panel gives 1.33, a 4K panel 2.0 at the clamp.
The `panel.screen` null guard matters because the layer surface is created with
an unset `wl_output`.

Height rather than DPI, per the approved option: predictable, and it does not
misbehave on panels that misreport their physical size.

**2. Seed `fontScale` from it (`Conversation.qml:57`, `Ask.qml:152-155`).**

`fontScale` stays a persisted, user-owned value clamped 0.7-2.0
(`Ask.qml:24-25`). The only change is its default: when `nixi.json` carries no
`fontScale`, it starts at `displayScale` instead of `1`. A stored value always
wins, so a user who has already chosen a zoom is unaffected and never has it
silently changed.

This respects the theme constraint: the theme's `[font] base-size` continues to
flow through `Style.font.*` independently, and `displayScale` seeds only the
user-facing zoom, so a deliberately large base-size is not scaled twice.

**3. Make the card geometry follow both scales
(`Conversation.qml:1195, 1198-1199`).**

Today the three clamps use `Style.space(560)` and `Style.space(540)` with no
`fontScale` term, while the text sizes at `:121-122` and `:651-652` do multiply
by it. That asymmetry is why zooming currently crams larger text into the same
box. Multiply the clamps by `root.fontScale` so the card grows with the text it
holds.

The existing `Math.min(..., parent.height - Style.gapsOut * 2)` bound is kept
unchanged, so nothing can exceed the screen however large the scale.

This composes with, rather than competes with, the content-driven growth this
issue already asks for: the scaled value becomes the *maximum* that content
grows into.

**4. Fix the surfaces that ignore scale entirely.**

- `Conversation.qml:2247-2249` -- the pinned window's raw `760`, `800` and
  `Qt.size(480, 420)` become `Style.space()` values multiplied by `fontScale`.
  These are the only unscaled literals of consequence in the repo.
- `HarnessSelector.qml:99` -- height gains the same
  `Math.min(..., parent.height - Style.gapsOut * 2)` clamp its width already has
  at `:98`, so it cannot run off a small panel.
- The roughly 23 text sites that read `Style.font.*` without `root.fontScale`
  (`Conversation.qml:1899, 1927, 2052, 2142, 2174, 2187, 2197, 2232`, and all of
  `MotionTuner.qml` and `HarnessSelector.qml`). Route them through one shared
  helper so zoom applies uniformly instead of leaving the permission dialog and
  agent picker at fixed size while the transcript grows.

## Alternatives rejected

**`Screen.pixelDensity` / physical DPI.** More correct in principle; not chosen.
It surprises on TVs and panels that misreport physical dimensions, where height
degrades predictably.

**A permanent multiplier on top of `fontScale`.** Rejected with the approved
option: the user's zoom would mean something different per monitor, and the
stored value would no longer describe what they see.

**Set `QT_SCALE_FACTOR` or friends.** Explicitly forbidden by the intent. Nixi
is an in-process Quickshell plugin; the Omarchy shell owns the Qt environment
and Qt6 with `wp-fractional-scale-v1` already handles per-monitor buffer scale
correctly. Setting these would break fractional-scale monitors that render
correctly today.

**Bind `screen:` on the `PanelWindow`s.** Rejected: leaving it unset matches
upstream Omarchy's menu and places the surface on the focused monitor, which is
the wanted behaviour.

**Per-monitor `fontScale`.** Correct for mixed-resolution setups and materially
more work; deferred. `displayScale` seeding gets most of the benefit at a
fraction of the cost. Worth a follow-up issue.

## Risks

- **A stored `fontScale` of exactly 1 is indistinguishable from unset** if the
  settings reader coerces a missing key to 1. `Ask.qml:152-155` must
  differentiate genuinely absent from present-and-1, or a 4K user who
  deliberately chose 1.0 has it overridden once. This is the sharpest risk in
  the change and the plan must address it explicitly.
- **Moving between monitors.** `displayScale` seeds at construction; it does not
  re-derive when the card opens on a different screen. Acceptable for a first
  pass and consistent with a single persisted value, but it means the scale
  reflects wherever it first appeared. Should be stated, not hidden.
- **Interaction with the content-growth work in this issue.** Both change the
  same three clamps. Whichever lands second must be rebased onto the first
  rather than merged blind.
- **Clamp ceiling of 2.** An 8K or unusually tall panel stops at 2. Deliberate:
  an unbounded scale produces absurd geometry.
- Host-specific risk: visual only, and visible on every host. No packaging,
  bridge or trust change.

## Verification

1. **Automated.** `nix flake check`; `node --test bridge/*.test.js`. The
   `displayScale` expression is pure arithmetic and can be unit-tested if it is
   extracted to `TextFormat.js`, following the `TourModel.js` precedent.
2. **Static.** No `QT_SCALE_FACTOR`, `QT_AUTO_SCREEN_SCALE_FACTOR` or
   `QT_ENABLE_HIGHDPI_SCALING` anywhere in `nix/`, `bin/` or `systemd/`; no
   `screen:` property added to any `PanelWindow`; no raw pixel literals left in
   `Conversation.qml:2247-2249`.
3. **Runtime, the reported symptom.** On a 1440p and a 1080p panel, the card
   occupies a comparable fraction of each screen. Before this change it is 21%
   and 28% respectively.
4. **Runtime, zoom.** Ctrl+= widens and heightens the card, not just the text.
   Ctrl+0 returns to the seeded scale, not to 1.
5. **Runtime, uniformity.** With zoom applied, the permission dialog, status
   line and agent picker scale with the transcript.
6. **Runtime, no regression.** On a 1080p panel with no stored `fontScale`, the
   card is the same size as before this change -- `displayScale` is exactly 1.
7. **Runtime, respect for stored settings.** With a stored `fontScale`, the value
   survives a restart unchanged.
8. **Runtime, bounds.** On 1366x768 with a large theme base-size, neither the
   card nor `HarnessSelector` exceeds the screen.
