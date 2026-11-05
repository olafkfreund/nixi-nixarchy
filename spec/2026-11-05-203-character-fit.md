---
status: approved
issue: 203
intent: intent/2026-11-05-203-character-fit.md
---

# Spec: Props that fit each body

All code is in olafkfreund/nixoarchy-snowflake at `b4de326`, in
`app/static/index.html` (the page) and `tests/character_fit.mjs` (the fit test).
No server change.

## Design

### Headphones

Each `CHARACTERS` entry gets two fields, and `headphones` joins `fits` on the
three other bodies.

| Body | `cupX` | `band` |
| ---- | ------ | ------ |
| Snowflake | 88 | `M-84 -20C-100 -144 100 -144 84 -20` (today's path) |
| Terminal | 106 | `M-105 -30C-128 -140 128 -140 105 -30` |
| Robot | 104 | `M-103 -30C-124 -146 124 -146 103 -30` |
| Devil | 106 | `M-105 -30C-128 -140 128 -140 105 -30` |

The user looked at `mockups/203/headphones-fit.png` and said "mockup approved
looks fine continue". These positions and the wider per-body bands are the
user's choice, subject to the fit test through sway and bounce. That test moved
each cup 1 px out from the mock-up's ±105 and ±103, as "Measured so far" shows;
the bands stay as shown. The bands are a new shape: the intent only asked for positions. With Snowflake's band the cups
float clear of it, and on Terminal it vanishes behind the case. No body stays
off.

- `frame()` (~1913): `X=Math.max(BODY.cupX,EYE_HALFW*G.sz.x+EYE.cx+22)`. The eye
  rig and the gaze and beat movement don't change.
- `drawSit()` (~1187): both band paths use `d:BODY.band`.
- `setCharacter()` (~1302): after `BODY=next`, write `BODY.band` to both band
  paths if `SIT_P` exists. `applyLook` calls `drawSit` before `setCharacter`, so
  `drawSit` alone would draw the old body's band.

Decision 5 of plan/2026-11-04-178-characters.md is replaced for headphones, as
the intent's answer 2 says: cups may overlap the case, ears or wings, but never
the face box or a mark. Devil's right cup covers the tail tip during music.

### Skins that don't fit

Two helpers beside `applyAnchors` (~1296):

```js
const bodyFits=(c,f)=>c===CHARACTERS.snowflake||c.fits.has(f)||(f.startsWith('plug:')&&c.fits.has('plug'));
const wornSkin=L=>bodyFits(CHARACTERS[L.character]||CHARACTERS.snowflake,L.skin)?L.skin:'none';
```

- `applyAnchors` uses `bodyFits`, which holds the condition it has today.
- **Tiles:** `renderSettings` (~3528) filters `info.skins` with `bodyFits` for
  `L.character`, and lights the tile for `wornSkin(L)`. Plugin tiles always fit.
  The grid redraws after a character is picked, because `setSetting` calls
  `renderSettings`.
- **Saved skin:** `look.skin` is never rewritten, so switching back restores it.
  `wornSkin` replaces the raw check in `wxHat()` (~1600), `skinless` (~1896),
  the party confetti in `sitStep` (~2412) and the Skin colour row in
  `renderParts` (~3419). `drawSkin` still builds the hidden skin, as it does now.
- **`/skin`** (`slash`, ~3829): if `!bodyFits(BODY,k)`, answer
  ``tick(`${k} doesn't fit ${BODY.label}`,true)`` and save nothing. The text is
  plain English, like the rest of that command's messages.

## Alternatives rejected

- **Narrower bands, so the group's box stays in the window.** It would change
  the look the user chose and put Robot's band across the antenna light. The box
  overstates the band, as "Risks" shows.
- **Different art, such as earbuds.** It costs new art on three bodies, and the
  intent's answer 1 keeps the same art.
- **Disabled tiles with a reason.** Rejected by the intent's answer 3.
- **Clearing the saved skin on a body switch.** It loses the user's choice.
- **Fixing preview colours.** Rejected by the intent's answer 5.

## Risks

- **The existing window check fails on the wider bands.** It measures the `hb`
  group's bounding box, whose corners rotate out of the window during `roll`:
  Terminal -1 to 342 and -7 up top, Robot -3 to 343 and -8 up top, against limits
  of 3 and 337. The band's real ink stays in, so the test must measure ink (see
  "Verification"). This changes a test to pass the design, so review it as such.
- **Thin face margin.** The cups clear the face box by 0.7 px at the worst
  combination (gaze 14, talk lift, full sway, beat). Gaze 14 is the eye test's
  extreme; the moods I checked reach about 7.5.
- **A stale colour target.** With the Skin part selected, switching to a body
  that can't wear the skin leaves `pkPart='skin'` with no chip. Picking the
  `none` tile does the same today, so this leaves it alone.
- **Other props.** Cups can overlap `left`/`right` plugin props, and the band
  can pass near the weather cloud and the notification marks. Snowflake's cups
  overlap those plugin props today. Not rendered together: check in the live
  test.
- Only the page changes, so a problem shows on any host running the companion
  and goes away by reverting.

## Verification

Changes to `tests/character_fit.mjs`:

1. **Registry:** `cupX` is finite and `band` a non-empty string; Snowflake's are
   exactly 88 and today's path.
2. **Cups clear the face and marks,** for each body except Snowflake: sample
   the shell ellipse's outline (rx 18.5, ry 29.5, stroke included) in `#body`
   coordinates, and fail if a point falls inside `faceBox` or a `.avoid`'s
   `bodyBox`. Run gaze 0 and ±14, lift 0 and 1, sway 0 and ±28, beat 0 and 1.
   `frame()` moves the springs and `beat` before it reads them, so the test must
   reach the real values: drive lift with a talking mood, set sway and beat for
   the last frame, and assert the cup's `rotate` and `scale`. No 0.5 px tolerance.
3. **Window, by ink:** the `headphones` case samples the band's path, widened by
   half its stroke, and the cup outlines, instead of the groups' boxes. The eye
   test already does this, because "a box round a leaning oval has empty
   corners". The 3 px margin and the bounce and `roll` stay.
4. **Pixels:** add a `music` state to Snowflake's comparison with `origin/main`.
   It asserts the cups are drawn (opacity 1) in both pages, and 0 px off, because
   the comparison's usual allowance doesn't prove "identical".
5. **Skins:** on Robot, no `crown` or `sprout` tile. With `crown` saved, the
   `none` tile is lit, there's no Skin chip and `wxHat()` is false. `/skin crown`
   leaves `look.skin` alone. Switching to Snowflake restores the crown.

Then run the Python test wrapper, and a live check on the desktop: music on each
body, and the Look tab on Robot.

### Measured so far

A scratch copy of the page with this design applied, on a stub API, not the real
server:

| Check | Terminal | Robot | Devil |
| ----- | -------- | ----- | ----- |
| Smallest gap to face box, all combinations | 0.7 | 0.7 | 0.7 |
| Marks hit | 0 | 0 | 0 |
| Ink range in x through bounce and roll, gaze -14 | 17 to 323 | 19 to 321 | 17 to 323 |
| Ink range in y, same run | 16 to 313 | 19 to 311 | 16 to 313 |

At the mock-up's ±105 and ±103 the same check overlapped the face box by 0.3 px,
which is why the cups moved. Snowflake's pixels matched the untouched page in all
five states, 0 px off, with the cups at opacity 1 in the `music` state.

**Limits of the mock-up and these numbers:** the PNG shows ±105 and ±103, and
only rest and the gaze and beat extremes, not sway, lift or bounce. The fit test as a whole didn't
run, because its save and reload cases need the real server. Tests 2, 3 and 5
above are measured or designed, not yet written. Nothing ran on the desktop.
