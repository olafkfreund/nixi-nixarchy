---
status: approved
issue: 35
spec: spec/2026-09-24-35-drop-migrations.md
---

# Plan: drop the 0.9.x / pre-rebrand migration cluster

## Approved decisions

Carried from the approved spec, verbatim in effect:

- **Deletion only.** No behaviour outside the migration cluster changes; nothing
  is rewritten, renamed or generalised.
- **`install.py`:** delete `OLD_FILES`, `remove_old_widget()`, its call in
  `install_core()` and `DATA`. **`merge_menu()` is not touched** — its menu-icon
  migration is excluded (see the deviation note below); its comment gains the tag
  evidence.
- **`install_core`'s `svc` parameter is kept** even though it becomes unused, so
  all seven piece functions keep the `(j, svc)` signature.
- **`is_enabled`, `Journal.remove`, `merge_menu`'s local `import re`,
  `_read_existing`, `must`, `systemctl` are kept** — each still has a reader.
- **`nix/`:** delete `nix/migrate-plugin-dir.sh`, the
  `home.activation.nixiOldPluginDir` block in `nix/hm-module.nix`, and the
  `share/nixi/ui.html` / `share/nixi/vendor` assertion in `nix/package.nix`
  (trimming only the clause of the comment above it that names those files).
- **`tools/test_nixi.py`:** delete `test_old_plugin_dir_migration` only.
  `test_old_widget_stays_gone` stays, with `ui\.html` dropped from its pattern and
  the three `allowed` entries that only `ui.html` justified;
  `test_menu_icon_migration` stays unchanged.
- **`ci.yml`:** trim the 0.9.x seeding and the "old widget left behind" loop from
  "Imperative installer (offline)"; **keep the job**, which still fails on a real
  regression; **keep `chmod 700 "$fake/.config/nixi"`**, which `_dir_ok` needs.
- **Two items are excluded and stay in the tree:** `merge_menu()`'s menu-icon
  migration (a *post*-release migration — `git show v0.10.0:install.py` writes
  U+F0625, sparkles landed two days after that tag in `6d7a61b`) and
  `test_old_widget_stays_gone` (seven of its eight patterns are a dead-feature
  drift guard, not migration code, and it is one of only two invariants of its
  class in the tree). The spec carries the full evidence.

## Steps

1. **`install.py`** — delete `DATA` (line 43), the `remove_old_widget(j, svc)`
   call in `install_core`, and the `OLD_FILES` + `remove_old_widget` block with
   its leading comment.
   → verify: `grep -n 'OLD_FILES\|remove_old_widget\|DATA' install.py` is empty.

2. **`install.py`** — leave `merge_menu()`'s upgrade branch in place; extend its
   comment with the `v0.10.0` tag evidence.
   → verify: `grep -c '000f0625' install.py` is 2 (the migration only);
   `test_menu_icon_migration` passes, and fails when the glyph swap is neutered.

3. **`nix/migrate-plugin-dir.sh`** — `git rm`.
   → verify: the file is gone and `git status` shows the deletion.

4. **`nix/hm-module.nix`** — delete the two comment lines and the
   `home.activation.nixiOldPluginDir = ...` block.
   → verify: `grep -n 'nixiOldPluginDir\|migrate-plugin-dir' nix/hm-module.nix`
   is empty; `nixiEnableCard` is untouched.

5. **`nix/package.nix`** — delete the `for gone in ... done` loop; trim
   "or the old widget's page and vendor files" from the comment above.
   → verify: `grep -n 'ui.html\|the old widget is back' nix/package.nix` is empty.

6. **`tools/test_nixi.py`** — delete `test_old_plugin_dir_migration`. In
   `test_old_widget_stays_gone`, drop `ui\.html` from the pattern and drop
   `.github/workflows/ci.yml`, `nix/package.nix` and `install.py` from `allowed`.
   → verify: `grep -n 'test_old_plugin_dir_migration' tools/test_nixi.py` is
   empty; the other two tests pass; `8642` in `README.md` fails the drift guard.

7. **`.github/workflows/ci.yml`** — trim the installer step per the spec.
   → verify: `actionlint`; the step still contains the `--status` assertion, the
   adapter grep and the five existence checks.

## Tests

Run, in this order, from the worktree root:

- `python3 tools/test_nixi.py` — all remaining checks pass.
- `ruff check --select=F,B,E9,E71,E72 --output-format=concise "$tmp" install.py tools/ bin/nixi_safeio.py`
  with `$tmp` holding `.py`-suffixed copies of `bin/nixi-watch`,
  `bin/nixi-update-manual`, `bin/nixi-context` — CI's exact invocation, and the
  check that no import or name was orphaned.
- `nix flake check --print-build-logs` — the package's `installCheckPhase` and
  the self-check both build.
- `shellcheck -S warning bin/nixi install.sh hooks/*.hook`, `actionlint`.
- Reference sweep: `grep -rn` for `OLD_FILES`, `remove_old_widget`,
  `migrate-plugin-dir`, `nixiOldPluginDir`, `test_old_plugin_dir_migration`,
  `nixi-server`, `ui.html` — hits only in `intent/`, `spec/`, `plan/` and
  `docs/FORK.md` prose, never in code.
- Both excluded guards mutation-tested: `8642` in `README.md` fails
  `test_old_widget_stays_gone`; neutering the glyph swap fails
  `test_menu_icon_migration`.
- Hand-run the trimmed CI installer step in a throwaway `$HOME` and confirm it
  still passes and still fails when `install_core` is mutated.

## Rollback

`git revert` the implementation commit, or
`git checkout master -- install.py nix/ tools/test_nixi.py .github/workflows/ci.yml`.
Nothing is generated, no state is migrated and no interface changes, so the
revert is complete.

## Deviation from the original plan

Steps 2 and 6 as first written deleted `merge_menu()`'s menu-icon migration,
`test_menu_icon_migration` and `test_old_widget_stays_gone`. Both deletions were
made, reported with evidence, and **reverted on review** after the tag evidence
was independently verified: the icon migration upgrades `v0.10.0` itself, and the
drift guard is not migration code. The steps above are the corrected versions, and
the spec's "Excluded from this deletion" section records why, so the exclusion
survives the next audit.
