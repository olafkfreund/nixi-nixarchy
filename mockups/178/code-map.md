# Code map for #178: everything that assumes the snowflake body

Read-only map of `snow-144b` at `main`, made on 2026-11-04 by an explorer
agent for the spec. Line numbers are approximate; re-find them by name.

## The body markup (index.html 700–760)

- **defs:**
  - `#glow` 707;
  - `#ballG` 708 (radial gradient, `cx=-24 cy=-30 r=112`, stops `.b0`–`.b2`);
  - `#glossG` 709;
  - `#nixD`/`#nixL` 710–711;
  - `clipL`/`clipR` 712–713 (JS fills them with the eye outline).
- **`#cam`, in order:** `#haloW`, `#raysW`, `#fxBack`, `#shadow` (0,108 62×9),
  `#orbBack`, `#vring`, `#workW` (r 96), `#zz`, `#qmark`, then `#body`.
- **`#body`, back to front:**
  - `#accBack`, `#sitBack`;
  - `path.ball` (fill `#ballG`), `g.ball.nix`;
  - `#face` (`#eL`/`#eR`: `path.eye#pL/#pR` + clipped `.slit` highlights);
  - `#tears`;
  - the gloss ellipses (736, 737);
  - `#rim` (`path.ball`, no fill);
  - `#accFront`, `#sitFront`, `#frost`.
- **After `#body`:** `#cue`, `#agentMark`, `#mirMk`, `#liveTag`, `#think`,
  `#anger`.
- **CSS that selects the body:**
  - `#body>.ball`, `#body>ellipse` (32, 76–89, with fill-box transforms);
  - `.b0` stops read `--body0…` (139);
  - `#rim` stroke `--rim` (140);
  - `.nix.glint` (386).

## Shape builders and every reader of the body's shape

- **Builders, run once at load:**
  - `snowPath(core=58)` 1187 (a hexagon, R = core/cos30);
  - `nixLambdas()` 1189 (six lambdas);
  - lines 1190–1191 put them into `path.ball` (the rim too) and `.nix`.
- **The face sphere:** `R=76` (1325) in `sph()`.
- **`EYE`** 1192: `{rx:23.5, ry:40.5, cx:27.5, cy:-4.5, tilt:.157}`;
  `EYE_HALFW` 1193.
- **Squash and stretch** 1617–1629: `bodyTr = translate(dxp, 76*(1-sy*pump))
  rotate(rot)`. The 76 keeps the bottom planted, assuming a bottom at y≈76.
  The shadow uses `scale(sx,1)`.
- **The wobble pivot:** `drawSkin` sets `pivots.wob=[0,-58]` for the sprout
  (1151), and the frame uses it at 1765–1767.
- **Situational props** (`drawSit` 1067–1128) are hard-coded to the
  hexagon:
  - hats: `translate(0 -62) … translate(0 84)`;
  - scarf at y 42–56 ±62;
  - tie at y 58–118;
  - headphone band;
  - shades at ±27.5,-12, bar at -31;
  - the chat and feed props.
- **Anchors in the frame** (1775–1790):
  - tie (0,58); hb/hf/gl (0,-4); nightcap/party hat/beanie (0,-84);
    scarf (0,50); chat (-74,-60); feed (74,-52);
  - `lift()` by -32·L;
  - headphone cup x `max(88, EYE_HALFW*sz+EYE.cx+22)`.
- **Plugin `PROP_BOX`** 1130: head `[-30,-112,60,54]`, left
  `[-98,-34,40,40]`, right `[58,-34,40,40]`, base `[-36,68,72,26]`.
- **Weather** (`wxStep` 1514–1580): the slot depends on whether a skin is
  worn (1517); cloud and drop positions are literals.
- **Frost** (`renderCue` 2042–2044): circles at the lambda tips.
- **Tears:** x = ±36, y 30→78.
- **Orbs:** r ≥ 84.
- **Rings:** the voice ring at 84+; the work ring at r 96.
- **zz/qmark/think/anger:** fixed coordinates, with pivots at
  (80,-80)/(60,-60)/(62,-62); sweat at (-70,-44).
- **Click area:** `sendRegion` takes the bounding box of `#body` (3497).
- **Readers through the DOM:**
  - `cardPlace` 2652 and the bubble's `geo()` 3631–3637 use `#body > .ball`,
    and the width of `#body .nix` as his reach;
  - the glint 2115 uses `#body .nix`.

  A body without `.ball`/`.nix` breaks the reach maths and the notch/goo
  transitions.
- **`miniNixi()`** 1162–1175 (Settings previews) redraws its own ball, rim,
  lambdas and static eyes. Its eye `cx` is 25.5, against the live 27.5.
  Callers: `drawPreview` 3149 and the skin grid 3202–3206 (`viewBox -125
  -150 250 250`).

## Look, colour and skins

- **`applyLook`** 1027–1045: `bodyStops(LOOK.body)` → `--body0..2`; `--rim`;
  `--pupL/R`, `--whiteL/R`, `--lineL/R`; then `drawSkin`, `drawSit` and
  `capColors`.
- **`drawSkin`** 1138–1159:
  - halo at (0,-114);
  - crown, sprout and bow all anchored at y=-58, the hexagon's top;
  - `plug:` props through `drawProp` into a `PROP_BOX`.
- **`server.py`:**
  - `SKINS` 262;
  - `look()` 266–280 accepts only known keys and silently drops others, so a
    new `character` key must be added there;
  - `state_info` 5206 carries `look`, `skins` and `plugin_props`.
- **`plugins.py`:** `PROP_KEYS` 28; the anchor must be head, left, right or
  base; the SVG sanitiser is at 388–490.

## Eyes

- `eyePts` 1297–1313, `pupilPts` 1315–1321, `PUP` 1197–1209, `MOODS`
  1214–1255.
- **Per frame** (1665–1691):
  - `sph()` yaw/pitch;
  - the talk swell `1+lvl*.05`;
  - the eye centre `side*max(EYE.cx, EYE_HALFW*z+2.6)`;
  - the pupil is clamped to the eye's own ellipse.
- **Blink:** 1660–1662.
- **The only ties between the eyes and the hexagon:** `R=76`, the `EYE`
  constants, and the glasses/shades/headphone offsets.

## The animation loop

- **Slow frames** (1583–1584): above a 32 ms average over 120 frames,
  `lowFx` removes the glow filter from four groups. Those are the only
  per-frame filters.
- **Under `REDUCED`:** wind, shiver, sit sway, weather and stage animations
  stop. Jelly, breathing and tilt don't.

## Tests

- `tests/accessories_fit.mjs`: every skin and plugin anchor fits 340×460
  through bounces; a base prop hides the scarf.
- `tests/test_plugin_maps.py` 88–98: `plug:` validation.
- **Nothing tests** `miniNixi`, `snowPath`, the eye geometry, body colours or
  `look()` colour validation.
