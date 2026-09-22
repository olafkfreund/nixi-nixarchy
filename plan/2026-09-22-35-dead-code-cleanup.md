---
status: approved
issue: 35
spec: spec/2026-09-22-35-dead-code-cleanup.md
---

# Plan: Remove dead code and duplication (~940 lines)

## Approved decisions (from the spec)

- **No behaviour change**, with one exception: the math "product 2 3 4"
  command is made to work by adding `"prod"` to the `functions` allowlist
  in `bridge/math.js`, with a new `bridge/math.test.js`.
- **Every finding from the 2026-09-22 review is in scope**, including four
  mechanism swaps. Each swap is its own commit so it can be reverted alone:
  the shared coast component, `Instantiator` for Ctrl+1…0,
  `pendingPermission`, and the toast animation.
- **The dead file browser goes**, but the `@` hover preview must keep
  working: `filePreviewTimer`, and `filePreviewProc` if it lives there too,
  move out of the dead `fileList` before it is deleted.
- **MenuSearch's `fileMode`, `repoMode` and `fileQueryOverride`** go with the
  browser. The `@` and `^` prefixes stay.
- **Install parity:** whatever `install.py` stops writing, the Home Manager
  module must not write either.
- **PR #34 (#27) is open** and touches `bridge.js`, `trust-policy.js`,
  `fake-agent.js` and `test_nixi.py`. The bridge commit comes **last** and
  is rebased onto `master` after #34 merges. If #34 has not merged when
  steps 1–5 are done, steps 1–5 go out as their own PR, and the bridge
  follows in a second PR.
- **Verified** after every commit (the three suites, plus the grep gate for
  QML) and at the end on razer, through the card, with the reversible link
  swap.

**Gates used throughout:**

- **G (tests):** `node --test bridge/*.test.js`,
  `python3 tools/test_nixi.py`, and `nix flake check`, all green.
- **R (references):** for every identifier removed in the step,
  `grep -rn '<name>' --include=*.qml --include=*.js . | grep -v node_modules`
  returns nothing.

Line numbers below are from `master` at `24cf573` and shift as earlier
steps land. Each edit is found by its content.

## Steps

### Step 1: the dead file browser (one commit)

1. **`Conversation.qml`, move the live preview first.**
   - Find the declarations of `filePreviewTimer` (around L2566-2581) and
     `filePreviewProc` (grep for it).
   - Move whichever is inside `fileCard`/`fileList` to root level, next to
     the other root Timers and Processes.
   - In the timer's `onTriggered`, replace
     `var previewingFiles = root.fileBrowserOpen ? … : root.searchMode === "@"`
     with `if (root.searchMode !== "@" || root.hoverPreviewPath === "") return`.
   - In `scheduleFilePreview()` (L711), the guard becomes
     `if (root.searchMode !== "@") return`.
2. **`Conversation.qml`, delete:**
   - `openFileBrowser()` (L682-697) and `openFileBrowserSelection()`
     (L792-797).
   - The `fileCard` BorderSurface and everything in it (L2360-2709, minus
     what was moved in 1).
   - The file-browser functions at L809-944: `fileKeyboardVelocityY`,
     `fileScrollBounds`, `visibleFileRange`, `updateFileShortcutRange`,
     `deferFileShortcutRange`, `moveFileSelection`, `fileScrollKeyImpulse`,
     `coastFileTrackpad`.
   - The state at L73-94: `fileBrowserOpen`, `fileBrowserMode`,
     `fileBrowserQuery`, `fileBrowserIndex`, `fileShortcutFirst`,
     `fileShortcutLast`, `fileBrowserRows`, `onFileBrowserIndexChanged`.
   - The `fileBrowserOpen` branches in `selectVisibleSlot` (L639-650),
     `scrollPage` (L389-391) and `scrollActiveSurface`. `scrollPage` goes
     entirely if only `fileCard` called it.
   - The Ctrl+N Shortcut `enabled:` conditions reduce from
     `menuOpen || fileBrowserOpen` to `menuOpen`.
   - The `mask: Region` block (L1398-1412).
   - The MenuSearch bindings `fileMode:`, `repoMode:` and
     `fileQueryOverride:` (L960-962).
3. **`MenuSearch.qml`, delete:**
   - The properties `fileMode`, `repoMode` and `fileQueryOverride` (L83-85).
   - Their handlers (L429-431).
   - The `root.fileMode` and `root.repoMode` terms in the scoring
     conditions (L135, L147).
   - The `focused` and `wanted` branches in `requestFiles()` (L434-436),
     which become the plain query path.

→ **verify:** gate R for every name above; gate G.
`git diff --stat` shows about −600 lines.

### Step 2: other QML, deletions and simple shrinks (one commit)

- **`Conversation.qml`:**
  - Delete `toggle()` (L270).
  - Delete horizontal scrolling: the `horizontalScroll` NumberAnimation
    (L1522-1528), the X half of `scrollBy` (L354-383), the `dx` parameter of
    `scrollLine` and its callers, the Left, Right, Ctrl+H and Ctrl+L
    Shortcuts (L1067-1069, L1072), and their branches in `handleScrollKey`
    (L1047-1048, L1053-1054). Also remove every `horizontalScroll.stop()`
    (L282, L303).
  - Delete the empty stderr SplitParser (L1376-1381).
  - Delete `stepFontScale` and `resetFontScale` (L449-450). Their callers
    emit `fontScaleStepRequested(x)` and `fontScaleResetRequested()`
    directly.
  - Merge `handleFontKey`, `handlePinKey`, `handleMotionTunerKey` and
    `handleHarnessSelectorKey` (L983-1013) into
    `handleCardKey(event)`, which returns the same `||` result. The three
    call sites (L1675, L1695, L1892) call it.
  - Move the Y/N Shortcuts at L3022-3031 into the existing
    `WindowShortcuts` component (next to L1416-1425) and delete the
    duplicate.
- **`Tour.qml`:**
  - Delete `stop()` (L43), `signal progressChanged()` (L22) and its emits
    (L103, L137).
  - L90-96 becomes `learning = Object.assign({}, learning, { toured: true })`.
- **`TourModel.js`:** remove `total` from `start()` (L14).
- **`Ask.qml`:**
  - `open()`, `close()`, `pinActive()` and `toggle()` (L427-450) use
    `root.opened`.
  - `normalizeCommand` (L176-186) becomes
    `value.map(function(v) { return String(v || "") }).filter(Boolean)`,
    keeping its existing non-array guard.
  - One `clampMotion(impulse, deceleration)` is used by `setKeyboardMotion`
    (L134-135) and `loadSettings` (L155-162).
- **`HarnessSelector.qml`:** the model index loop (L51-58) becomes
  `modelSelect.indexOfValue(draftModel)`. The two chip delegates
  (L114-126, L149-161) become one inline `component Chip`.
- **`MenuSearch.qml`:**
  - One `clearPathResults()` for L401-408 and L441-448.
  - Drop `grouped` (L249-256) and use `scored`.
  - The three Process blocks (L507-538) become one inline
    `component BridgeProc` used three times.

→ **verify:** gate R (`toggle`, `horizontalScroll`, `stepFontScale`,
`resetFontScale`, `handleFontKey`, `handlePinKey`, `handleMotionTunerKey`,
`handleHarnessSelectorKey`, `progressChanged`, `grouped`); gate G;
`bridge/tour-model.test.js` still passes without `total` in `start()`.

*Deviations (implementation):*
- Horizontal scrolling reached further than the finding said.
  `scrollKeyImpulse`, `scrollBy` and `scrollLine` all lose their `dx`, and
  the wheel handler drops `sideways`. The Y paths are unchanged.
- The Y/N pair now reads a root `permissionKeysLive` property, because an
  inline component cannot see the `prompt` id.
  `test_permission_keys_guard` checks 2 shortcuts plus that property,
  instead of 4 shortcuts.
- Two one-line helpers (`clampImpulse`, `clampDeceleration`) instead of one
  `clampMotion`.
- `Ask.qml`'s `shortcutSubmapDesired` repeated the `opened` condition too,
  so it uses `opened` as well.
- `TourModel.start()` loses its now-unused `tour` parameter, and the tour
  tests call it without one.
- `BridgeProc` takes the resolved `path`, not a script name, for the same
  scoping reason as the Y/N pair.
- The empty stderr parser was checked against Quickshell v0.3.1's
  `process.cpp`: with no parser it calls `closeReadChannel(StandardError)`,
  which discards the output, the same as the empty parser.
- `qmllint`, with Qt 6.11 and Quickshell 0.3.1 on its import path, shows no
  new warning kinds, and fewer "unqualified access" warnings than before.

### Step 3: the four mechanism swaps (four commits)

- **3a.** The coast component. Make `menuTrackpadWheel`, `menuCoastTimer`
  and `menuKeyboardCoast` (L2003-2088) and `coastMenuTrackpad` (L590-605)
  one inline component, shared with the transcript's `trackpadWheel`,
  `coastTimer`, `keyboardCoast` (L1493-1520, L1562-1625) and
  `coastVertically` (L400-417). The parameters are the flickable, the
  velocity property and the bounds, and the constants stay the same.
- **3b.** Replace the ten Ctrl+1…Ctrl+0 Shortcuts (L1084-1093) with
  `Instantiator { model: 10; delegate: Shortcut { sequence: "Ctrl+" + ((index + 1) % 10); enabled: conversation.menuOpen; onActivated: conversation.selectVisibleSlot(index) } }`.
  *Deviation (implementation):* a `Repeater` whose delegate is an `Item`
  holding the `Shortcut`, not an `Instantiator`. Qt finds a Shortcut's
  window through its parent, and Instantiator's objects have no Item parent.
- **3c.** Replace `pendingPermissionId`, `…Title`, `…Detail` and
  `…Omitted` (L43-46) with `property var pendingPermission: null`. Update
  `clearPermissions`, `enqueuePermission` and `showNextPermission`
  (L1197-1232) and every binding that read the four. `enqueuePermission`
  pushes and calls `showNextPermission`, and the empty case of
  `showNextPermission` calls `clearPermissions`.
- **3d.** In `Ask.qml`, replace the copy toast Timer and fade (L117-122,
  L293-308) with
  `SequentialAnimation { PropertyAction opacity 1; PauseAnimation <same hold>; NumberAnimation to 0 <same duration> }`.
  `showCopyToast()` restarts it.

→ **verify each:** gate R for the removed ids; gate G. For 3c, the
permission tests in `tools/test_nixi.py` (`test_permission_keys_guard`,
`test_permission_detail_is_plain`) pass, changed only where they grep the
old property names.

### Step 4: Python and bin (one commit)

- **`install.py`:**
  - Remove `_LOG` and `write_log()` (L46-50) and their calls (L535,
    L583, L587-600), and drop `"--log"` from the L503 filter.
  - Remove the `source_root` and `.installed-version` `place` calls
    (L308-310) and the manifest version read that only feeds them.
  - Remove the `"node"` key from `requirements()` (L371).
  - Delete `_shutil_which` (L484-486). `import shutil` and call
    `shutil.which`.
  - The skills loops (L450-459) become two direct `place` calls and two
    `remove` calls for `SKILL.md`.
  - `core = bool(want_on) or not want_off` replaces L517 and L521-522.
- **Parity check:** `grep -n "source_root\|installed-version" nix/hm-module.nix`
  returns nothing. If it finds anything, remove it there too.
- **`bin/nixi-watch`:**
  - The constants at L23-27 become plain literals with the same values.
  - Delete the `--stdin` branch (L290-293) and `workspace_switches`
    (L231, L251).
  - Move `import secrets` and `import stat` (L52-53) to the import block.
- **`bin/nixi-context`:** drop the `"keys"` entry (L190), use `import re`
  (L17) instead of the `_re` alias, and use `head` instead of `f"{head}"`
  (L100).
- **`tools/build-faq.py`:** `git rm`. Then `grep -rn build-faq` (excluding
  `intent/`, `spec/` and `plan/`) returns nothing.

→ **verify:** gate G. `python3 install.py --help` (or its dry-run
equivalent) still runs. `test_old_plugin_dir_migration` and the other
install tests pass.

### Step 5: Nix, CI, test harness (one commit)

- **`nix/package.nix`:**
  - In `installCheckPhase`, add
    `test ! -e $out/share/nixi/ui.html && test ! -e $out/share/nixi/vendor`
    and `! find $out -name __pycache__ -o -name '*.pyc' | grep -q .`, both
    carried over from the CI step.
  - Delete the `nixi-server` check (L196).
  - Delete the `mkdir -p` at L88.
  - Replace `(finalAttrs: {` with a plain attrset (L65) and close it to
    match.
- **`.github/workflows/ci.yml`:** delete the "Package ships the card, the
  button and the programs" step (L38-59).
- **`nix/hm-module.nix`:** inline `mkService` (L34-48) into
  `systemd.user.services.nixi-watch` (L250-253), and delete `defaultText`
  (L74).
- **`flake.nix`:** delete the `apps` output (L18-26).
- **`tools/test_nixi.py`:**
  - The main block runs
    `for name, fn in list(globals().items()): if name.startswith("test_") and callable(fn): fn()`
    and prints `all checks passed` as before.
  - L310-321 uses `load()`, and L92-97 uses `_tracked()`.
  - Drop `_slug` (L51).
  - Check that the number of tests run is the same as before (21, which
    includes #27's if it is rebased in).

→ **verify:** gate G. `nix run . -- --help` exits 0, or, if `nixi` has no
`--help`, `nix eval .#packages.x86_64-linux.default.meta.mainProgram` is
`"nixi"` and `nix run .` resolves. `actionlint` passes on `ci.yml` if it
is installed (CI's Lint job runs it).

*Result (implementation):*
- `test_old_widget_stays_gone` allows `nix/package.nix` to name `ui.html`
  now that the absence check lives there. `ci.yml` stays on its list,
  because the offline-installer job's cleanup test also names it.
- The inlined `nixi-watch` unit, evaluated through the CI's Home Manager
  configuration, matches the old one: same Description, ExecStart, Restart,
  PATH and targets.
- `nix run .` is covered by `meta.mainProgram = "nixi"`, as checked with
  `nix eval`. `nixi` has no `--help`, and running it would open the card,
  so it was not run.

### Step 6: bridge (one commit, after PR #34)

1. Wait for PR #34 to merge, then `git rebase master`. If #34 is still
   open: push steps 1–5 as PR A and stop here to ask.
2. **`bridge/math.js`:**
   - Add `"prod"` to `functions` (L6-12).
   - Delete the `aggregateFunctions` set and its clause (L14, L48).
   - Delete the second `%` rewrite (L149-151).
   - Pass the parsed `tree` into `safeExpression` instead of parsing twice
     (L122, L153).
   - One `NUMBER` regex const for L84, L88, L99 and L108.
   - `normalizeUnit` (L74-79) becomes
     `({ f: "degF", c: "degC" })[value.toLowerCase()] || value`.
3. **`bridge/math.test.js`** (new): spawn `node math.js`, write lines to
   stdin, and parse its JSON output. Assert:
   - "product 2 3 4" gives 24;
   - "sum 1 2 3" gives 6;
   - "2+3*4" gives 14;
   - "10% of 50" gives 5, if that form is supported today (check the
     current output first and pin whatever it returns);
   - `import("fs")` gives no result.
4. **`bridge/bridge.js`:**
   - One `choose(options, kind)` for the three picker copies (L244-250,
     L349-355, L391-395).
   - Call `cancelAllPendingPermissions()` at L402-405.
   - `messageText` becomes one expression.
   - `flatMap` for `flatOptions`/`matchingValue`.
   - `once(child, "exit")` for `childExited` (L198-199).
   - `setTimeout` from `node:timers/promises` (L406).
   - Drop `ready.agent`, `ready.sessionId`, `ready.capabilities` and
     `tool.id`.
   - `parseCommand(raw)` is exported from `harness-policy.js`, and
     bridge.js (L29-42) and `grounding.js` (L14-23) use it.
5. **`bridge/harness-policy.js`:** remove `export` from `AGENTS` (L4) and
   drop the `OPENCODE_PATH` override (L47) and its test line
   (`harness-policy.test.js` around L178).
6. **`bridge/harness-errors.js`:** two module consts for the regexes.
7. **`bridge/trust-policy.js`:**
   - `resolveTrust` becomes `value === "mechanic" ? "mechanic" : "guide"`,
     and `TRUST_LEVELS` is removed if nothing imports it (grep).
   - `trustPolicy` returns `{ modeId, permission }`, and the trust-table
     test drops `trust`.
   - #27's leftovers: `ask: CLAUDE_SECRET_READS` without the copy, plain
     truthiness in `claudePermissions` and `opencodePermissions`, and
     delete the redundant test lines (the "never Bash…" loop and the
     `opencodePermissions(undefined)` line).
8. **`bridge/grounding.js`:** drop `grounded` (L30, L39).
9. **`bridge/files.js`:**
   - Drop `NIXI_FILE_ROOT` (L11-16, L38) and `NIXI_REPO_SEARCH_DEPTH`
     (L26-27).
   - One priority-root list (L17-18, L88-89).
   - `underBase()` for L74-82 and L212-217.
   - `fdLines()` for L64-69 and L232-236.
   - Drop `size`, `modified`, `gitStatus` (L290-292) and `basePath`
     (L130, L161, L261).
   - Call `initialize(); discoverRepos();` bare (L152-153).
   - `cancelPending()` for L320-323 and L336-338.
10. **`bridge/windows.js`:** `basename` (L63), and drop `originalTitle`
    (L156).
11. **`bridge/preview.js`:** drop `truncated` and `mime`, keeping
    `text = decoded.slice(0, 24000)`.
12. **`bridge/testing/run-bridge.js`:** use `readline.createInterface` for
    stdout lines (L54-69).

→ **verify:** gate R for every dropped field, grepping `*.qml` for the
event field names (e.g. `\.capabilities`, `originalTitle`, `gitStatus`);
gate G; `math.test.js` passes.

*Result (implementation):*
- PR #34 merged first, after fixing its three Copilot review threads.
  `master` then held `test_nixi.py`'s one rebase conflict: the hand-kept
  list against the loop. The loop won, and it picks up #27's two new tests.
- `math.test.js` was written against the **unchanged** math.js first. It
  failed only on the two `prod` cases, which pins every other answer.
  After the change it passes. `normalizeUnit` uses a one-line regex, not a
  lookup object: an object lookup would match inherited keys such as
  `constructor`.
- `files.js`: the file and repository priority lists differ (repositories
  leave out Downloads), so they share an `existingRoots()` helper rather
  than becoming one list. The old and new files.js give identical results
  against a scratch HOME: a file, a repository in `Projects/`, and one
  elsewhere. `fdLines()` keeps the `execFileAsync("fd"` literal that
  `nix/package.nix` pins.
- `bridge.js`: `once(child, "exit")` rejects on a spawn error, which the
  old hand-made promise never did, so it gets `.catch(() => {})`. The two
  "bad adapter command" errors become one message, still matching the
  test's `/JSON array/`. The per-agent variable-name map, duplicated
  between bridge.js and `adapterAvailable()`, is now `adapterOverride()`.

### Step 7: razer, through the card

1. Build this branch with razer's adapters: the `nix build --impure
   --expr` override used for #27, with claude-agent-acp 0.79.0,
   codex-acp 1.12.0 and opencode 1.18.31 by store path. Then
   `nix copy --to ssh://razer`.
2. Save `readlink` of the plugin link and a copy of `nixi.json` to `/tmp`
   on razer, swap the plugin link, and run `omarchy-restart-shell`. Note
   the time.
3. Ask for ai-mirror control (the helper that sets `HYPRLAND_INSTANCE_SIGNATURE`
   and `WAYLAND_DISPLAY` over SSH), and wait for the yes.
4. Run the spec's 10 checks:
   1. open, close, pin and unpin;
   2. search rows, a FAQ row, Ctrl+1;
   3. `@` search, hovering an image and a text file (the preview
      appears);
   4. `^` search;
   5. `/tour` and `/learn`;
   6. a Mechanic prompt, and N;
   7. scrolling a long answer with keys and trackpad, and scrolling the
      menu;
   8. the copy toast;
   9. SUPER+, then the chips, then Escape;
   10. `journalctl --user --since <time> | grep -E "(Conversation|MenuSearch|Ask|Tour|HarnessSelector)\.qml"`
       shows no errors.

   Take a screenshot of each.
5. Restore the link and `nixi.json`, check with `readlink`/`cmp`, restart
   the shell, and release control.

→ **verify:** all 10 pass. On any failure: stop, record it here, and fix
it in the commit for that area (or revert the 3x commit for a mechanism
swap).

### Step 8: PR

Link the intent, spec and plan. Report the real `git diff --stat master`
total, the razer results, and "Fixes #35". If step 6 had to wait, this
becomes two PRs as described in step 6.

## Tests

```sh
node --test bridge/*.test.js     # all pass, plus math.test.js
python3 tools/test_nixi.py       # all checks passed, same number of tests
nix flake check                  # all checks passed
nix run . -- --help              # or the mainProgram check in step 5
```

Plus the razer checks in step 7.

## Rollback

Each area is its own commit, and each mechanism swap is its own commit.
Revert the one that misbehaves (`git revert <sha>`). The whole task
reverts with the PR. Nothing is migrated on disk. `install.py` stops
writing `source_root` and `.installed-version`, and those files are left
alone on machines that already have them; nothing reads them either way.
