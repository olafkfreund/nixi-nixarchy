---
status: approved
issue: 55
spec: spec/2026-09-24-55-enable-card-robustness.md
---

# Plan: An opt-in convenience must never cost someone their rebuild

Approved decisions, carried over so this file stands alone:

- **Outer guard**, not just the one missing `try`. No failure of this script may
  reach the rebuild.
- **The marker records the handled ids.** Migration falls out of idempotency: an
  old prose marker does not parse, so it compares unequal and triggers exactly
  one harmless re-run.
- **One backup**, written only if absent, so it holds the pre-Nixi bytes.
- **Re-stat, not `flock`** -- a blocked activation is worse than a skipped
  opt-in write.
- **Activation output only**; no notification.

## Steps

1. `nix/enable-card.py:110-111`: wrap the defaults-copy `json.load` in
   `except (OSError, ValueError)`, printing and returning 0, matching `:97-104`.
   -> verify by the malformed-defaults test in step 7.

2. `nix/enable-card.py`, `main()`: rename the existing body to `_main(argv)` and
   add a `main(argv)` that calls it inside
   `try/except Exception as error: print("nixi: could not enable the card (%s); enable Nixi in Setup > Plugins" % error); return 0`.
   The exception text is printed, never swallowed silently.
   -> verify by `grep -c "except Exception" nix/enable-card.py` == 1 and step 7.

3. `nix/enable-card.py:90`: replace `if os.path.exists(marker): return 0` with a
   read of the marker into a set of ids, compared against the requested set
   (`card` plus `button` when non-empty). Return 0 only when they match.
   A marker that does not parse as ids compares unequal, which is the migration.
   -> verify by the button-after-card test in step 7.

4. `nix/enable-card.py:125-128`: write the marker as the sorted requested ids,
   one per line, replacing the prose string.
   -> verify by reading the marker in the test.

5. `nix/enable-card.py:119-120`: before the first `atomic_write`, copy the
   original bytes to `shell_json + ".bak-nixi"` **only if that path does not
   already exist**. Use the bytes read at `:98`, not a re-read.
   -> verify by the backup-content test in step 7.

6. `nix/enable-card.py`: capture `st_mtime_ns` and `st_size` when the existing
   `shell.json` is read; re-stat immediately before `atomic_write` and skip with
   a message if either differs.
   -> verify by the mtime test in step 7.

7. `tools/test_nixi.py`: extend the existing card-enable coverage with:
   - malformed defaults file -> returns 0, does not raise, `shell.json` absent
   - card-only marker, then card+button requested -> button enabled
   - old prose marker -> exactly one re-run, idempotent, no write
   - identical second run -> no write, no second backup
   - `shell.json.bak-nixi` holds the ORIGINAL bytes
   - mtime changed between read and replace -> write skipped
   -> verify by `python3 tools/test_nixi.py`.

## Tests

```bash
python3 tools/test_nixi.py          # expect: all checks passed
nix flake check --print-build-logs  # checks.hm-module-eval + checks.selfcheck
node --test bridge/*.test.js        # regression guard; untouched by this change
```

Runtime, on a live machine:

1. `services.nixi.barWidget.enable = false`, rebuild; then `= true`, rebuild.
   The button must appear. Before this change it does not.
2. Point the defaults argument at a truncated JSON file and rebuild.
   `home-manager switch` must succeed with a message. Before this change the
   whole activation fails.

## Rollback

`git revert` the implementation commit. Two tails to know about:

- **The marker format changes.** After a revert, a marker containing ids is read
  by the old code as "exists, therefore done", which is the old behaviour --
  harmless, and the card stays enabled. Nothing to clean up.
- **`shell.json.bak-nixi` survives a revert.** It is inert; delete it by hand if
  unwanted.
- If only the mtime check proves troublesome (a false skip on a busy machine),
  revert step 6 alone; steps 1-5 are independent and carry the user-facing fixes.
