---
status: draft
issue: 145
spec: spec/2026-11-03-145-control-indicator.md
coders:
  1: codex   # the Mirror watcher, revoke and precedence rules are small, tricky logic with a safety boundary
  2: agy     # a large, mechanical unit-test file with a fake CLI
  3: coder   # the page: marks, mood, hover, calm and notch signals, menu and tip precedence; broad UI wiring
  4: coder   # the page tests, following the existing headless pattern
reviewers:
  - codex    # independent read of the diff against this plan
  - agy      # both found distinct issues in the spec; keep both
---

# Plan: Nixi shows who controls the desktop, and gives control back

Code: `olafkfreund/nixoarchy-snowflake`, branch `feat/145-control-indicator`,
cut from `main` **after #157 merges**: both change `app/server.py` and
`app/static/index.html`. Line numbers are at `0ca82bc`; after #157 they move,
so find each site by name. ai-mirror isn't changed.

## Decisions (from the approved spec, with its review fixes)

- **"Installed"** means `shutil.which("ai-mirror")`, checked every 60 s.
  Paths come from the server's `XDG_RUNTIME_DIR`; unset means `None`. A
  missing `state.json` reads as `off`.
- **The watcher:** a daemon thread, 1 s while he's shown and 5 s while
  hidden.
  - It stats `state.json` with `(st_mtime_ns, st_size, st_ino)` and reads
    `watching`.
  - It runs `ai-mirror status` (fixed argv, 3 s timeout) only:
    - on a stat change;
    - on a `pending` whose `request.expires` has passed;
    - every 30 s while not `off`.
  - **If `status` fails:** read `state.json` directly and apply the expiry.
    A file `agent` stays `agent`. Keep the last confirmed state only if the
    file is unreadable too.
  - It publishes `{owner, watching}` (`watching` is fresh under 10 s) as
    SSE `t:"mirror"` on change and on every new `/api/events`
    subscription. `/api/state` includes `mirror`.
- **The revoke:**
  - `POST /api/mirror/off`, token-checked, never gated by trust;
  - it runs the argv constant `["ai-mirror", "control", "off"]`, 10 s
    timeout;
  - success is exit 0 and stdout JSON `owner == "off"`;
  - on failure, `error.message` from stdout's JSON, or the last stderr line,
    200 characters at most.
  - The only argv ever built are this and `["ai-mirror", "status"]`.
- **Voice:**
  - `quick.handle` maps "take control back", "stop the agent", "revoke
    control" and "give me my desktop back" to `{"mirror": "off"}`;
  - the `/api/quick` handler runs the revoke and sets `say`, `mood` and
    `sfx` from the result:
    - success → "Control is back with you." / `happy` / `ok`;
    - failure → "I couldn't take it back — press Super, Shift and
      Escape." / `sorry` / `error`;
    - already off → "No agent is controlling the mouse and keyboard
      through ai-mirror." / `curious`.
- **The page:**
  - **Marks on the upper-right tip:**
    - `pending`: amber, pulsing;
    - `agent`: red, with a pointer glyph and a slow 2 s ring pulse;
      clickable, and added to the click region;
    - `watching` (only when `off`): an eye glyph.
  - **Moods:**
    - `curious` once on `pending`;
    - `scared` once on `agent`, then a new **`worried`** mood (a
      non-`t_` key) replaces idle and `sleepy` while `agent` holds;
    - `looking` for `watching`.
  - **Signals in every mode:**
    - hover: a red ring around him;
    - calm: a red bar at the top of the open panel, with a "Take control
      back" button;
    - notch: a red border or box-shadow on `#barPill`;
    - peek and doze: `idleActive()` is true while `pending` or `agent`
      holds, and `restore('mirror')` runs on entering either.
  - **The tip:** `renderCue()` and `agentMark()` yield while a mirror mark
    shows; a valid `AM` re-renders when it goes back to `off`.
  - **The menu:** "take control back" appears while `pending` or `agent`
    holds, via a filtered list in `layoutMenu()`.
  - **Captions:**
    - success fades the mark over 0.4 s, with `happy` and "Control is back
      with you.";
    - failure shows an error caption and keeps the mark.
  - **Settings, More tab** (outside `.nx`): "Shows when an agent controls
    your desktop through ai-mirror. Super+Shift+Esc always takes it back."
  - **Wording:** never "safe". `off` is "not through ai-mirror".

## Traps

- **The `//` trap** in the page script: no code after a `//` comment.
- **GPU safety:**
  - flat SVG and CSS only;
  - headless Chromium with the GPU off for every preview and test;
  - `journalctl -k` after each run;
  - no `filter` on new marks, and the notch glow is CSS on an HTML
    element.
- **`isTalk()` treats any `t_…` mood as talking.** The new mood must not
  start with `t_`.
- **Never call `ai-mirror control agent|confirm|deny`.** A test greps the
  source for them.
- **No subprocess from `state_info()` or a request handler,** except the
  revoke itself in `POST /api/mirror/off` and `/api/quick`. The watcher
  thread owns `status`.
- **The tests never use the real `ai-mirror`:** use a fake script on
  `PATH` and a temporary `XDG_RUNTIME_DIR`.

## Steps

1. **Server: Mirror, revoke, SSE, state and voice** (`app/server.py`,
   `app/quick.py`) → codex
   - Add the `Mirror` class (watcher thread, started like `Ambient`'s, and
     paused while asleep as `Ambient.loop` is) with `snapshot()` and
     `revoke()`, exactly as in the Decisions.
   - Add `POST /api/mirror/off` in `do_POST`.
   - Emit `mirror` in `events()` after `situation`.
   - Add `mirror` to `state_info()`, from `Mirror.snapshot()`: no I/O.
   - Add the phrases to `quick.handle`, and handle `mirror` in
     `/api/quick`.
   - **Verify:** `python -c "import ast;ast.parse(open('app/server.py').read())"`,
     and `python -m unittest discover -s tests` stays green.

2. **Server tests** (`tests/test_mirror.py`) → agy
   - Every server case in the spec's Verification and review fix 12:
     - none without the CLI, no `XDG_RUNTIME_DIR`, and `watching` without
       `state.json`;
     - the `status` triggers (stat change, expiry, 30 s held, not every
       tick);
     - `status` failing after a revoke falls back to the file;
     - the revoke: its argv, success on exit 0 plus `off`, failure on
       stdout JSON or stderr, and a missing token rejected;
     - all three trust levels;
     - the SSE `mirror` on subscribe;
     - the `/api/quick` mood and sfx for success, failure and already off;
     - a grep that `agent`, `confirm` and `deny` never appear as ai-mirror
       argv.
   - **Verify:** `python -m unittest discover -s tests -p test_mirror.py`.

3. **The page** (`app/static/index.html`) → coder
   - **Data:** a `MIR={owner:null,watching:false}`, set from `ev.t==='mirror'`
     and from `/api/state`'s `mirror`.
   - **The marks:** draw them in a new group next to `#agentMark`, built
     once; drive them in `frame()` with writes only while shown.
   - **The `worried` mood:** add it to `MOODS`, and let it override idle
     and `sleepy` in the mood selection while `MIR.owner==='agent'`.
   - **The mode signals:** the hover ring, the calm bar (with its button,
     to `POST /api/mirror/off`), the notch CSS class, and `idleActive()`
     and `restore()`.
   - **Shared spaces:** tip precedence in `renderCue()` and `agentMark()`;
     the menu filter in `layoutMenu()`; the click region.
   - **Text:** the captions for success and failure, and the Settings
     line.
   - **Verify:**
     - GPU-off previews of `pending`, `agent` (normal, hover, calm and
       notch) and `watching`;
     - `journalctl -k` is clean;
     - `python -m unittest tests.test_accessories_fit` stays green.

4. **Page tests** (`tests/mirror_fit.mjs`, `tests/test_mirror_fit.py`) →
   coder
   - Every page case in the spec's Verification and review fix 12:
     - the marks inside the window;
     - a click posts `/api/mirror/off`;
     - the menu item only while it applies;
     - hidden in bar mode, with the notch class set;
     - the hover ring and the calm bar;
     - `idleActive` during `agent`;
     - `worried` with no `sleepy`;
     - tip precedence with `AM` and `#cue`;
     - the success fade, and the mark staying after a failure.
   - **Verify:** `python -m unittest tests.test_mirror_fit`.

5. **Review, PR, deploy and live check** → lead
   - The Opus reviewer, plus Codex and agy.
   - The PR with `@codex review`. Deploy to p620 and razer.
   - **Live on p620,** with the user:
     1. `ai-mirror control agent` from a terminal → the amber mark → the
        user approves → the red mark and the worried face;
     2. click the mark → "Control is back with you." → `ai-mirror status`
        shows `off`;
     3. repeat with the voice phrase, and with a Settings panel open (the
        red bar);
     4. `journalctl -k` is clean.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/snow-145
python -m unittest discover -s tests -p test_mirror.py
python -m unittest tests.test_mirror_fit tests.test_accessories_fit
python -m unittest discover -s tests
```

## Rollback

Revert the squash commit, bump `nixi-companion` in `~/.config/nixos`, and
deploy. ai-mirror and its state are untouched, and nothing is migrated.

## Review of this draft (Codex and agy, both obtained)

Confirmed in the code. These override the steps above where they differ.

1. **Waking uses `restore(0)`, not `restore('mirror')`** (both). `restore`
   adds `hold` to a timestamp, so a string makes `idleHoldUntil` `NaN`
   and breaks idle for good (`index.html:3183`).
   - "Wake on entering `pending` or `agent`" is `restore(0)`, plus a guard
     in `idleCheck()` and `idleActive()` while `MIR.owner` is `pending` or
     `agent`.
   - The spec's `restore('mirror')` meant "wake him". This is its correct
     form.
   - Step 4 tests that idle timing still works after `off`.
2. **The watcher is never paused while hidden** (Codex). It ticks every 5 s
   while hidden or asleep, because control can change while he's hidden.
   This replaces step 1's "paused while asleep as `Ambient.loop` is".
3. **`worried` needs an `AURA` entry** as well as a `MOODS` one (agy).
   `frame()` reads `AURA[m].spd` (`:1450`, `:1555`).
4. **The exact strings and their triggers** (both):
   - **`pending` starts:** the caption "An agent is asking to control your
     desktop — answer in ai-mirror's dialog."
   - **Click succeeds:** "Control is back with you.", spoken if voice is
     on.
   - **Failure:** the error caption "Couldn't take control back — press
     Super+Shift+Esc."
   - **The calm bar:** "An agent controls your desktop", with the button
     "Take control back".
   - **`watching`:** silent, even with voice on. Its tooltip and
     `aria-label` read "ai-mirror read your screen recently", never "is
     watching".
   - Step 4 checks each string.
5. **The menu** (both): add the item to `MENU` (`:2571`), where the buttons
   are built, and to the click dispatcher (`:2590`), mapped to the
   revoke.
   - `layoutMenu()` (`:2579`) lays out only the visible `.mb` buttons,
     hidden ones and `.nx` excluded.
   - It recomputes the arc in both the orb and notch layouts, and updates
     `MENU_XY`.
6. **The tip** (agy): `agentMark()` still records `AM`. `frame()`'s
   `AMX.mk` opacity and `renderCue()` hide the mark and `#cue` while a
   mirror mark shows, so `AM` comes back when the mirror goes to `off`.
7. **CSS hiding** (agy):
   - the new mark group is added to the selectors that hide `#agentMark`
     in bar, calm, hover and goohide modes (`:34`, `:77`, `:97`, `:447`);
   - those modes use their own signals instead (the hover ring, the calm
     bar, the notch glow);
   - the calm bar is placed at the top of whichever of `#set`, `#panel` or
     `#appr` is open (`calmCheck()`, `:3116`).
8. **More server tests** (both):
   - a failed `status` *and* an unreadable file keep the last confirmed
     state;
   - the CLI is re-checked every 60 s;
   - the `watching` boundary at exactly 10 s;
   - an expired `pending` becomes `off`;
   - an unknown `owner` becomes `None`, so there's never a false red mark.
9. **The tests path:** `snow-145` is the worktree created for this issue
   from `main` after #157 merges.
