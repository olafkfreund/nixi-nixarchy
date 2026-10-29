---
status: draft
issue: 121
spec: spec/2026-10-29-121-split-conversation.md
coders:      # step -> implementer; unlisted steps use the coder agent
  1: codex   # the lint script first, so every later step is checked by it
  2: codex   # verbatim component moves, mechanical
  3: codex   # same pattern as step 2, plus the root./sibling-id rewrite
  4: codex
reviewers:
  - agy      # read-only review of the full diff, after the Opus review
---

# Plan: split Conversation.qml (#121)

Decisions carried from the approved spec:

- Move four parts of `Conversation.qml` (2,562 lines) into files next to it:
  `ScrollPhysics.qml`, `WindowShortcuts.qml` (verbatim), `FilePreview.qml`,
  `InlineResults.qml` (with `required property Item conversation`; every `root.`
  becomes `conversation.`; every sibling id becomes a `required property` the use
  site passes in). Nothing else changes: no renames, no behaviour edits.
- **The permission layer (`id: permissionLayer`, ~2344) stays.** Do not touch it.
- `nix/package.nix` installs and checks the new files. `install.py` is unchanged.
- `tools/test_nixi.py` text checks read the concatenated source through one helper;
  no assertion is deleted.
- New flake check `checks.qml-lint` running `tools/qml-check.sh`.
- Live check on p620 before merge (scroll, a window shortcut, `@` search,
  preview, approval card).

Worktree: `/mnt/code/Source-home/GitHub/nixi-nixarchy-121`, branch
`refactor/121-split-conversation`. Symlink `bridge/node_modules` from the main
checkout if missing.

## Steps

1. **`tools/qml-check.sh` (new) and `flake.nix` `checks` (~line 36): the lint check.**
   - Script: `qmllint -I <qt6 qml dir> -I <quickshell lib/qt-6/qml> <file>` for each
     plugin `.qml` at the repo root (`*.qml`, `button/*.qml`). Tool paths come from
     args or env set by the flake; the script also runs locally with
     `nix shell nixpkgs#qt6.qtdeclarative nixpkgs#quickshell`.
   - Fail (exit 1, print the offending lines) when, for any file:
     - qmllint exits 255 (syntax error), or
     - an `Error:`/`[import]` line reports `X was not found` with X not in the
       allowlist, or
     - an error line is not one of the baseline patterns
       (`Type anchors … not resolved [unresolved-type]`).
   - Allowlist: the `qs.*` Omarchy types the files use today, found by running the
     script on current master. Only Omarchy shell types; never a local component
     name. Each with a one-line comment.
   - Flake: `qml-lint = pkgs.runCommand "nixi-qml-lint" { nativeBuildInputs =
     [ pkgs.qt6.qtdeclarative ]; } '' … bash ${./tools/qml-check.sh} … ; touch $out ''`,
     passing `${pkgs.qt6.qtdeclarative}/lib/qt-6/qml` and `${pkgs.quickshell}/lib/qt-6/qml`.
   - → verify: `nix build .#checks.x86_64-linux.qml-lint` passes on unchanged
     `Conversation.qml`; then add a deliberate typo (`ScrollPhysicz {`) and an
     unknown type, see it fail, revert. Record the failing output in the PR.
   - Traps: qmllint prints to stderr; capture both streams. Exit 255 is the syntax
     error code, other non-zero exits come from warnings: don't fail on exit code
     alone. Codex's sandbox can't run nix: the lead runs the verify.

2. **`Conversation.qml:783-898` → `ScrollPhysics.qml`, `:900-952` → `WindowShortcuts.qml`.**
   - Each new file: the same imports `Conversation.qml` has that the body needs,
     then the component body verbatim as the root item (`Item { … }`), without the
     `component X:` prefix. Delete the inline definitions.
   - Use sites (1373, 1374, 1391, 2560) unchanged.
   - `nix/package.nix:160` loop and `:251` check list gain both files.
   - → verify: `qml-lint` passes; `python3 tools/test_nixi.py` passes;
     `nix build .#nixi` passes (install check lists the files).
   - Traps: QML resolves `ScrollPhysics` from a same-directory file only when the
     file name matches exactly (case). The installed plugin dir must contain them,
     hence package.nix.

3. **`Conversation.qml` ~2184-2307 (`Item { id: filePreviewCard … }`) → `FilePreview.qml`.**
   - New file root: `Item` with `required property Item conversation` plus
     `required property` for `card`, `panel`, `pinnedWindow`, `inlineResults`
     (types: the narrowest that works; `Item`/`var` where the sibling is a window).
     Inside, `root.` → `conversation.`; sibling ids unchanged by name (the
     properties carry the same names).
   - Use site in `Conversation.qml`: `FilePreview { id: filePreviewCard;
     conversation: root; card: card; panel: panel; pinnedWindow: pinnedWindow;
     inlineResults: inlineResults }`.
   - `filePreviewTimer` (~2309) stays in `Conversation.qml`.
   - package.nix lists as in step 2.
   - → verify: `qml-lint`, `test_nixi.py`, `nix build .#nixi`.
   - Traps: `card: card` may resolve the right-hand `card` to the new property
     itself (a binding loop) rather than the sibling id. If qmllint or a run shows
     that, name the properties `cardRef`, `panelRef`, … in both files instead, use
     the same rule in step 4, and record it as a deviation. Brace-match the block
     end; don't trust the line numbers blindly.

4. **`Conversation.qml` ~1870-2121 (`ListView { id: inlineResults … }`) → `InlineResults.qml`.**
   - Same pattern as step 3: root `ListView`, `required property Item conversation`,
     required properties for `menuPhysics`, `menuResults`, `menuSearch`.
   - Use site keeps `id: inlineResults`, so `ScrollPhysics { flickable: inlineResults }`
     (1374) and `FilePreview`'s property still resolve.
   - package.nix lists as in step 2.
   - → verify: `qml-lint`, `test_nixi.py`, `nix build .#nixi`;
     `wc -l Conversation.qml` is about 2,000.
   - Traps: delegates inside the ListView use `index`/`model` roles and
     `root.menuIndex`, `root.menuActivate` — those become `conversation.…`.
     `ListView.view` references are unchanged.

5. **`tools/test_nixi.py`: the text checks read the combined source.** (lead)
   - One helper near `ROOT` (~21): `card_source()` returns `Conversation.qml` +
     the four new files concatenated.
   - Replace the reads at ~515, 614, 647, 699, 909, 943, 955, 995, 1043 and the
     `Conversation.qml` entry in the loop at ~1033 with it. Messages naming
     `Conversation.qml` stay.
   - Check whether an assertion matches `root.X` for code that is now
     `conversation.X` (e.g. the ListModel check at ~515): if so, accept either
     prefix in that assertion — don't weaken anything else.
   - → verify: `python3 tools/test_nixi.py` passes; temporarily delete a moved
     line that an assertion guards, see it fail, revert.
   - Traps: this step runs after 2-4 are committed, but `test_nixi.py` must pass
     after each of them too; if a check fails earlier, do this step's helper first
     and note it in the PR.

6. **Review and live check.** (lead)
   - Opus code-reviewer on `plan/` + `git diff master...`; then agy read-only.
   - `cd bridge && node --test --test-reporter=dot ./*.test.js` (never bare
     `node --test`).
   - PR linking intent/spec/plan, `gh pr update-branch` before merge.
   - Deploy the branch build to p620 only after the user's live check, or merge
     then deploy and live-check — per the user's call. Live check: scroll (keys,
     wheel), a window shortcut, `@` search with results, file preview, an
     approval card appears and answers.

## Tests

```bash
nix build .#checks.x86_64-linux.qml-lint .#checks.x86_64-linux.selfcheck .#nixi
python3 tools/test_nixi.py
cd bridge && node --test --test-reporter=dot ./*.test.js
wc -l Conversation.qml   # ~2,000
```

## Rollback

Revert the PR's merge commit; the moved files go with it. No data or config
format changes.
