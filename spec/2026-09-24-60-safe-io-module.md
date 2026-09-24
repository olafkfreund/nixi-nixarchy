---
status: approved
issue: 60
intent: intent/2026-09-24-60-safe-io-module.md
---

# Spec: one home for the safe-IO helpers

## Design

A new stdlib-only module, **`bin/nixi_safeio.py`**, holding exactly the code that
is duplicated today and nothing else:

| name | today |
| --- | --- |
| `_UID`, `_HOME` | identical in all three files |
| `_group_exclusive` | identical in all three files |
| `_dir_ok` | identical in all three files |
| `_dirfd` | identical in all three files |
| `_write` | `install.py:_write`; the body of `bin/nixi-watch:secure_write` |

The moved lines are moved, not retyped. `diff` over the five helper ranges in the
three files is empty today (verified), so the module is one of those copies and
the other two are deleted.

**Names keep their leading underscore and their signatures**, and each consumer
does `from nixi_safeio import ...` for the names it actually uses. Every existing
call site therefore stays byte-identical and the diff in the three consumers is
pure deletion plus one import line — the most reviewable shape available, which
is what matters for code whose whole value is that it was audited once. The
underscore now reads "internal to the safe-IO layer".

### Importable from both install paths

This is the only real design question. CPython puts the directory of the script
being run at `sys.path[0]`, **with symlinks resolved** (verified on the Python in
this tree, 3.14.7: a script reached through a symlink gets the symlink target's
directory). So if the module simply ships *beside* the programs in every layout,
`import nixi_safeio` needs no `sys.path` mutation and no packaging:

| layout | program | module beside it | placed by |
| --- | --- | --- | --- |
| checkout | `bin/nixi-watch` | `bin/nixi_safeio.py` | the repository |
| imperative | `~/.local/bin/nixi-watch` | `~/.local/bin/nixi_safeio.py` | `install.py` |
| declarative | `$out/bin/nixi-watch` | `$out/bin/nixi_safeio.py` | `nix/package.nix` |

The declarative path covers both ways those programs are started: the systemd
user services use `${nixiPkg}/bin/...` directly, and an interactive
`nixi-update-manual` comes through the profile symlink, which resolves to the
same `$out/bin`.

Two callers are not in a `bin/` directory and get one explicit line each:

- `install.py` (repo root, only ever run from the checkout) —
  `sys.path.insert(0, os.path.join(ROOT, "bin"))`, where `ROOT` is the existing
  `os.path.dirname(os.path.realpath(__file__))`. Because it derives from
  `__file__`, this also works when `tools/test_nixi.py` execs `install.py`
  through `SourceFileLoader`.
- `tools/test_nixi.py` — the same one line, so the `bin/*` programs it loads by
  path can resolve the module.

This adds **no attack surface**: `sys.path[0]` is already the program's own
directory today, and the module now sits in that same directory with exactly the
same trust as the program importing it. Anyone who can write
`~/.local/bin/nixi_safeio.py` can already rewrite `~/.local/bin/nixi-watch`.

### The one textual difference

`bin/nixi-watch:secure_write(name, data)` keeps its name and signature as a
six-line wrapper: open the `DATA` dirfd with `create=True`, call
`_write(dfd, name, data, 0o600)`, close it. The syscall sequence is unchanged.
The single observable difference in the whole change is that its
"refusing to replace non-regular file" `PermissionError` now carries the file
name, because `install.py`'s copy of the message did and that copy is the one
being kept. `save_state` swallows the exception either way.

### Imports the consumers no longer need

`grp` and `pwd` were imported inside `_group_exclusive` and leave with it.
`secrets` was used only by the moved writer in `install.py` and `bin/nixi-watch`
and is dropped from both; `bin/nixi-update-manual` keeps it (staging directory
names). All three keep `stat`, which their own remaining code uses. CI's
`ruff --select=F` is what proves this.

### Not touched

- `bin/nixi-update-manual:write_rel` is **not** the same writer. It is a plain
  `O_EXCL` create of a fresh file inside a staging directory that is later
  swapped in by `renameat` at directory level — no temp name, no rename, and it
  would be wrong to give it one. It stays where it is.
- `bin/nixi-watch:secure_read` and `install.py:_read_existing` are not
  duplicates either: the first validates a state file it owns (uid, `0o077`,
  size cap), the second reads a user's existing file for rollback. Both stay.
- `bin/nixi-context` does not use these helpers at all.
- No helper's body is edited. Nothing is renamed, generalised, hardened or
  tidied. If a real bug surfaces it is reported on the issue, not fixed here.

## Alternatives rejected

- **A `.py` suffix on the programs, or a real installed package.** Renaming the
  programs changes the user-visible command names and the systemd units; a
  package means a `site-packages` install and a packaging dependency for three
  stdlib scripts. Both are far more than the problem costs.
- **`importlib.util.spec_from_file_location` in each program** (four lines each,
  as `tools/test_nixi.py` does). Works, but it is three copies of new
  boilerplate to replace three copies of old code, and it hand-rolls what the
  interpreter already does for free.
- **`sys.path.insert(0, dirname(realpath(__file__)))` in each program.** The
  same directory the interpreter already put there — noise that reads as if it
  were load-bearing.
- **Module at the repo root instead of `bin/`.** Then `install.py` needs no
  line, but the programs stop working from a plain checkout, where their
  `sys.path[0]` is `bin/`. Beside the programs is the only location that is
  correct in all three layouts.
- **Shipping it as `nixi-safeio` (no suffix) beside the others.** Not importable
  without `importlib` gymnastics; the suffix is what makes the whole design free.
- **Merging `secure_read`/`_read_existing`, or `write_rel` into `_write`.** That
  is a rewrite of audited code disguised as deduplication. Refused.

## Risks

- **A layout where `sys.path[0]` is not the program's directory** would break the
  import at startup, loudly. `python3 -P`, `PYTHONSAFEPATH=1` or `-c` would do
  it; nothing in the repository, the units or the Nix build uses any of them.
  The Nix build gains an assertion that the module imports from `$out/bin`, and
  `tools/test_nixi.py` already loads and exercises the programs.
- **A stale copy left in `~/.local/bin` from an older install.** Not possible in
  this direction: the module is new, and `install.py --refresh` re-places core
  files, so an upgraded imperative install gets it before anything imports it.
- **Bytecode in the store.** Importing the module during
  `installCheckPhase` would drop `__pycache__` into `$out/bin`, which the
  existing check forbids. The new assertion runs `python3 -B`.
- Affects every host on either install path equally; there is no host-specific
  behaviour in this change.

## Verification

- `python3 tools/test_nixi.py` — passes, including a new
  `test_safeio_is_shared` asserting that each moved helper is defined in exactly
  one file in the repository, that the file is `bin/nixi_safeio.py`, that all
  three consumers import it rather than defining it, and — per the
  `CONTRIBUTING.md:52` two-paths rule, alongside the existing
  `test_unit_parity` — that both `install.py` and `nix/package.nix` place it.
- `nix flake check` — passes; `installCheckPhase` gains `nixi_safeio.py` in its
  `py_compile` list, a `test -s $out/bin/nixi_safeio.py`, and a real
  `python3 -B -c 'import nixi_safeio'` against `$out/bin`.
- `ruff check --select=F,B,E9,E71,E72` over `install.py`, `tools/` and `bin/*`
  copied to `.py`, exactly as CI does it — clean, which is also what proves the
  now-unused imports were removed.
- A direct read of the diff: every line the three consumers lose must appear
  unchanged in `bin/nixi_safeio.py`. `git show` of the moved ranges must diff
  empty against the deleted ranges.
