---
status: approved
issue: 35
author: olafkfreund
---

# Intent: drop the 0.9.x / pre-rebrand migration cluster

## Problem

Five places in the tree exist only to upgrade an installation of an older nixi
onto the current one:

| Where | What it migrates |
|---|---|
| `install.py`: `OLD_FILES`, `remove_old_widget()` | deletes the browser widget's server, unit, page, vendored JS and voice models from a 0.9.x install |
| `install.py`: the `merge_menu()` upgrade branch | rewrites nixi's own help-circle menu glyph (U+F0625) to sparkles (U+F0674) in place |
| `nix/migrate-plugin-dir.sh` + `nix/hm-module.nix`'s `nixiOldPluginDir` activation | removes the real `~/.config/omarchy/plugins/<id>` directory the 0.9.x Home Manager module created file-by-file, which would otherwise fail `checkLinkTargets` |
| `nix/package.nix`: the `share/nixi/ui.html` / `share/nixi/vendor` assertion | fails the build if the old widget's files reappear in the store output |
| `tools/test_nixi.py`: `test_old_widget_stays_gone`, `test_old_plugin_dir_migration`, `test_menu_icon_migration` | the tests for the three above |
| `.github/workflows/ci.yml`: the 0.9.x seeding in "Imperative installer (offline)" | plants `nixi-server`, `nixi.service`, `ui.html` in a throwaway `$HOME` and asserts the installer removes them |

The whole-repo review of 2026-09-22 (#35) listed this as removable on the
grounds that **0.9.x never shipped under a tag**, so it is upgrade code for a
version that had no release.

## Outcome

The cluster is gone. `install.py` stops carrying a list of files from a layout
this repo no longer produces; the Home Manager module stops running a shell
script on every activation; three tests and one CI seeding step go.

## The premise, stated honestly

`v0.10.0` is the only tag in this repository and the only GitHub release, so
"0.9.x never shipped under a tag" is literally true. **The inference from it is
weaker than it sounds, and this intent records the risk the decision accepts
rather than restating the premise as though it settled the question.**

- `install.py` first appears in `5be4010` (2026-09-02). `v0.10.0` is
  `2026-09-15`. That is a **13-day window** in which the repository was
  installable from `main` with no tag. A pre-0.10 install was possible.
- The window is real on the declarative path too, not just the imperative one.
  `nix/hm-module.nix` has existed since the fork commit `19dec39` (2026-09-03),
  and at that commit it did link the plugin file by file —
  `"omarchy/plugins/${pluginId}/manifest.json".source`, `.../BarWidget.qml`,
  `.../nixi-launch` — which is exactly the shape `migrate-plugin-dir.sh` exists
  to clean up. It also placed `"nixi/ui.html".source` and `"nixi/vendor".source`.
  So both migrations describe a layout this repo genuinely produced, from `main`,
  for thirteen days.
- **The menu-icon migration is not a 0.9.x migration at all.** `install.py` wrote
  help-circle (U+F0625) from `5be4010` (2026-09-02) until `fda8191`/`2e3bf46`
  (2026-09-17). That span **contains `v0.10.0` (2026-09-15)**. Anyone who
  installed the one tagged, released version got the help-circle glyph, and
  `merge_menu()`'s upgrade branch is the only thing that ever replaces it —
  `merge_menu()` otherwise leaves an existing `"help"` entry alone by design.
  Removing it means every v0.10.0 machine keeps a question-mark icon
  permanently. For this item the review's premise is **false**, and the removal
  is a deliberate cost, not a no-op.
- `test_old_widget_stays_gone` is also not migration code. Only one of the eight
  patterns it forbids (`ui\.html`) belongs to the migration; the other seven
  (`/voice`, `/listen/`, `pw-record`, `whisper`, `NIXI_WHISPER`, `8642`,
  `X-Nixi-Token`) guard the removed browser-widget and voice feature against
  returning, and it is the **only** guard in the tree that does so —
  `spec/2026-09-24-56-drift-traps.md:55` cites it as one of the two existing
  invariants of its class. Deleting it drops that coverage.

No evidence was found that argues the other way: nothing in the history shows an
install path that could not have worked before the tag, or a file format that
did not exist then.

The user approved this deletion directly, with the 13-day window on the table.
That call is made; this section exists so the accepted risk is on the record.

## Affected

`install.py`, `nix/hm-module.nix`, `nix/migrate-plugin-dir.sh` (deleted),
`nix/package.nix`, `tools/test_nixi.py`, `.github/workflows/ci.yml`.

Users upgrading from a pre-`v0.10.0` checkout, and users of `v0.10.0` itself for
the icon only.

## Constraints

- Deletion only. No behaviour outside the migration cluster changes.
- `python3 tools/test_nixi.py`, `nix flake check` and CI's exact `ruff` invocation
  must pass.
- Nothing removed may still be referenced anywhere.
- The "Imperative installer (offline)" CI job must still be able to fail. If the
  deletion leaves it asserting nothing, say so rather than keeping a vacuous job.

## Open questions

- Should the menu-icon migration be exempted from this deletion, given that it
  upgrades the only released version? Raised here, not decided here.
