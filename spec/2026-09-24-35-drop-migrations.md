---
status: approved
issue: 35
intent: intent/2026-09-24-35-drop-migrations.md
---

# Spec: drop the 0.9.x / pre-rebrand migration cluster

## Design

Pure deletion, in five files. Nothing is rewritten, renamed or generalised.

**Two items from the review's list are excluded and stay in the tree.** See
"Excluded from this deletion" below for the tag evidence; it is there so nobody
deletes them again next quarter.

### 1. `install.py`

- Delete `OLD_FILES` and `remove_old_widget()`.
- Delete the `remove_old_widget(j, svc)` call from `install_core()`.
- `merge_menu()` is **not** touched: its menu-icon migration is excluded (below).
  Its in-code comment gains five lines carrying the tag evidence, so the next
  reader cannot mistake it for 0.9.x-era code.

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

Delete `test_old_plugin_dir_migration` only. `test_old_widget_stays_gone` and
`test_menu_icon_migration` are excluded (below). The runner iterates `globals()`
for `test_*`, so nothing else needs editing.

`test_old_widget_stays_gone` is edited rather than deleted, in two ways that make
it **stricter**:

- the `ui\.html` alternative leaves its pattern, because this change removes the
  last code that was allowed to name it;
- `allowed` loses `".github/workflows/ci.yml"`, `"nix/package.nix"` and
  `"install.py"`, whose only reason to be exempt was `ui.html`. It keeps
  `docs/FORK.md`, `intent/`, `spec/`, `plan/` (prose) and `tools/test_nixi.py`
  (which contains the pattern literal). Verified: with the exemptions dropped the
  test still passes, and planting `8642` in `README.md` still fails it.

Module-level imports keep their readers either way. Left alone.

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

## Excluded from this deletion

Both were on the review's list. Both were investigated, found misclassified, and
kept. **Neither is 0.9.x-era upgrade code.**

### `merge_menu()`'s menu-icon migration — a post-release migration, tag-verified

`git show v0.10.0:install.py` writes `\U000f0625` (help-circle). Sparkles landed
in `6d7a61b` on **2026-09-17**; `v0.10.0` was tagged **2026-09-15**. The glyph
therefore changed *two days after the only release Nixi has ever made*, and
`install.py` wrote help-circle continuously from `5be4010` (2026-09-02) until that
commit, so the write span contains the tag.

`merge_menu()` leaves an existing `"help"` entry alone by design — that is its
documented contract — so this branch is the **only** thing that would ever replace
the glyph on a machine that already has the entry. Deleting it ships a permanent
question-mark icon to exactly the users who followed the documented install path.

It is a *post*-release migration that happened to live next to the pre-release
ones. The review's "never shipped under a tag" premise is not merely weak for
this item; it is **false**. The same three sentences are now a comment in
`install.py` beside the branch, because a spec nobody opens does not stop the next
deletion.

`test_menu_icon_migration` is its test and stays with it. No CI step exercised the
migration directly — verified, `ci.yml` never names the glyph — so the test is the
whole of its coverage, which is a further reason not to drop it.

### `test_old_widget_stays_gone` — a dead-feature drift guard

Seven of its eight patterns (`/voice`, `/listen/`, `pw-record`, `whisper`,
`NIXI_WHISPER`, `8642`, `X-Nixi-Token`) have nothing to do with any migration:
they stop the removed browser-widget and voice feature returning, and this is one
of only **two** invariants of its class in the tree —
`spec/2026-09-24-56-drift-traps.md:55` cites it by name when rejecting a second CI
job as redundant. Only `ui\.html` was migration-related, and that one alternative
is dropped. The test is left stricter than it was.

## Alternatives rejected

**Delete the two items above as originally scoped.** Done first, deliberately,
and reported rather than silently re-scoped — which is what allowed the reasoning
to be checked before merge instead of a user finding the icon defect. Reverted on
review once both objections were independently verified against the tag.

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
Two risks that an earlier draft of this spec accepted are **no longer taken**:
`v0.10.0` machines still get the sparkles glyph, and the browser-widget/voice
drift guard still runs. Both items are excluded above.

## Verification

- `python3 tools/test_nixi.py`
- `nix flake check --print-build-logs`
- CI's exact ruff: `ruff check --select=F,B,E9,E71,E72` over a temp copy of
  `bin/nixi-watch`, `bin/nixi-update-manual`, `bin/nixi-context` plus
  `install.py tools/ bin/nixi_safeio.py`
- `shellcheck -S warning bin/nixi install.sh hooks/*.hook` and `actionlint`
- `grep` for every removed name across the tree: `OLD_FILES`,
  `remove_old_widget`, `migrate-plugin-dir`, `nixiOldPluginDir`,
  `test_old_plugin_dir_migration`, `nixi-server`, `ui.html`
- Mutation checks on both excluded guards: `8642` in `README.md` must fail
  `test_old_widget_stays_gone`, and neutering the glyph swap must fail
  `test_menu_icon_migration`
- A simulated run of the trimmed CI installer step in a throwaway `$HOME`
