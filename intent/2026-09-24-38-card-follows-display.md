---
status: draft
issue: 38
author: olafkfreund
---

# Intent: The card should follow the display it is on

## Problem

Nixi's card is a fixed 540x560 logical-pixel box on every monitor. Screen size
only ever clamps it; nothing drives it.

Nothing in this repo reads the display. A search for `Screen`, `screen`,
`monitor` or `devicePixelRatio` across every QML, JS and Nix file returns one
hit, and it is a comment (`Conversation.qml:43`). Omarchy's `Style` singleton
does not read the display either: its `spacingScale`, `fontScale` and
`effectiveSpacingScale` (`Style.qml:208-219`) all derive from `[font] base-size`
in the theme's `shell.toml`, which is a static number authored per theme.

So the same card, at the same pixel size, appears on a 1080p laptop panel and a
4K desktop monitor. Measured across three monitors (two 2560x1440, one
1920x1080): the card occupies 21% of screen width on the 1440p panels and 28% on
the 1080p one, so it visibly shrinks when moved to the larger display. At
3840x2160 it is 14% of the width and the body text renders at roughly half its
physical size.

The existing font-scale control does not compensate, and partly makes it worse:

- `fontScale` always starts at 1.0 (`Conversation.qml:57`, `Ask.qml:27`), with
  no value derived from the display, so a 4K user re-zooms every session.
- Ctrl+= scales the text but not the card. `agentSize` and `humanSize`
  (`:121-122`) multiply by `root.fontScale`; the geometry clamps at `:1195` and
  `:1198` do not. Zooming therefore crams larger text into the same 540px box,
  which is the opposite of what the user asked for.
- Roughly 23 text sites ignore `fontScale` entirely -- the status line, the
  permission dialog, the agent picker and the whole motion tuner -- so zooming
  makes the UI internally inconsistent.
- The pinned window uses raw literals (`:2247-2249`: `760`, `800`,
  `Qt.size(480, 420)`), bypassing both `Style.space()` and `fontScale`.
- `HarnessSelector.qml` clamps its width (`:98`) but not its height (`:99`), so
  on a small panel with a large theme base-size it can run off screen.

This issue already asks for the card to grow with its *content*. This intent
covers the other axis -- growing with the *display* -- because the two interact
and a fix for one that ignores the other will fight it.

## Proposed outcome

- The card's size is proportionate to the monitor it is on: it does not shrink
  when moved to a larger screen.
- On a high-resolution display it opens at a sensible size without the user
  having to zoom, while remaining adjustable.
- Ctrl+= grows the card along with the text, so zooming gains readable width
  rather than trading it away.
- Zoom applies consistently to every surface, not only the transcript.
- Nothing can exceed the screen bounds.

## Affected users and systems

- Every user, most visibly anyone on a 4K display or a multi-monitor setup with
  mixed resolutions.
- `Conversation.qml` (geometry clamps, `fontScale` default, the pinned window),
  `HarnessSelector.qml`, `MotionTuner.qml`, `Ask.qml` (settings persistence).
- No bridge, packaging or trust-model change.

## Constraints

- Must not set `QT_SCALE_FACTOR`, `QT_AUTO_SCREEN_SCALE_FACTOR` or
  `QT_ENABLE_HIGHDPI_SCALING`. Nixi is an in-process Quickshell plugin; the
  Omarchy shell owns the Qt environment, and Qt6 with `wp-fractional-scale-v1`
  already handles per-monitor buffer scale. A fractional-scale monitor renders
  correctly today and setting these would break it.
- Must not set `screen:` on the `PanelWindow`s. Leaving it unset matches
  upstream Omarchy's own menu and places the surface on the focused monitor.
- Must respect the theme's `[font] base-size` rather than override it: a user
  who has deliberately set a large base-size must not have it scaled twice.
- Pinned mode behaviour stays as it is.
- Must not regress the compact card for short exchanges, which this issue
  already calls for.

## Open questions

1. What drives the scale -- `screen.height`, physical DPI, or
   `Screen.pixelDensity`? Height is crude but predictable and survives an
   unusual physical size; DPI is more correct and more likely to surprise.
2. Should the derived scale be a starting value the user can then override and
   persist, or a permanent multiplier applied on top of their `fontScale`? The
   first is more predictable; the second needs only one binding.
3. `fontScale` is a single persisted value (`Ask.qml:152-155`, clamped 0.7-2.0).
   On a mixed-resolution multi-monitor setup, should it stay global or become
   per-monitor? Per-monitor is correct and materially more work.
4. How does this compose with the content-driven growth this issue already
   requests -- does the display scale set the maximum that content then grows
   into, or are they independent multipliers?
