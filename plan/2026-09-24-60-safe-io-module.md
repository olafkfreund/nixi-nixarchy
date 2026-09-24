---
status: approved
issue: 60
spec: spec/2026-09-24-60-safe-io-module.md
---

# Plan: one home for the safe-IO helpers

## Approved decisions

- New module **`bin/nixi_safeio.py`**, stdlib only, holding exactly `_UID`,
  `_HOME`, `_group_exclusive`, `_dir_ok`, `_dirfd`, `_write` — moved verbatim
  from `install.py`, which is the copy that is kept. The other two copies are
  deleted. No body is edited, nothing is renamed or generalised.
- Names and signatures are unchanged, so every existing call site stays
  byte-identical; consumers do `from nixi_safeio import ...` for the names they
  use.
- Imports work because CPython puts the script's own directory (symlinks
  resolved) at `sys.path[0]`, and the module ships **beside** the programs in all
  three layouts: `bin/` in the checkout, `~/.local/bin/` via `install.py`,
  `$out/bin/` via `nix/package.nix`. The `bin/*` programs need no `sys.path`
  line. `install.py` and `tools/test_nixi.py` get one
  `sys.path.insert(0, os.path.join(ROOT, "bin"))` each.
- `bin/nixi-watch:secure_write` survives as a six-line wrapper (open `DATA`
  dirfd `create=True` → `_write(dfd, name, data, 0o600)` → close). Its only
  observable change is that the "refusing to replace non-regular file" message
  now carries the file name, because `install.py`'s message did.
- Left alone deliberately: `write_rel` (a fresh-file `O_EXCL` create in a
  staging directory, not an atomic replace), `secure_read`, `_read_existing`,
  `bin/nixi-context`.
- A real bug found on the way is reported on #60, never fixed in this change.

## Steps

1. `bin/nixi_safeio.py`: new file — module docstring saying what it is, why it is
   one file, and that it must sit beside the programs that import it; `import os`,
   `import stat`, `import secrets`; then `_UID`, `_HOME`, `_group_exclusive`,
   `_dir_ok`, `_dirfd`, `_write` copied out of `install.py` unmodified →
   verify by `diff` of the new file's helper ranges against the ranges about to
   be deleted from `install.py`: empty.
2. `install.py`: delete the six moved definitions; add
   `sys.path.insert(0, os.path.join(ROOT, "bin"))` after `ROOT` is computed, and
   `from nixi_safeio import _dirfd, _write` (plus any other moved name its
   remaining code references); drop the now-unused `import secrets` → verify by
   `python3 -c` import and `ruff --select=F`.
3. `bin/nixi-watch`: delete `_UID`, `_HOME`, `_group_exclusive`, `_dir_ok`,
   `_dirfd`; add `from nixi_safeio import _UID, _dirfd, _write` (`_UID` is used by
   `secure_read`); reduce `secure_write` to the wrapper; drop `import secrets` →
   verify by `ruff --select=F` and the test suite.
4. `bin/nixi-update-manual`: delete the same five definitions; add
   `from nixi_safeio import _dirfd` (plus `_UID` if its remaining code uses it);
   keep `import secrets` and `import stat` → verify by `ruff --select=F` and
   `test_updater_precedence`.
5. `install.py`: place the module on the imperative path — add
   `nixi_safeio.py` to the core placement beside `nixi`, `nixi-context`,
   `nixi-update-manual`, at mode `0o644`, from `src("bin", "nixi_safeio.py")` →
   verify by the new parity assertion and a `--no-systemd` install into a temp
   `$HOME` if one is already exercised by the suite.
6. `nix/package.nix`: `install -Dm644 bin/nixi_safeio.py $out/bin/nixi_safeio.py`
   in `installPhase`; in `installCheckPhase` add it to the `py_compile` list, add
   `test -s $out/bin/nixi_safeio.py`, and assert it really imports from there
   with `python3 -B -c 'import sys; sys.path.insert(0, "'"$out"'/bin"); import
   nixi_safeio'` (`-B` so no `__pycache__` lands in the store, which the existing
   bytecode check forbids) → verify by `nix flake check`.
7. `tools/test_nixi.py`: add the one `sys.path` line, and
   `test_safeio_is_shared` — scan `install.py` and `bin/*` for `def
   _group_exclusive`, `def _dir_ok`, `def _dirfd`, `def _write` and `_UID =`,
   assert each is defined exactly once and only in `bin/nixi_safeio.py`, assert
   the three consumers each import from `nixi_safeio`, and assert both
   `install.py` and `nix/package.nix` mention `nixi_safeio.py` (the
   `CONTRIBUTING.md:52` two-paths rule, as `test_unit_parity` does for units) →
   verify by running the suite, and by confirming the new test fails when a
   helper is pasted back into `bin/nixi-watch`.

## Deviations found while implementing

Both recorded here in the same commit as the code, per the workflow.

1. **`tools/test_nixi.py:load()` has to drop the cached module** (step 7).
   `_HOME` is computed once, at import. While every program carried its own copy,
   `load()` re-executing a program recomputed it, which is how
   `test_menu_icon_migration` installs into a fake `$HOME`. With one shared
   module, `sys.modules` caches the first `$HOME` and that test failed with
   `PermissionError: outside $HOME`. `load()` now does
   `sys.modules.pop("nixi_safeio", None)`, so a loaded program re-imports the
   module and re-anchors exactly as before. This is a test-harness artefact of
   module caching, not a behaviour change: each program is its own process in
   production, where `_HOME` is computed once either way.

2. **CI's ruff step had to be extended** (step 6). It copies the suffix-less
   `bin/*` programs to a temp directory and lints that plus `install.py` and
   `tools/` — so `bin/nixi_safeio.py`, which already has a suffix and stays in
   `bin/`, would have been the one Python file in the repository nothing linted.
   `bin/nixi_safeio.py` is now on that command line, which `CONTRIBUTING.md`'s
   "extend the matching CI job" rule asks for anyway.

Observed, reported on #60, deliberately **not** fixed here: `_write` passes its
`mode` to `os.open`, so the mode is masked by the caller's umask — under
`umask 077` a file asked for as `0o644` lands as `0o600`. This is pre-existing
and applies to every file `install.py` has ever placed (verified on `master`:
`nixi` lands `0o700` under that umask), the error is in the safe direction, and
owner access is all these files need. Not a bug, and not this change's business.

## Tests

```
python3 tools/test_nixi.py                     # all tests pass, incl. test_safeio_is_shared
ruff check --select=F,B,E9,E71,E72 install.py tools/ <bin/* copied to .py>
nix flake check                                # installCheckPhase asserts the module
```

Expected: all three clean. Plus the negative check — paste `_dir_ok` back into
`bin/nixi-watch` and `test_safeio_is_shared` must fail; then revert it.

## Rollback

`git revert` the implementation commit. The change is additive on both install
paths (a new file beside existing ones) and touches no state, no unit and no
user data, so a revert needs nothing else. An imperative install that already
received `nixi_safeio.py` keeps a harmless orphan file in `~/.local/bin` until
the next `install.py --refresh`.
