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
  `install_core()`, `DATA`, and `merge_menu()`'s `'"help"' in s` upgrade branch
  (brace scan, glyph swap, `.bak-nixi` write and log line), leaving a bare
  `return`.
- **`install_core`'s `svc` parameter is kept** even though it becomes unused, so
  all seven piece functions keep the `(j, svc)` signature.
- **`is_enabled`, `Journal.remove`, `merge_menu`'s local `import re`,
  `_read_existing`, `must`, `systemctl` are kept** — each still has a reader.
- **`nix/`:** delete `nix/migrate-plugin-dir.sh`, the
  `home.activation.nixiOldPluginDir` block in `nix/hm-module.nix`, and the
  `share/nixi/ui.html` / `share/nixi/vendor` assertion in `nix/package.nix`
  (trimming only the clause of the comment above it that names those files).
- **`tools/test_nixi.py`:** delete `test_old_widget_stays_gone`,
  `test_old_plugin_dir_migration`, `test_menu_icon_migration`. Module imports are
  re-checked but expected to stay, all having other readers.
- **`ci.yml`:** trim the 0.9.x seeding and the "old widget left behind" loop from
  "Imperative installer (offline)"; **keep the job**, which still fails on a real
  regression; **keep `chmod 700 "$fake/.config/nixi"`**, which `_dir_ok` needs.
- **Two items are deleted under protest and reported, not unilaterally
  exempted:** the menu-icon migration (it upgrades `v0.10.0`, the only release,
  so the review's "never shipped under a tag" premise is false for it) and
  `test_old_widget_stays_gone` (seven of its eight patterns are a dead-feature
  drift guard, not migration code, and it is the only such guard). Both are
  raised in the intent's open questions and in the PR body.

## Steps

1. **`install.py`** — delete `DATA` (line 43), the `remove_old_widget(j, svc)`
   call in `install_core`, and the `OLD_FILES` + `remove_old_widget` block with
   its leading comment.
   → verify: `grep -n 'OLD_FILES\|remove_old_widget\|DATA' install.py` is empty.

2. **`install.py`** — delete `merge_menu()`'s upgrade branch body, keeping
   `if '"help"' in s:` → `return` with a short comment saying the entry is the
   user's.
   → verify: `grep -n 'f0625\|F0625\|sparkles' install.py` is empty;
   `python3 -c 'import ast,sys; ast.parse(open("install.py").read())'`.

3. **`nix/migrate-plugin-dir.sh`** — `git rm`.
   → verify: the file is gone and `git status` shows the deletion.

4. **`nix/hm-module.nix`** — delete the two comment lines and the
   `home.activation.nixiOldPluginDir = ...` block.
   → verify: `grep -n 'nixiOldPluginDir\|migrate-plugin-dir' nix/hm-module.nix`
   is empty; `nixiEnableCard` is untouched.

5. **`nix/package.nix`** — delete the `for gone in ... done` loop; trim
   "or the old widget's page and vendor files" from the comment above.
   → verify: `grep -n 'ui.html\|the old widget is back' nix/package.nix` is empty.

6. **`tools/test_nixi.py`** — delete the three test functions.
   → verify: `grep -n 'test_old_widget_stays_gone\|test_old_plugin_dir_migration\|test_menu_icon_migration' tools/test_nixi.py`
   is empty.

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
  `migrate-plugin-dir`, `nixiOldPluginDir`, `test_old_widget_stays_gone`,
  `test_old_plugin_dir_migration`, `test_menu_icon_migration`, `nixi-server`,
  `ui.html`, `f0625` — hits only in `intent/`, `spec/`, `plan/` and `docs/FORK.md`
  history, never in code.
- Hand-run the trimmed CI installer step in a throwaway `$HOME` and confirm it
  still passes and still fails when `install_core` is mutated.

## Rollback

`git revert` the implementation commit, or
`git checkout master -- install.py nix/ tools/test_nixi.py .github/workflows/ci.yml`.
Nothing is generated, no state is migrated and no interface changes, so the
revert is complete. Re-adding only `test_old_widget_stays_gone` or only the
menu-icon migration is a partial checkout of the same commit.
