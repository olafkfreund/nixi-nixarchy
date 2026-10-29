---
status: draft
issue: 121
intent: intent/2026-10-29-121-split-conversation.md
---

# Spec: Conversation.qml is split into parts a reader can hold

## Measured (2026-10-29, on master)

**Coupling of each candidate:** references to `root` and to sibling ids outside the block.

| Part | Lines | `root.` refs (distinct) | Sibling ids used |
|---|---|---|---|
| `component ScrollPhysics` (~783-898) | ~116 | 0 | none (all through properties) |
| `component WindowShortcuts` (~900-952) | ~53 | 0 | none (`conversation` property) |
| file preview card (`filePreviewCard`, ~2184-2307) | 124 | 13 | `card`, `panel`, `pinnedWindow`, `inlineResults` |
| inline search results (`inlineResults`, ~1870-2122) | 253 | 18 | `menuPhysics`, `menuResults`, `menuSearch` |
| permission layer (`permissionLayer`, ~2343-2530) | 188 | 12 | `agent` (the bridge process), `card`, `panel`, `prompt`, `stack`, `pinnedWindow` |

**Load check:** `qmllint` from qtdeclarative 6.12, with `-I` pointing at Qt's own QML modules
and quickshell's.
- **What it catches:** a syntax error makes it exit with an error. A component that isn't
  defined or isn't packaged is reported as `X was not found … [import]`.
- **Its baseline on the current file:** it can't see the Omarchy shell's `qs.*` modules, so
  it reports three known false positives. They are `BorderSurface was not found` and two
  `Type anchors … not resolved`, plus warnings that don't matter.
- **What it can't catch:** behaviour. A wrong binding still loads.

## Design

1. **Move four parts into files next to `Conversation.qml`:**
   - `ScrollPhysics.qml` and `WindowShortcuts.qml`: the inline `component` bodies, verbatim.
     Use sites stay as they are, since QML resolves a same-directory file by name.
   - `FilePreview.qml` and `InlineResults.qml`: the blocks, with
     `required property Item conversation`. `root.` becomes `conversation.`, and each
     sibling id they use becomes an explicit `required property` that the use site passes
     in (`card: card`, …). Nothing else changes.

   About 546 lines leave `Conversation.qml` (2,562 to about 2,000).
2. **The permission layer stays in `Conversation.qml`.** It's the trust UI: it answers the
   bridge process (`agent`) and moves focus (`prompt`, `stack`). Splitting it means six
   pieces of plumbing through the security-relevant path, with nothing to test it.
   *Decided (intent open question):* not worth the risk now.
3. **Packaging.** `nix/package.nix` installs the four new files (the loop at ~160) and
   lists them in the install check's non-empty list (~251). `install.py` doesn't copy
   overlay QML (Nix only), so it doesn't change.
4. **The `test_nixi.py` text checks** that read `Conversation.qml` (~8 places, e.g.
   `:515`, `:614`, `:909`) read the concatenation of `Conversation.qml` and the moved files
   through one helper. An assertion about moved code keeps passing because it still sees
   that code. None is deleted.
5. **The load check** is a new flake check, `checks.qml-lint`. It runs
   `tools/qml-check.sh`, which calls `qmllint` (from `pkgs.qt6.qtdeclarative`), with
   `pkgs.quickshell` on the import path, on every plugin `.qml` file. It fails when:
   - `qmllint` reports an error other than the known baseline (`Type anchors … not
     resolved`); or
   - any `X was not found` names a type that isn't in the baseline allowlist
     (`BorderSurface` and the other `qs.*` types the files use today, listed in the
     script).

   It runs in CI through the existing `nix flake check` job.
6. **Live check before merge** (on p620, from a fresh session): open the card and check
   each moved part:
   - scroll with keys and wheel;
   - a window shortcut;
   - `@` file search with results;
   - preview a file;
   - an approval card still appears and answers.

## Alternatives rejected

- **Move the permission layer too:** see decision 2.
- **Split by features into a `ui/` folder or a QML module with a `qmldir`:** that changes
  import paths and packaging for no reader benefit at this size.
- **No load check, live-test only:** a missing file or a typo would only show on someone's
  desktop. `qmllint` catches exactly those for a few lines of script.

## Risks

- **A binding that depended on a lexical id now goes through a property:** if the use site
  forgets one, `qmllint` flags an unqualified access or unresolved type, and the live check
  catches the rest. All hosts.
- **The allowlist hides a real `X was not found` for an allowlisted name:** only Omarchy
  shell types are listed, never local component names.
- **`qmllint`'s output format changes with Qt versions:** the check pins
  `pkgs.qt6.qtdeclarative` from the flake's nixpkgs.

## Verification

- `nix flake check`:
  - the package's install check lists the new files;
  - `qml-lint` passes on the split;
  - `qml-lint` **fails** on a deliberate typo (shown once while implementing, then reverted).
- `python3 tools/test_nixi.py` passes, with the text checks reading the combined source.
- `cd bridge && node --test ./*.test.js` passes (unchanged).
- `wc -l Conversation.qml` comes down by about 546.
- The live check on p620 (decision 6) passes before merge.
