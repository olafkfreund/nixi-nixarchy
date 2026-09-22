---
status: draft
issue: 35
author: olafkfreund
---

# Intent: Remove dead code and duplication (~940 lines)

## Problem

On 2026-09-22 a whole-repo review for over-engineering found about 940
lines that can go without changing what anyone sees. The findings were
checked against the code (grep for every reference, `git log -S`). The
biggest ones were verified by hand.

The largest single find is that **Conversation.qml's file-browser panel has
never been reachable.** `openFileBrowser()` has no caller, and it is the
only code that sets `fileBrowserOpen = true`. `git log -S` shows the
function arrived in `051a5c0` and was never called. So the `fileCard`
panel, and the scroll, coast, selection and shortcut code that only it
uses, is about 650 lines nobody can reach. The `@` inline file search in
the composer is separate code and stays.

The rest falls into five kinds:

- **Dead code:** functions, signals and fields that are never read.
  - QML: `Tour.stop()`, `Tour.progressChanged`, `TourModel.start().total`,
    `Conversation.toggle()`, and horizontal transcript scrolling
    (`contentWidth: width` means it can never move).
  - Bridge events: `ready.agent`, `ready.sessionId`, `ready.capabilities`,
    `tool.id`, `grounded`, `originalTitle`, `truncated`, `mime`, `size`,
    `modified`, `gitStatus`, `basePath`.
- **Knobs nobody sets:** `NIXI_FILE_ROOT`, `NIXI_REPO_SEARCH_DEPTH`,
  `OPENCODE_PATH` (set only by a test), and the `OMARCHY_TIPS_*` and
  `--stdin` test modes in `nixi-watch`, which no test uses.
- **Leftovers from removed features:** `install.py --log`, `source_root`
  and `.installed-version`, whose readers went in `7990deb`. Also
  `tools/build-faq.py`, which nothing calls and whose output would fail the
  FAQ schema test.
- **Duplication:** the same block pasted two or three times.
  - QML: menu versus transcript coast physics, the Y/N shortcuts, the key
    handler chain, MenuSearch's Process blocks, HarnessSelector's chips.
  - Bridge: the permission-option picker, the `fd` runner, and the
    adapter-command parsing in three files.
  - CI: a step that mostly repeats `installCheckPhase`.
- **Hand-rolled stdlib:** `events.once`, `timers/promises`,
  `readline.createInterface`, `path.basename`, `shutil.which`,
  `Object.assign`, `ComboBox.indexOfValue`, `Array.flatMap`.

One finding is a real bug hidden as dead code: math.js accepts a
"product …" command that can never work, because `prod` is not in its
allowed function list.

Dead code costs something even though it never runs. It reads as a
feature (a file browser, `--log`, test knobs), it gets edited in every
change that touches its file, and it makes the files people do change
(`Conversation.qml` at 3,000 lines) harder to review.

## Proposed outcome

- About 940 fewer lines, and nothing a user can see changes: the card,
  search rows, `@` file search, tour, learning path, permission prompts,
  install paths and CI results all behave as before.
- The "product …" math command is either removed (the review's
  recommendation) or made to work. The spec decides which.
- Every test suite still passes (`node --test`, `tools/test_nixi.py`,
  `nix flake check`), and the card is checked on a real desktop, because
  QML errors only appear at runtime.

## Affected users and systems

- Nobody's behaviour, if this is done right. The risk is a QML reference
  that was missed, which only shows up at runtime.
- Files: `Conversation.qml`, `MenuSearch.qml`, `HarnessSelector.qml`,
  `Ask.qml`, `Tour.qml`, `TourModel.js`, `bridge/*.js`,
  `bridge/testing/*.js`, `install.py`, `bin/nixi-watch`, `bin/nixi-context`,
  `nix/package.nix`, `nix/hm-module.nix`, `flake.nix`,
  `.github/workflows/ci.yml`, `tools/test_nixi.py`, and
  `tools/build-faq.py` (deleted).
- Tests that pin removed fields (for example the trust table's `trust`
  field) change with them.

## Constraints

- **No behaviour change**, apart from the math "product" decision above.
- **Coordinate with PR #34 (#27).** It is open and touches `bridge.js`,
  `trust-policy.js`, `fake-agent.js` and `test_nixi.py`. This branch starts
  from `master`, and the bridge changes are rebased onto `master` after
  #34 merges, so #27's rules are not lost in a conflict. The two findings
  that are about #34's own code go into this branch after that rebase.
- **The install paths stay equal.** Whatever `install.py` stops writing,
  `nix/hm-module.nix` must not still write, and the reverse.
- **Small, reviewable commits**: one per area (the dead file browser, other
  QML, bridge, Python/bin, Nix/CI), each with the tests passing.
- **Verified on a real desktop**, the same way as #19–#21 and #27: a build
  of this branch swapped onto a machine's card. It checks search rows, `@`
  file search with preview, the tour, the permission prompt and Y/N,
  scrolling, and pinning.

## Open questions

1. **math.js "product":** remove the command (the review's
   recommendation, since nobody can have used it) or make it work by
   adding `prod` to the allowed functions?
2. **The reversible changes.** Some shrinks swap working code for a
   different mechanism: the shared coast component, `Instantiator` for the
   Ctrl+N keys, one `pendingPermission` object, and the `SequentialAnimation`
   toast. They carry more risk than plain deletions. Do them all in this
   task, or only the deletions and stdlib swaps now, with the QML
   refactors as a second issue?
3. **Which desktop:** razer again (through ai-mirror over SSH, as for
   #27), or p620?
