---
status: approved
issue: 35
intent: intent/2026-09-24-35-drop-migrations.md
---

# Spec: drop the 0.9.x / pre-rebrand migration cluster

## Design

Pure deletion, in six files. Nothing is rewritten, renamed or generalised.

### 1. `install.py`

- Delete `OLD_FILES` and `remove_old_widget()`.
- Delete the `remove_old_widget(j, svc)` call from `install_core()`.
- Delete the `'"help"' in s` upgrade branch of `merge_menu()`, and with it the
  brace-scanning loop, the `OLD`/`NEW` glyph replacement and the
  `"menu: the Help icon is now sparkles"` log line. What remains is an early
  `return` when the entry already exists — `merge_menu()`'s documented
  "the entry is the user's now" behaviour.

Orphans that follow, and what happens to each:

| Name | Verdict |
|---|---|
| `install_core`'s `svc` parameter | Becomes unused. **Kept.** `install_core` is called as `install_core(j, svc)` beside `ENABLE[f](j, svc)`/`DISABLE[f](j, svc)`; every piece function takes `(j, svc)`. Dropping it from one of them for one release buys nothing and costs the uniform signature. |
| `DATA` | Only remaining uses are inside `OLD_FILES`. **Deleted.** |
| `is_enabled` | Still used by `Services.snapshot` and `status()`. Kept. |
| `Journal.remove` | Still used by every `disable_*`. Kept. |
| `import re` inside `merge_menu` | Still used by the `re.sub(r"//.*", ...)` comment strip in the insert path. Kept. |
| `_read_existing`, `_dirfd`, `must`, `systemctl` | All still used. Kept. |

No import at the top of the file becomes unused: `json`, `os`, `shutil`, `stat`,
`subprocess`, `sys` all have other readers. Verified by CI's own `ruff --select=F`.

### 2. `nix/`

- Delete `nix/migrate-plugin-dir.sh`.
- Delete the `home.activation.nixiOldPluginDir` block and its two comment lines
  from `nix/hm-module.nix`.
- Delete the `for gone in share/nixi/ui.html share/nixi/vendor` loop from
  `nix/package.nix`, and trim the comment above it that says "or the old
  widget's page and vendor files" — the sentence's other half (bytecode must not
  ship) is still true and stays.

`nix/hm-module.nix` keeps `home.activation.nixiEnableCard`; the two activation
blocks are independent (`entryBefore [ "checkLinkTargets" ]` vs
`entryAfter [ "linkGeneration" ]`), so removing one does not reorder the other.
`pkgs.bash` loses its only use in that block but `pkgs` is used throughout.

### 3. `tools/test_nixi.py`

Delete `test_old_widget_stays_gone`, `test_old_plugin_dir_migration` and
`test_menu_icon_migration`. The runner iterates `globals()` for `test_*`, so
nothing else needs editing.

Module-level imports are then re-checked: `tempfile`, `shutil`, `subprocess`,
`re`, `json`, `os` all keep other readers (`test_enable_card`, the safe-IO
tests, `_tracked`). `load()` keeps its readers. Left alone.

### 4. `.github/workflows/ci.yml`

In "Imperative installer (offline)", delete the three `echo old > ...` seedings,
the `mkdir -p` of the two directories only they need, the comment above them,
the trailing `for f in ... old widget left behind` loop, the phrase
"over a 0.9.x install" from the step name, and "and removed the old widget" from
the final echo.

`chmod 700 "$fake/.config/nixi"` is **kept** and its `mkdir -p` reduced to
`mkdir -p "$fake/.config/nixi"`: `install.py` places into `DIR` with
`dir_mode=0o700` and `_dir_ok` rejects a group/world-writable destination, so a
pre-created directory with default runner permissions would fail the install.
This line predates and outlives the migration.

## Does the CI job stay meaningful?

**Yes, and the answer is checked rather than asserted.** After the deletion the
job still:

- runs `install.py --no-systemd --all` and fails on any non-zero exit,
- asserts `--status` is exactly `{"watcher": True, "skill": True, "hooks": True}`,
- greps the log for `agents with an ACP adapter on PATH`,
- asserts five placed paths exist, including the separate bar-button plugin and
  `~/.claude/skills/nixi/SKILL.md`.

It is still the only coverage of the imperative install path end to end, and a
mutation to `install_core` fails it. The job is not left vacuous, so it is kept
rather than deleted.

## Alternatives rejected

**Keep `test_old_widget_stays_gone`, narrowing its pattern to the seven
non-migration terms.** The honest shape: it is a dead-feature drift guard, not
migration code, and it is the only one. Rejected here because the approved scope
is the migration cluster and the named test is in it; unilaterally re-scoping a
named deletion is worse than reporting it. Recorded as the intent's open
question and flagged in the PR, so re-adding it is one revert.

**Exempt the menu-icon migration**, which upgrades `v0.10.0` — the one released
version — and not 0.9.x. Same reasoning, same escalation: raised in the intent
and the PR rather than decided unilaterally.

**Also drop `install_core`'s now-unused `svc` argument.** Rejected: see the
table. It makes one piece function differ from the other six.

**Delete the "Imperative installer (offline)" job.** Rejected: it still fails on
a real regression. See above.

## Risks

- **A pre-`v0.10.0` imperative install upgraded after this lands keeps
  `~/.local/bin/nixi-server` and an enabled `nixi.service` whose program is
  gone, so the unit restart-loops.** Accepted. Nothing left in the tree will
  clean it up.
- **A pre-`v0.10.0` Home Manager install fails activation** on
  `checkLinkTargets` against the real plugin directory, with Home Manager's own
  collision error and no nixi-specific hint. Accepted.
- **Every `v0.10.0` machine keeps the help-circle menu glyph forever.** Accepted,
  and the one risk here that contradicts the review's stated premise.
- **The browser-widget and voice code can silently return.** The only guard goes
  with `test_old_widget_stays_gone`.

## Verification

- `python3 tools/test_nixi.py`
- `nix flake check --print-build-logs`
- CI's exact ruff: `ruff check --select=F,B,E9,E71,E72` over a temp copy of
  `bin/nixi-watch`, `bin/nixi-update-manual`, `bin/nixi-context` plus
  `install.py tools/ bin/nixi_safeio.py`
- `shellcheck -S warning bin/nixi install.sh hooks/*.hook` and `actionlint`
- `grep` for every removed name across the tree: `OLD_FILES`,
  `remove_old_widget`, `migrate-plugin-dir`, `nixiOldPluginDir`,
  `test_old_widget_stays_gone`, `test_old_plugin_dir_migration`,
  `test_menu_icon_migration`, `nixi-server`, `ui.html`, `f0625`
- A simulated run of the trimmed CI installer step in a throwaway `$HOME`
