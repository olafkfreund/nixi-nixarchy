---
status: draft
issue: 35
intent: intent/2026-09-22-35-dead-code-cleanup.md
---

# Spec: Remove dead code and duplication (~940 lines)

## Answers to the intent's open questions

The intent was approved without answers, so these are the defaults. Change
any of them in this review.

1. **math.js "product": remove it.** Nobody can have used it, since it has
   never worked. The regex alternative and the `prod(...)` line go.
2. **All findings in this task**, including the four changes that swap one
   mechanism for another (the shared coast component, `Instantiator` for
   Ctrl+N, one `pendingPermission` object, the `SequentialAnimation`
   toast). You asked for "do them all". Each of those four is its own
   commit, so any one can be reverted alone.
3. **razer**, through ai-mirror over SSH, with the reversible link swap
   used for #27.

## Design

The work is split into five commits, one per area, each leaving every test
suite green. The finding list from the review (issue #35) is the checklist.
Only decisions and non-obvious parts are spelled out here.

### 1. The dead file browser (`Conversation.qml`, `MenuSearch.qml`)

- **Keep the live `@` preview working.** `filePreviewTimer` is declared
  inside the dead `fileList`, but `scheduleFilePreview()`,
  `cancelFilePreview()` and `closeFilePreview()` use it for the `@` rows.
  It moves to root level first, as does `filePreviewProc` if it also lives
  under `fileCard`.
- **Collapse the preview functions.** In them and in the timer,
  `root.fileBrowserOpen ? <browser case> : <@ case>` becomes the `@` case.
- **Delete** `openFileBrowser()`, the `fileCard` BorderSurface and
  everything under it, and the `fileBrowser*` and `fileShortcut*` state.
  Also delete the file-browser coast, scroll and selection functions, and
  the `fileBrowserOpen` branches in `selectVisibleSlot`,
  `openFileBrowserSelection`, `scrollPage` and `scrollActiveSurface`.
- **Delete** the `mask: Region` block, which is the default when no browser
  can be open.
- **MenuSearch.qml:** `fileMode`, `repoMode` and `fileQueryOverride` are only
  ever true through `fileBrowserOpen`. Remove them, their `on…Changed`
  handlers, and the "focused mode" branches in scoring and `requestFiles()`
  that only they reach. The `@` and `^` prefixes stay, because they go
  through `searchMode`.
- Every removed identifier is grepped for across all `*.qml` and `*.js`
  before the commit. The count must be zero.

### 2. Other QML

- **Deletions:**
  - `Conversation.toggle()`.
  - Horizontal transcript scrolling: `horizontalScroll`, the X half of
    `scrollBy`, `scrollLine`'s `dx`, the Left/Right/Ctrl+H/Ctrl+L
    shortcuts and their `handleScrollKey` branches.
  - The empty stderr SplitParser.
  - `Tour.stop()`, `Tour.progressChanged` and its emits, and
    `TourModel.start().total`.
- **Shrinks:**
  - `Ask.qml`: use `root.opened` in four places. `normalizeCommand` becomes
    map and filter. One `clampMotion` helper. The toast becomes a
    `SequentialAnimation`.
  - `Tour.qml`: `Object.assign`.
  - `HarnessSelector.qml`: `indexOfValue`, and one inline `Chip` component.
  - `MenuSearch.qml`: one `clearPathResults()`, use `scored` directly, and
    one inline `BridgeProc` component.
  - `Conversation.qml`: one `handleCardKey(event)`. The Y/N shortcuts move
    into `WindowShortcuts`. Emit the font-scale signals directly.
- **The four mechanism swaps, as separate commits:**
  - the shared coast component (menu and transcript);
  - `Instantiator` for Ctrl+1…0;
  - `property var pendingPermission`;
  - the toast animation.

### 3. Bridge

- **Fields dropped from events** (none are read by any QML or test; checked
  again before the commit):
  - `ready`: `agent`, `sessionId`, `capabilities`;
  - `tool`: `id`;
  - grounding: `grounded`;
  - windows: `originalTitle`;
  - preview: `truncated`, `mime`;
  - files: `size`, `modified`, `gitStatus`, `basePath`;
  - `trustPolicy()`: `trust`. The trust-table test drops that column.
- **Knobs removed:** `NIXI_FILE_ROOT`, `NIXI_REPO_SEARCH_DEPTH`
  (`repoSearchDepth` in nixi.json stays), and `OPENCODE_PATH` along with its
  test line.
- **math.js:**
  - remove `product`;
  - drop the aggregate-set clause and the second `%` rewrite;
  - parse the expression once;
  - one number-regex const;
  - a unit lookup object.
- **Stdlib:** `events.once`, `timers/promises` `setTimeout`,
  `path.basename`, `readline` in `run-bridge.js`, and `flatMap` for the
  config options.
- **One helper each:**
  - `choose(options, kind)`;
  - `parseCommand(raw)`, used by bridge.js, harness-policy.js and
    grounding.js;
  - `fdLines()`, `underBase()` and `cancelPending()` in files.js;
  - one priority-root list;
  - the two harness-errors regexes as consts.
- **Small cuts:** `messageText` becomes one expression; call
  `cancelAllPendingPermissions()`; no `export` on `AGENTS`;
  `resolveTrust` without `TRUST_LEVELS`.
- **Ordering with #34.** This commit is written against `master`, then
  rebased onto `master` after PR #34 merges. #34's own two findings
  (redundant test lines; truthiness and no copy in `claudePermissions`) are
  applied then. If #34 has not merged when steps 1, 2, 4 and 5 are done,
  those land as their own PR and the bridge commit follows.

### 4. Python and bin

- **`install.py`:**
  - remove `--log` and `write_log`;
  - remove `source_root` and `.installed-version`, with the manifest read
    that only fed them;
  - remove the `"node"` requirements key;
  - call `shutil.which` directly;
  - two direct `SKILL.md` calls;
  - the one-line `core`.

  **Install parity:** check `nix/hm-module.nix` never wrote `source_root`
  or `.installed-version`. If it did, remove them there too.
  `test_old_plugin_dir_migration` and the other install tests must pass
  unchanged, or change only where they pinned a removed file.
- **`bin/nixi-watch`:** plain constants instead of `OMARCHY_TIPS_*`, delete
  the `--stdin` branch and `workspace_switches`, move the imports up.
- **`bin/nixi-context`:** drop the dead `"keys"` entry, plain `import re`,
  and `head` instead of `f"{head}"`.
- **Delete `tools/build-faq.py`.** Check that no doc tells maintainers to
  run it. If one does, fix that doc.

### 5. Nix, CI, test harness

- **`nix/package.nix`:**
  - move the CI step's two checks that are not already there into
    `installCheckPhase`: `ui.html` and `vendor` absent, and no `__pycache__`
    anywhere in `$out`;
  - drop the impossible `nixi-server` check and the redundant `mkdir -p`;
  - use a plain attrset instead of `finalAttrs`.
- **`.github/workflows/ci.yml`:** delete the "Package ships the card…" step.
- **`nix/hm-module.nix`:** inline `mkService`, and drop the redundant
  `defaultText`.
- **`flake.nix`:** delete the `apps` output. `nix run .` must still start
  `nixi`, and is checked.
- **`tools/test_nixi.py`:**
  - run every `test_*` global instead of a hand-kept list;
  - use `load()` and `_tracked()`;
  - drop the unused `_slug`.

## Alternatives rejected

- **One big commit.** It can't be reviewed or partly reverted. Five area
  commits plus four mechanism-swap commits can.
- **Keep the file browser and wire it up.** Nobody asked for it, it has
  never shipped, and the `@` rows already do file search with a preview.
  Wiring it up would be a feature, which needs its own intent.
- **Make "product" work.** It is one allowlist entry, but it adds behaviour
  in a cleanup task. It can be a feature request if anyone wants it.
- **Leave the test knobs "for later"** (`OMARCHY_TIPS_*`, `--stdin`).
  Nothing uses them, and a test that needs them can add them back.

## Risks

- **A missed QML reference** only appears at runtime, as
  `ReferenceError`/`TypeError` in the shell log. Mitigations: the grep
  gate per commit, and the razer run with a `journalctl` check for
  `Conversation.qml`, `MenuSearch.qml` and `Ask.qml` errors.
- **The `@` preview** depends on the timer moved out of the dead panel. It
  is checked on razer by hovering an image and a text file in `@` results.
- **The coast component swap** could change how scrolling feels: speed,
  deceleration, the trackpad. Check on razer with keyboard and trackpad
  scrolling in both the transcript and the menu. If it feels different,
  revert that one commit.
- **Conflicts with PR #34** in `bridge.js`, `trust-policy.js`,
  `fake-agent.js` and `test_nixi.py` are handled by the ordering in 3.
- **`nix run`** without the `apps` output relies on
  `meta.mainProgram = "nixi"`. It is checked explicitly.

## Verification

- After every commit: `node --test bridge/*.test.js`,
  `python3 tools/test_nixi.py`, and `nix flake check`, all green.
- Per QML commit: every removed identifier greps to zero across `*.qml` and
  `*.js`.
- `nix run . -- --help` (or an equivalent that exits without opening the
  card) starts `nixi`.
- `git diff --stat master` shows about 900 fewer lines. The actual number
  is reported.
- **razer, through the card** (build with razer's adapters, swap the plugin
  link, restore after):
  1. Open and close the card; pin with Ctrl+P, unpin.
  2. Type to get search rows; choose a FAQ row; Ctrl+1 on a row.
  3. `@` search; hover an image and a text file; the preview appears.
  4. `^` repository search.
  5. `/tour` starts and advances a step; `/learn` shows the next topic.
  6. Mechanic: ask for a change; the permission prompt shows the detail;
     N denies.
  7. Scroll a long answer with keys and trackpad; scroll the menu.
  8. The copy toast appears and fades.
  9. SUPER+, opens the agent selector; the chips select; Escape closes it.
  10. `journalctl --user --since <start>` shows no QML errors from Nixi's
      files.

  Then restore the link and `nixi.json`, and check them with
  `readlink`/`cmp`.
