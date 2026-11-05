---
status: draft
issue: 203
author: olafkfreund
---

# Intent: Props that fit each body

Follows #178. Code is in olafkfreund/nixoarchy-snowflake,
`app/static/index.html`, read at `b4de326`.

## Problem

**No headphones on three of the four bodies.** `headphones` is in `fits` for
Snowflake only, so on Terminal, Robot and Devil music shows nothing.
`frame()` places the cups at x ±88, y -8 for every body, spanning ±71 to ±105:

| Body | What the cups or band hit |
| ---- | ------------------------- |
| Terminal | Case to ±92, screen to ±78: the cups cover 7 px of screen |
| Robot | Ears ±82 to ±94, shell ±84, visor ±74: the cups cover the ears and 3 px of visor. The band runs behind the antenna light |
| Devil | Body ±86, wings ±74 to ±95, tail tip x 75 to 87: the cups cover the wings and tail tip and touch the face box (±74). The band runs behind the horn tips |

**Blank skin tiles.** On Robot, the `crown` and `sprout` tiles are empty.
Picking one saves it and draws nothing, with no sign why. Having it also moves
the weather cloud to the hat slot (`wxHat()`) and adds a Skin row to the colour
picker. The same happens without a tile: wear a crown on Snowflake, switch to
Robot, or type `/skin crown`. Terminal and Devil fit all five skins.

## Proposed outcome

- With music playing, every body the owner accepts wears headphones that don't
  cover its face or marks.
- A skin the current body can't wear is never offered as a blank tile.
- Switching to a body that can't wear the saved skin looks like "no skin", and
  switching back brings the skin back.

## Affected users and systems

The Nixi window and the Look settings tab in nixoarchy-snowflake, for anyone
not on Snowflake. `tests/character_fit.mjs` covers each prop in `fits`, so new
entries are tested with no new test code. No server change: `SKINS` stays.

## Constraints

- Snowflake stays pixel-identical. The eye rig doesn't change.
- Keep it small: no new skins, no new art for hats, and Robot's hats stay off.
- The window limit of 340 × 460 still holds, through a bounce.

## Open questions

1. **Headphones: per-body positions, a different look, or stay off? Terminal
   too?** Recommend per-body cup positions with the same art, Terminal included,
   because it's a small data field and music then shows on every body. Rough
   starts: Terminal and Robot about ±96 and ±94. Decide the final numbers from a
   mock-up, and a body that still looks wrong stays off. Keep one band path
   unless the mock-up says otherwise.
2. **Can decision 5 of plan/2026-11-04-178-characters.md be relaxed?** It says
   the cups clear the body, and art stays within ±96. A cup can't clear Robot's
   ±84 shell and stay in ±96. Recommend "cups may overlap the case, ears or
   wings, but never the face box or a mark", because that's how headphones look
   on a head. Devil's right cup would still cover the tail tip during music.
3. **Non-fitting tiles: hide, or show disabled with a reason?** Recommend hide,
   because there's no picture to show, only two tiles on one body are affected,
   and a reason would be one more string to translate.
4. **A saved skin that doesn't fit the new body?** Recommend keeping it saved and
   treating it as `none` on that body: `none` tile lit, no Skin colour row, cloud
   in its usual slot. Nothing is lost when switching back.
5. **Fix the preview colour here?** Recommend no. `miniNixi` always gets the
   saved look, so its colours differ from the global ones only in "Surprise me"
   mode. The fix needs per-preview copies of the shared gradients. Snowflake
   isn't affected.
