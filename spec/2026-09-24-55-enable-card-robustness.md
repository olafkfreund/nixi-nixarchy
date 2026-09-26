---
status: approved
issue: 55
intent: intent/2026-09-24-55-enable-card-robustness.md
---

# Spec: An opt-in convenience must never cost someone their rebuild

The intent left five open questions. Each is answered below with the reasoning,
so the approver can overturn a decision rather than re-derive it.

## Design

### 1. Never raise out of activation

Wrap the defaults-copy parse at `:110` in the same
`except (OSError, ValueError)` the user-file path already uses at `:97-104`, and
return 0 with a message naming the file and the manual fix.

Then make that structural rather than positional: wrap `main()`'s body so **any**
unexpected exception prints and returns 0. The specific `try` fixes the one path
known to be missing it; the outer guard fixes the class, and the class is what
matters here -- this script's entire job is opt-in convenience, and there is no
failure of it that justifies taking down a rebuild.

`atomic_write` keeps raising internally; it is already wrapped by its own
cleanup and the outer guard converts a failure to "card not enabled" rather
than "rebuild failed".

### 2. The marker records what it handled

Today the marker is prose (`"enabled once; delete to let nixi enable the card
again"`) and is checked before the requested ids are looked at, so
`barWidget.enable` is one-shot.

The marker becomes the sorted list of ids handled, one per line. The script
re-runs whenever the requested set differs from the recorded set.

**Migration comes free.** An existing marker does not parse as an id list, so it
compares unequal to any request and the script runs once more. That is safe
because `enable()` is idempotent -- it returns `changed = False` when an id is
already enabled -- so a machine whose card and button are both on writes nothing
and simply records the ids. No migration branch, no version field.

### 3. One backup, not one per rebuild

Write `shell.json.bak-nixi` from the original bytes before the first
`atomic_write`, **only if it does not already exist**.

Once, because the point is to preserve what the file looked like before Nixi
touched it. Rewriting it on every change would overwrite that with a copy Nixi
itself produced, which is the one version the user can already reconstruct.

Matching `install.py:401,410`, which does the same for the less valuable
`omarchy-menu.jsonc`.

### 4. Re-stat, do not lock

Record `st_mtime_ns` and `st_size` at read, re-stat immediately before
`os.replace`, and skip the write with a message if either changed.

`flock` is stronger and wrong here: this runs inside Home Manager activation
against a file the running shell holds open with `FileView watchChanges`, and a
blocked activation is a worse failure than a skipped opt-in write. Bail-and-say
cannot deadlock, and the retry is the next rebuild.

### 5. Activation output only

No notification. The script already prints actionable lines and the constraint
against noise on every rebuild is the stronger one. The messages should name the
file and the one manual step (`Setup > Plugins`), which they already do.

## Alternatives rejected

**Guard only the one `json.load`.** Fixes the known instance, leaves the class.
The outer guard costs three lines and converts every future addition to this
script from "can fail a rebuild" to "can fail to enable a card".

**Version the marker (`v2:` prefix or JSON).** More to write and more to get
wrong, for a migration that idempotency already handles. Keeping the marker a
plain id list means the unparseable old one behaves correctly by accident *and*
by design.

**Drop the marker and rely on idempotency alone.** Tempting -- `enable()`
already no-ops when nothing changed. Rejected because the marker is what lets a
user turn the card **off** in Setup and have it stay off (nixarchy#709); without
it every rebuild would re-enable it.

**`flock`.** See 4.

**Back up on every change.** See 3.

## Risks

- **The re-run on an old marker touches machines that were working.** Mitigated
  by idempotency: `changed` is false, so no write, no backup, only the marker
  rewritten. Worth asserting in a test rather than assuming.
- **An outer catch can hide a real bug**, turning a broken script into a silently
  unhelpful one. Mitigated by printing the exception rather than swallowing it,
  so activation output still names the cause.
- **`shell.json.bak-nixi` may confuse** a user who finds it and does not know
  what wrote it. The filename carries `nixi`, which is the same convention
  `install.py` already set.
- **The mtime check narrows the race, it does not close it.** A write landing
  between re-stat and `os.replace` is still lost. Accepted: the window goes from
  the whole parse-and-edit to two syscalls, and the alternative deadlocks
  activation.
- Host-specific risk: none. No unit, no package, no runtime change.

## Verification

1. **Automated.** `nix flake check` -- `checks.hm-module-eval` builds the
   activation package, and `checks.selfcheck` runs `tools/test_nixi.py`, which
   already covers this script (`test_card_enabled_once`, `test_nixi_explains_a_card_that_is_off`).
2. **Automated, new cases in `tools/test_nixi.py`**, which already drives this
   script against temp dirs:
   - a malformed defaults file returns 0 and leaves `shell.json` absent
   - a malformed defaults file does **not** raise
   - requesting card+button after a card-only marker enables the button
   - an old prose marker triggers exactly one idempotent re-run
   - a second identical run writes nothing and creates no second backup
   - `shell.json.bak-nixi` holds the **original** bytes, not the rewritten ones
   - a changed mtime between read and replace skips the write
3. **Runtime.** On a live machine: set `barWidget.enable = false`, rebuild, set
   it `true`, rebuild -- the button must appear. Before this change it does not.
4. **Runtime, the headline.** Point the defaults argument at a truncated JSON
   file and rebuild. `home-manager switch` must succeed with a message. Before
   this change it fails the whole activation.
