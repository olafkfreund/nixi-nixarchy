---
status: approved
issue: 203
author: olafkfreund
---

# Intent: Props that fit each body

Follows #178. Code is in olafkfreund/nixoarchy-snowflake,
`app/static/index.html`, read at `b4de326`.

## Problem

**No headphones on three of the four bodies.** `headphones` is in `fits` for
Snowflake only, so on Terminal, Robot and Devil music shows nothing.
`frame()` places the cups at x ±88, y -8 for every body, spanning ±71 to ±105
at rest. They also move with his gaze and swell with the beat:

| Body | What the cups or band hit |
| ---- | ------------------------- |
| Terminal | Case to ±92, screen to ±78: the cups cover 7 px of screen |
| Robot | Ears ±82 to ±94, shell ±84, visor ±74: the cups cover the ears and 3 px of visor. The band runs behind the antenna light |
| Devil | Body ±86, wings ±74 to ±95, tail tip x 75 to 87: the cups cover the wings and tail tip and overlap the face box (±74) by 3 px. The band runs behind the horn tips |

**Blank skin tiles.** On Robot, the `crown` and `sprout` tiles show a bare Robot,
the same as the `none` tile. Picking one saves it and draws no prop, with no sign
why. Having it also moves
the weather cloud to the hat slot (`wxHat()`) and adds a Skin row to the colour
picker. The same happens without a tile: wear a crown on Snowflake, switch to
Robot, or type `/skin crown`. Terminal and Devil fit all five skins.

## Proposed outcome

- With music playing, every body the owner accepts wears headphones that don't
  cover its face or marks.
- A skin the current body can't wear is never offered as a tile.
- Switching to a body that can't wear the saved skin looks like "no skin", and
  switching back brings the skin back.

## Affected users and systems

The Nixi window and the Look settings tab in nixoarchy-snowflake, for anyone
not on Snowflake. `tests/character_fit.mjs` checks each prop in `fits` against
the window only, not against the face or marks, so the spec must say how that's
checked. No server change: `SKINS` stays.

## Constraints

- Snowflake stays pixel-identical. The eye rig doesn't change.
- Keep it small: no new skins, no new art for hats, and Robot's hats stay off.
- The window limit of 340 × 460 still holds, through a bounce.

## Open questions

Answered by the user on 2026-11-05: all five as recommended below.

1. **Headphones: per-body positions, a different look, or stay off? Terminal
   too?** Recommend per-body positions with the same art, Terminal included,
   because it needs no new art and music then shows on every body. Numbers come
   in the spec, checked with the gaze and beat, and a body that still looks wrong
   stays off.
2. **Can decision 5's headphone rule be relaxed?** Decision 5 of
   plan/2026-11-04-178-characters.md says the cups clear the body, or headphones
   stay out of `fits`. Recommend "cups may overlap the case, ears or wings, but
   never the face box or a mark", because that's how headphones sit on a head.
   Devil's right cup would still cover the tail tip during music.
3. **Non-fitting tiles: hide, or show disabled with a reason?** Recommend hide,
   because the tile looks the same as `none`, only two tiles on one body are
   affected, and a reason would be one more string to translate.
4. **A saved skin that doesn't fit the new body, and `/skin crown` on Robot?**
   Recommend keeping it saved and treating it as `none` on that body, with
   nothing lost when switching back. `/skin` also says it doesn't fit, because a
   typed command otherwise gets no answer.
5. **Fix the preview colour here?** Recommend no. Previews always get the saved
   look, so they differ from the global colours only in "Surprise me" mode, and
   Snowflake isn't affected.
