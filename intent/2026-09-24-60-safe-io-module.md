---
status: approved
issue: 60
author: olafkfreund
---

# Intent: one home for the safe-IO helpers

## Problem

`install.py`, `bin/nixi-watch` and `bin/nixi-update-manual` each carry a
byte-identical copy of the same five safe-IO helpers — `_UID`, `_HOME`,
`_group_exclusive`, `_dir_ok`, `_dirfd` — and two of them carry the same atomic
replace-by-rename writer (`install.py:_write`, `bin/nixi-watch:secure_write`).
`diff` over the three ranges is empty.

This is the most heavily audited code in the repository. A marketplace security
review tried to break it and could not: every path component under `$HOME` is
opened `O_NOFOLLOW|O_DIRECTORY` and validated for owner and mode, group-writable
is accepted only when the group is provably the user's alone, replacements go
through an `O_EXCL` temp file and a `renameat` against a retained parent
directory fd.

Three copies of audited code is a liability, not redundancy. The next fix to the
component walk lands in one copy and silently rots in the other two, and no
reviewer of that one-file diff would notice. Nothing in the repository stops a
fourth copy appearing.

## Proposed outcome

- The five helpers and the atomic writer exist in exactly one file.
- `install.py`, `bin/nixi-watch` and `bin/nixi-update-manual` import them.
- Byte-for-byte identical security semantics: same syscalls, same flags, same
  order, same refusals. No behaviour change of any kind.
- `tools/test_nixi.py` fails if the helpers are ever defined in more than one
  place, so re-triplication cannot pass CI.
- Both install paths place the module: `install.py` into `~/.local/bin`, and
  `nix/package.nix` into the store `bin/`, with the Nix build asserting it.

## Affected users and systems

Nixi users on either install path. The imperative path (`install.py` writing
into `~/.local/bin`) and the declarative path (`nix/package.nix` →
`home.packages`, plus the `nixi-watch` and `nixi-update-manual` systemd user
services that run the store copies by absolute path).

## Constraints

- **The security semantics must not change at all.** This is a move, not a
  rewrite and not an improvement. A real bug found on the way is reported, not
  fixed inside the refactor — a behaviour change hidden in a dedup commit is
  exactly what nobody can review.
- Stdlib only; no new runtime dependency.
- `bin/nixi-watch`, `bin/nixi-update-manual` and `bin/nixi-context` have no
  `.py` suffix and are installed to two different directories. The shared module
  must be importable from both, and from a plain checkout.
- `tools/test_nixi.py` loads these scripts by path via
  `importlib.machinery.SourceFileLoader`; that must keep working.
- `CONTRIBUTING.md`'s two-install-paths rule: a file added to one path is added
  to the other, and the matching CI job is extended to check it.
- CI's `ruff check --select=F,B,E9,E71,E72` over `install.py`, `tools/` and
  `bin/*` copied to `.py` must stay clean — including the imports each script no
  longer needs once the helpers leave.

## Open questions

None. The one real decision — how a suffix-less program in two different
directories imports a shared module without a packaging dependency — is a design
question and belongs in the spec.
