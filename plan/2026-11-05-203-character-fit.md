---
status: approved
issue: 203
spec: spec/2026-11-05-203-character-fit.md
coders:
  1: codex   # small tricky logic: the band's draw order and per-body cup base; the user chose Codex
  2: codex   # small tricky logic: one fit rule through five readers of the skin; the user chose Codex
  3: codex   # test logic that must reach the real spring values; the user chose Codex
reviewers:
  - codex    # read-only `codex review --base origin/main` on the PR
  - agy      # exported files: body geometry and the test's reach
---

# Plan: Props that fit each body

## Decisions (approved, so this file stands alone)

Code is in olafkfreund/nixoarchy-snowflake at `b4de326`: `app/static/index.html`
(the page) and `tests/character_fit.mjs` (the fit test). Line numbers are at that
commit. Work in a new worktree `../nixoarchy-snowflake-203`, branch
`feat/203-character-fit`, from `origin/main`. No server change.

1. **Headphones on every body,** same cup art. Positions and bands below are the
   user's choice from `mockups/203/headphones-fit.png`. The PNG shows ±105 and
   ±103; the user approved 1 px wider after the fit check.

   | Body | `cupX` | `band` |
   | ---- | ------ | ------ |
   | Snowflake | 88 | `M-84 -20C-100 -144 100 -144 84 -20` (today's path) |
   | Terminal | 106 | `M-105 -30C-128 -140 128 -140 105 -30` |
   | Robot | 104 | `M-103 -30C-124 -146 124 -146 103 -30` |
   | Devil | 106 | `M-105 -30C-128 -140 128 -140 105 -30` |

2. **The cup rule** replaces decision 5 of plan/2026-11-04-178-characters.md for
   headphones: cups may overlap the case, ears or wings, but never the face box
   or a mark. Devil's right cup covers the tail tip during music.
3. **A skin that doesn't fit:** its tile is hidden, not disabled. `look.skin` is
   never rewritten, and the body treats it as `none`, so switching back restores
   it.
4. **`/skin crown` on Robot** answers `crown doesn't fit Robot` and saves nothing.
5. **The window check measures real ink,** not group boxes, for headphones.
6. **Snowflake stays pixel-identical.** The eye rig doesn't change. Previews'
   global colours stay as they are.

## The user's answers at approval (2026-11-05)

- If the real fit test fails by a fraction, the lead may move a cup by up to 1 px without asking, and reports it afterwards.
- The user runs the live check on p620.
- This approval is the go-ahead to deploy to p620 and razer. p510 stays untouched.

## Steps

**Step 1. Cup positions and bands** (`app/static/index.html`)

- 1280, 1285, 1289, 1294: add `cupX` and `band` before `pivot:` from the table.
  On 1285, 1289, 1294 add `'headphones'` to `fits`.
- 1187, 1188: `d:BODY.band`.
- 1308, right after `BODY=next;`:
  `if(SIT_P) SIT_P.bd.querySelectorAll('path').forEach(p=>p.setAttribute('d',BODY.band));`
- 1913: `X=Math.max(BODY.cupX,EYE_HALFW*G.sz.x+EYE.cx+22)`.

Check: `grep -c "cupX:" app/static/index.html` gives 4. The lead's browser run in
step 4 decides the rest.
Traps: `applyLook` (1126, 1128) calls `drawSit` while `BODY` is still the old
body, so the `setCharacter` write is required. `setCharacter` runs at 1314 before
any `SIT_P` exists, hence the guard. Leave the `EYE_HALFW` term and `y -8` alone.

**Step 2. Skins that don't fit** (`app/static/index.html`)

- Before `applyAnchors` (1296):
  ```js
  const bodyFits=(c,f)=>c===CHARACTERS.snowflake||c.fits.has(f)||(f.startsWith('plug:')&&c.fits.has('plug'));   // 'plug': every plugin prop fits
  const wornSkin=L=>bodyFits(CHARACTERS[L.character]||CHARACTERS.snowflake,String(L.skin))?L.skin:'none';
  ```
- 1299-1300: `e.style.display=bodyFits(character,e.dataset.fit||'')?'':'none'; }`
- `wornSkin(LOOK)!=='none'` at 1600 (`wxHat`); `skinless=wornSkin(LOOK)==='none'`
  at 1896; `wornSkin(LOOK)==='none'` for the party confetti at 2412.
- 3419: `if(wornSkin(L)!=='none') list.push(['skin','Skin']);`
- 3528: before it, `const worn=wornSkin(L), bodyL=CHARACTERS[L.character]||CHARACTERS.snowflake;`.
  Add `.filter(k=>bodyFits(bodyL,k))` before `.map`, and use `worn===k` for `on`.
- 3829: before `return setLook({skin:k})`:
  ``if(!bodyFits(BODY,k)) return tick(`${k} doesn't fit ${BODY.label}`,true);``

Check: `grep -nE "L(OOK)?\.skin[!=]==?'none'" app/static/index.html` finds nothing.
The lead's browser run in step 4 decides the rest.
Traps: keep `drawSkin` building the hidden skin; existing test 5 loads `crown` on
every body and expects its `.anc` wrapper. Snowflake's `fits` has no `'plug'`, so
the Snowflake short-circuit must stay first. `L.skin` goes through `String()` as
`drawSkin` does. Plugin tiles (3529) stay unfiltered, because every prop fits.
`pkPart='skin'` with no chip stays as it is today when picking `none`.

**Step 3. The fit test** (`tests/character_fit.mjs`)

- **Registry** (section 1, ~105): `cupX` finite and `band` a non-empty string;
  for Snowflake, add `c.cupX!==88` and today's path to the `snowflake numbers`
  check.
- **Cups clear the face and marks** (new section after 2), every body except
  Snowflake. Park `idleSwapAt=nextFidAt=1e15`, hold music on as section 9 does
  (`SIT.music=true`, `info.look_music=true`, `info.look_beat=true`), and wait the
  section's 4800 ms so the fade has settled. For each gaze 0 and ±14 and lift 0
  and 1, settle once (about 1400 ms):
  - `gazeHook=()=>[gaze,0]`, and `poke('talking',1e9)` for lift 1 or
    `transientUntil=0` for lift 0.

  Then for each sway 0 and ±28 and beat 0 and 1, with no wait between them, in one
  synchronous block with `ts=lastTs+16`:
  - set `beat=bt?1+.016*8:0`, `beatAt=bt?ts:-1e9`, `G.sitLift.x=lift`,
    `G.sitLift.v=0`, `G.sitW.x=sway/.9784`, `G.sitW.v=0`, and call `frame(ts)`;
  - assert the left cup reached it: with lift and beat 1, `rotate(-20.00)` and
    `scale(1.070)`, and `SIT_P.hf` at `rotate(±7.00)` for full sway;
  - for `cu` in `SIT_P.cL` and `SIT_P.cR`, take 48 points on `cu.firstChild`'s
    outline (rx 18.5, ry 29.5, stroke included) through its CTM into `#body`
    coordinates. Fail if a point is inside `faceBox` (`[x,y,width,height]`) or a
    `.avoid`'s `bodyBox` (`[x0,y0,x1,y1]`).

  No 0.5 px tolerance. After: `gazeHook=null`, `transientUntil=0`, music off.
- **Window by ink** (section 9, 250-274): for the `headphones` case only, grow
  `worst` from 60 points along `SIT_P.bd.querySelector('path')`
  (`getPointAtLength`, through its screen CTM, ±5 × scale) and the two cup
  outlines, not `SIT_P.hb` and `SIT_P.hf`. Limits, bounce and `roll` stay.
- **Pixels** (`STATES`, 36): add last
  `music: "transientUntil=0; info.look_music=true; info.look_beat=false; SIT.music=true; sitOn.music=true;"`.
  In `shoot`, record `+SIT_P.hf.getAttribute('opacity')` for that state (the
  attribute reads `"1.00"`). Require 1 in both pages and 0 px off for `music`;
  other states keep today's allowance.
- **Skins** (new section), with `settings(true,'look')` open and every change
  through `await setLook(...)`, because the grid and chips read `info.look` and
  only redraw while Settings is open:
  - Snowflake: all five tiles show.
  - Robot: no `crown` or `sprout` tile.
  - Robot with `crown` saved: the `none` tile has `on`, no Skin chip in
    `#partChips`, and `wxHat()` is false.
  - Robot with `bow` saved: `await slash('/skin crown')` leaves `info.look.skin` at
    `bow`, and `#chip` reads `crown doesn't fit Robot` with class `bad`.
  - Robot with `crown` saved, then `character:'snowflake'`: the crown's `.anc` isn't
    `display:none`, and its tile has `on`.
  - Cleanup: `await setLook({character:__id,skin:'none'})` and `settings(false)`.
    The server is shared by all four bodies' runs, and a leftover skin turns off
    the party hat and nightcap cases in section 9.

Check: `node --check tests/character_fit.mjs`.
Traps: Codex's sandbox blocks sockets, so Codex can't run this file; it says so
and hands back. Calling `frame` by hand needs `lastTs` set, or `dt` comes out
wrong. The live `requestAnimationFrame` loop only interleaves at an `await`, so
keep each set, frame and sample in one block.

**Step 4. Tests, reviews, PR** (lead)

Run the commands under "Tests", with no Codex involved. Reviews: a fresh
Opus agent given this plan and `git diff origin/main...HEAD`; `codex review --base
origin/main`; agy on exported files. Fix, re-run, commit. Open the PR linking the
intent, spec and plan, naming the steps Codex did, then merge.

**Step 5. Deploy and live check** (lead, with the user's go-ahead for each host)

1. Bump `nixi-companion` in a clean nixos_config worktree. PR and merge. Post on
   the agent bus before and after.
2. p620, on the user's go-ahead: `nh os switch .` from that clean worktree, then
   `nixos-version --json` to confirm the revision. Restart the companion with the
   live `HYPRLAND_INSTANCE_SIGNATURE`.
3. Live on p620, in one batched session with one control request: music on each
   body; with music, a notification mark, a weather cloud and a plugin prop
   together; the Look tab on Robot, including switching back to Snowflake;
   `/skin crown` on Robot; Snowflake looks as before.
4. razer, on a separate go-ahead: the same `nh os switch .` and
   `nixos-version --json`. Don't repeat the live check.
5. Close #203.

Traps: after a Hyprland restart, herdr panes hold a stale signature, so check it
before driving the desktop. A failed live check goes back to step 1 or 2, and any
position change needs the user's say-so.

## Tests

| Command | Expected |
| ------- | -------- |
| `python3 -m unittest test_character_fit -v` (from `tests/`) | all pass, four bodies plus pixels |
| `python3 -m unittest discover -s .` (from `tests/`) | as on `origin/main` |
| `nix build .#nixi-companion` (repo root) | builds |

Measured on a scratch prototype with a stub API, not the real server: 0.6 px
smallest face gap at full sway (the spec's 0.7 was at 6.9°), no marks hit, ink at least 16 px inside the window, Snowflake 0
px off in five states. The save and reload cases haven't run against this change.

## Rollback

Revert the merge and bump `nixi-companion` again, then `nh os switch .` on each
host. Nothing in saved settings changes: `look.skin` keeps its value, so no
migration is needed.

## Deviations

None yet.
