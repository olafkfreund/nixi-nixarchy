---
status: approved
issue: 155
spec: spec/2026-11-03-155-readable-captions.md
coders:
  1: coder   # CSS and one markup line: small, but spread over ten rules that must stay in step
  2: codex   # the contrast search is small, tricky numeric logic
  3: codex   # the notification class, click target and grow-only width touch timing-sensitive caption code
  4: coder   # a new headless test and its Python wrapper, copied from the existing pattern
reviewers:
  - codex    # independent read of the diff against this plan
  - agy      # second independent read; the two disagreed usefully on the spec
---

# Plan: Nixi's captions and notification card are readable over any window

Code repo: `olafkfreund/nixoarchy-snowflake` (the companion), branch
`fix/155-readable-captions` from `origin/main` `2e36123`. Every edit is in
`app/static/index.html` except step 4. Line numbers are at `2e36123`.

## Decisions (from the approved spec)

- **One plate.** A new `<div id="plate">` wraps `#you` and `#him` inside
  `#cap`. It hugs the text (`width: fit-content`, `max-width: 100%`), with
  `padding: 5px 11px`, radius 12 px and `background: var(--cap-bg)`. It's
  hidden while both lines are empty.
- **No shadow, no mask.** Remove `#cap`'s `text-shadow` and top-fade
  `mask-image`, and `#you`'s shadow. `#him`'s `max-height: 4.5em` and
  `overflow: hidden` still cut the oldest karaoke lines.
- **Colours from the theme, checked.** The backing is `--panel` at alpha
  `a = 0.90`. Each text colour moves towards black or white (whichever
  contrasts more with `--panel`) in steps of `t = 0.1`, until it reaches at
  least 4.5:1 against the backing composited over **both** `#000` and
  `#fff`. If even pure black or white fails, raise `a` by 0.02, up to 1.0.
  The result goes into `--cap-bg`, `--cap-text`, `--cap-dim`, `--cap-err`
  and `--cap-code`.
- **Grow-only width.** During one caption, `#plate`'s `min-width` only grows.
  A new caption or notification resets it. `min-width` transitions over
  0.15 s, with no transition under `prefers-reduced-motion`.
- **The notification card.** The class on `#cap` is renamed `note` → `ntf`.
  Only `#plate` takes clicks, in the DOM and in `sendRegion`. A 1 px
  `var(--line)` border shows while `ntf` is set. Wiping the caption for
  anything else drops the notification through `notifyClear`.
- **`#wk`** becomes a pill with the same backing, and is hidden when empty.
- **Notch (bar) mode** stays one black shape: `#plate` there has no
  background, border or padding, `#wk` is hidden, and the text keeps its
  existing colours.
- **Sizes:** `#him` stays 14.5 px / 500. `#you` goes to 12.5 px.
- **Backing strength:** 90% (the spec's open question, approved as
  suggested).

## Traps that apply to every step

- **The `//` trap.** In `index.html`'s script, a `//` comment runs to the end
  of the line: never put code after one (this hid the plugin switches in
  #149). Inside `<style>`, only `/* */` comments.
- **GPU safety (hard rule).** Never open the page in a desktop browser. Tests
  and previews run only in headless Chromium with `--headless=new
  --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader
  --disable-gpu-compositing`. After each run, `journalctl -k --since -10min
  | grep -Ei 'ring .*timeout|gpu reset'` must print nothing. No
  `backdrop-filter`, no blur on the plate.
- **`* { box-sizing: border-box }`** is global (`:15`), so `min-width` and
  `getBoundingClientRect().width` both include the padding. Keep it that
  way, and don't add `content-box`.
- **`#him`'s `width: 100%`** (`:270`) would make the plate's width
  circular. It must go.
- **WebKitGTK is the real window.** `:has()` and `color-mix()` are fine
  there, but `color-mix()` is already used on the page and `:has()` is not
  yet. Step 1 uses `:has()` once, and step 5's live check confirms it.

## Steps

1. **CSS and markup** (`index.html`) → coder
   - `:654`: change the markup to
     `<div id="cap" class="off"><div id="plate"><div id="you"></div><div id="him"></div></div></div>`.
   - `:165-168` `#cap`:
     - delete the `-webkit-mask-image` and `mask-image` declarations and the
       `text-shadow` line;
     - keep `gap:3px`, but it no longer matters (one child).
   - Add after `#cap.off…` (`:169`):
     - `#plate{display:flex;flex-direction:column;align-items:center;gap:3px;width:fit-content;max-width:100%;padding:5px 11px;border-radius:12px;background:var(--cap-bg,#0b0b0be6);color:var(--cap-text,var(--text));transition:min-width .15s var(--ease)}`
     - `#plate:has(#you:empty):not(:has(#him .w,#him>span)){display:none}`
       (every word in `#him` is a `.w`, and notifications and nudges are a
       `#him>span`: `:1903-1904`, `:1928`. An empty `.ln` left by a first
       streamed chunk with no space yet, `:2091-2093`, must not draw a
       blank pill.)
     - `#you:empty{display:none}`
     - `#him:not(:has(.w,span)){display:none}` (otherwise an empty `#him`
       adds the 3 px gap under "listening…")
     - `@media (prefers-reduced-motion:reduce){#plate{transition:none}}`
   - `:256`: replace `#cap.note{…}` with
     `#cap.ntf #plate{pointer-events:auto;cursor:pointer;border:1px solid var(--line)}`,
     keeping its comment as a `/* */` comment.
   - `:257` `#wk`:
     - drop `left:12px;right:12px`;
     - add `left:50%;translate:-50% 0;max-width:316px;width:fit-content;padding:2px 8px;border-radius:999px;background:var(--cap-bg,#0b0b0be6);font-size:11.5px`;
     - set `color:var(--cap-dim,var(--dim))`;
     - add `#wk:empty{display:none}`.
   - `:258` `#you`: remove the `text-shadow`, set `font-size:12.5px` and
     `color:var(--cap-dim,var(--dim))`.
   - `:262` (full-text `#you`): `color:var(--cap-dim,var(--dim))`.
   - `:270` `#him`: delete `width:100%`.
   - `:271`: `#him.err{color:var(--cap-err,#ff8a8a)}`.
   - `:274`: `#him .w.c{…color:var(--cap-code,var(--tint))}`.
   - Notch overrides, after `:123`:
     - `body.bar #plate{background:none;border:0;padding:0;min-width:0!important;border-radius:0}`
     - `body.bar #cap.ntf #plate{border:0}` (`#cap.ntf #plate`, two IDs
       and a class, would otherwise beat `body.bar #plate` and draw a border
       inside the notch)
     - `body.bar #wk{display:none}`
     - `body.bar #cap{--cap-text:var(--text);--cap-dim:var(--dim);--cap-err:#ff8a8a;--cap-code:var(--tint)}`
       (the notch keeps today's colours against its own black)
   - **Verify:** `python -m unittest tests.test_stages_fit tests.test_accessories_fit`
     still passes.
   - **Traps:** the `//` trap (CSS comments only `/* */`); `#him` must not
     keep `width:100%`.

2. **Checked caption colours** (`index.html`, next to `shade()` `:859`, and
   in `applyLook` `:885-902`) → codex
   - Add the helpers after `:859`:
     - `relLum(hex)`: WCAG relative luminance (linearise each channel of
       `hex2rgb`, then `0.2126 R + 0.7152 G + 0.0722 B`).
     - `contrast(a,b)`: `(L1+0.05)/(L2+0.05)`, with the lighter one on top.
     - `over(c,a,bg)`: per-channel `c*a + bg*(1-a)`, returned as hex.
     - `lerpHex(c,d,t)`: per-channel blend, returned as hex.
   - Add `capColors()`:
     - read `--panel`, `--text`, `--dim` and `--tint` from
       `getComputedStyle(document.documentElement)`;
     - expand 3-digit hex, and fall back to the `:root` defaults
       (`#0b0b0b`, `#f3f3f3`, `#a3a3a3`, `#d6ecff`) when a value isn't
       `okHex`;
     - err is `#ff8a8a`;
     - `best` is `#000000` or `#ffffff`, whichever has the higher
       `contrast` with `--panel`;
     - `ok(c,a)` is true when `contrast(c, over(panel,a,'#000000')) >= 4.5`
       and the same over `#ffffff`;
     - loop `a` from 0.90 to 1.0 in steps of 0.02 (rounded, so floating
       error never skips 1.0), and stop at the first `a` where `ok(best,a)`;
     - for each of text, dim, err and code, pick the first `t` in
       `0, 0.1, …, 1` where `ok(lerpHex(c,best,t),a)`;
     - set `--cap-bg` to `panel` plus the alpha as two hex digits, and the
       four `--cap-*` colours, on `document.documentElement.style`;
     - return `{a, text, dim, err, code}` for the test.
   - Call `capColors()` as the last line of `applyLook` (after
     `applyAccent`, which sets `--tint`, and after `applyThemeVars`).
     `applyLook` already runs at start and on every theme change.
   - **Verify:** step 4's contrast cases. Until then, run `capColors()` in
     the headless page with the default theme: `a` is 0.9 and `t` is 0 for
     the text.
   - **Traps:** the `//` trap. At `a = 1` the backing is `--panel` itself,
     so `ok(best,1)` always holds: the loop must end there, never past it.

3. **The notification card and the grow-only width** (`index.html`) → codex
   - `:825`: add `plate=$('#plate')` to the `const` list.
   - Rename `note` → `ntf` on `#cap`:
     - `:1928`: `cap.classList.add('ntf')`;
     - `:2082`: `cap.classList.remove('ntf')`;
     - `:3013`: `if(cap.classList.contains('ntf')) add(plate,4);`.
   - `:2085`: `plate.addEventListener('click',()=>notifyAct('open'));`.
   - Add `function plateGrow(){ plate.style.minWidth=plate.getBoundingClientRect().width+'px'; }`
     and `function plateReset(){ plate.style.transition='none'; plate.style.minWidth=''; void plate.offsetWidth; plate.style.transition=''; }`.
     - The rect already includes the current `min-width`, so this only grows.
     - **The reset skips the transition on purpose.** With the transition
       on, a read right after a reset sees the old, wider `min-width` at
       transition progress 0, and `plateGrow` would write it straight back
       (both reviews).
     - Call `plateGrow()` at the end of `showHim` (after the word loop) and at
       the end of `karaPut`'s word path.
     - Call `plateReset()` where a new caption starts: `himSet`, `karaPut`'s
       `k.reset` branch, `showHim`'s `fresh` branch, `karaPut` when it
       creates a new `.ln` (`:1654`), `notifyShow` (`:1927`) and the
       unvoiced nudge (`nudgeDrain`, `:1903`), each right after its
       `#him` wipe.
   - **A notification never outlives its text:** add
     `function ntfDrop(){ if(notifyRow&&notifyRow.span&&!notifyRow.span.isConnected) notifyClear(); }`.
     - It drops a row only if that row *had* a span and lost it. `notifyDrain`
       sets `notifyRow=row` with `span:null` before it calls `notifyShow`
       (`:1943`), so the condition must not treat a missing span as gone.
     - Call it right after the wipes in `himSet`, `karaPut` (both wipe
       sites), `showHim`'s `fresh` branch and `nudgeDrain` (`:1903`). Not in
       `notifyShow`.
     - The span is then disconnected, so `notifyClear` only drops the row,
       removes `ntf` and resends the region. It doesn't hide the caption.
   - **Verify:** step 4's notification and grow cases.
   - **Traps:**
     - the `//` trap;
     - `notifyClear` hides the caption when the span is still connected, so
       call `ntfDrop` only after the wipe;
     - `grep -n "'note'" app/static/index.html` must show no `cap.classList`
       hits afterwards (the panel's own `.note` rows stay).

4. **Tests** → coder
   - `tests/caption_fit.mjs`: the same CDP harness as
     `tests/accessories_fit.mjs:6-20` (340×460 viewport). It covers the
     spec's two checks in one file, and fails with `CUT <what>` and exit 1.
   - **Contrast:** call `applyThemeVars(t)` then `capColors()` for four
     themes:
     - the default (`null`);
     - a light Omarchy-like theme (background `#f4f1ea`, foreground
       `#2a2a2a`, `dark_foreground` `#8a8a8a`, mode `light`);
     - one whose `dark_foreground` is nearly its background (`#1e1e2e` on
       `#1f1f2f`);
     - a mid-grey panel `#727272` with foreground `#ffffff`.
     For each, in Node, recompute WCAG contrast of the four returned colours
     against `over(panel,a,#000)` and `over(panel,a,#fff)`, and assert
     ≥ 4.5. Restore with `applyLook(LOOK)` afterwards.
   - **Page:**
     - `himSet('hi')`, then capShow: `#plate` has a non-transparent
       background, and its width is less than `#cap`'s;
     - with both lines empty, `#plate` is `display: none`;
     - `getComputedStyle(cap).maskImage` is `none` outside the bar;
     - set `notifyRow=row` with `row={key:'k',span:null}` (as `notifyDrain`
       does at `:1943`), then `notifyShow(row,'Notification · test',{})`:
       - `cap` has `ntf` and not `note`;
       - `#plate` has a 1 px border;
       - `document.elementFromPoint` at a point inside `#cap` but outside
         `#plate` is not `#plate` or inside it;
       - `notifyRow` is still `row` (it wasn't dropped by its own show);
       - then `notifyClear()`. `ntf` is gone and `#cap` has `off`.
     - **Replaced early:** show a notification as above, then
       `himSet('next')`. `ntf` is gone, `notifyRow` is `null`, and `#him`
       says "next". The same with an unvoiced nudge through `nudgeDrain`'s
       path, if it can be called directly; otherwise note that in the PR.
     - **Streaming:** call `showHim` with 12 growing prefixes (`end=false`,
       then `true`) and record `#plate`'s `style.minWidth` after each. It is
       set, and never decreases.
     - **Reset:** after a three-line caption, `himSet('hi')`, wait 300 ms.
       `#plate` is under 100 px wide.
     - **Three lines:** `himSet` with a text that wraps to three lines, then
       wait 1.2 s so the `wIn` word animations (up to 420 ms delay, 0.6 s)
       end. `#him`'s box is inside `#plate`'s box, and every `.w` whose box
       overlaps `#him`'s box ends inside `#plate`'s box. Don't use
       `scrollHeight`: `#him` clips old lines on purpose (`:270`).
     - `#wk` with empty text is `display: none`. With `'working: Read'` it
       has a background.
     - Notch: add `bar` to `body`. `#plate` has a transparent background and
       0 padding, and `#wk` is `display: none`. Then remove `bar`.
     - **The region**, on a second navigation with `?native=1` (`:8` then
       sets `NATIVE`, a `const` at `:823` that can't be reassigned):
       - set `window.webkit={messageHandlers:{nixiui:{postMessage:m=>(window.__m=window.__m||[]).push(m)}}}`
         (`native()` at `:837` looks it up at each call);
       - set `info.click_through=true`, show a notification as above, then
         `sendRegion(true)`;
       - parse the last `region:` message. It contains a rect that covers
         `#plate`'s box, and none as wide as `#cap` (316 px).
   - `tests/test_caption_fit.py`: a copy of `tests/test_stages_fit.py` that
     runs `caption_fit.mjs` (same throwaway home, GPU-off Chromium flags and
     skip rule).
   - **Verify:** `python -m unittest tests.test_caption_fit` passes. With
     step 1's `#plate` background removed, it fails (checked once by hand,
     then restored).
   - **Traps:**
     - GPU-off Chromium only;
     - top-level `let` bindings (`notifyRow`, `info`) can be assigned from
       `Runtime.evaluate`; `const` ones (`NATIVE`, `native`) can't.

5. **Previews, review and live check** → lead
   - Re-render the spec's preview with `scratchpad/stg-prev/cap.mjs` against
     the real page, over the busy terminal screenshot:
     - a short answer, a three-line answer, "you said" with an answer, a
       notification and `#wk`;
     - in the dark and light themes;
     - `journalctl -k` checked after each.
   - Reviews: the Opus reviewer on `plan/` and `git diff`, and Codex and agy
     (`reviewers:`). Fix the findings.
   - **Verify:**
     - the full suite `python -m unittest discover -s tests` passes;
     - the previews show one plate, a card with a border and no grey
       half-box.

6. **Deploy** → lead
   - PR, then CI, then squash merge.
   - In `~/.config/nixos`: `nix flake update nixi-companion`, build p620, PR,
     CI, merge, then `just deploy` and `just razer`, then
     `nixi-companion restart`. Agent-bus post before and after.
   - **Live on p620:**
     - ask something over a terminal, and trigger a notification
       (`notify-send test hello`);
     - check that `:has()` hides the empty plate in WebKitGTK (no empty pill
       above him);
     - `journalctl -k` is clean.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/snow-155
python -m unittest tests.test_caption_fit tests.test_stages_fit tests.test_accessories_fit
python -m unittest discover -s tests
journalctl -k --since -15min | grep -Ei 'ring .*timeout|gpu reset' || echo clean
```

Expected: all pass, and `clean`.

## Rollback

- Revert the squash commit in nixoarchy-snowflake.
- Then bump `nixi-companion` in `~/.config/nixos` and deploy. Or, faster on
  one host, roll back the system generation.
- No data or settings change: the patch is page-only, with no new settings.

## Review of this draft (Codex and agy, read-only)

Both checked the plan against `index.html` at `2e36123`. All findings were
confirmed in the code and are fixed above:

- `ntfDrop` would have dropped every new notification, because
  `notifyDrain` sets the row before its span exists (both reviews).
- The unvoiced nudge (`nudgeDrain` `:1903`) wipes the caption too, and was
  missing from the reset and drop sites (both).
- `#cap.ntf #plate` beat `body.bar #plate`, so the notch would get a border
  (both).
- The `min-width` transition made `plateReset` undo itself (both).
- An empty `.ln` would draw a blank pill, and an empty `#him` left a gap
  (agy).
- The three-line test used `scrollHeight`, which fails on purpose-clipped
  lines and during the word animation (both).
- The region test tried to reassign `const` bindings (both).
- The `applyLook` range was off by two lines (agy).

## Deviations

- **Step 4, the region check:** the region always holds his body's own rect
  (`[-16,0,368,320]`), which is wider than `#cap`. The test requires
  instead that every rect overlapping the plate's band is narrower than
  `#cap`, and that one rect covers the plate.
- **Step 4, the three-line check:** words overlapping `#him` by 3 px or
  less are ignored. The oldest, clipped line still overlaps by about
  0.25 px.
- **Step 4, the streaming check:** it starts from the first `minWidth`
  that exists. The first prefix has no finished word yet.
- **Step 4, the nudge case:** `nudgeDrain` is reached directly, by setting
  `nudgeQ` and `notifyAt=0`.
- **Review fixes (step 5):**
  - an empty `#you` is also hidden in full-text mode (Opus);
  - `#him` gets `max-width:100%;min-width:0;overflow-wrap:anywhere`, so a
    long URL wraps inside the plate. Without `width:100%` it overflowed
    (Codex's GitHub review on PR #24).
  - Both have test cases.
