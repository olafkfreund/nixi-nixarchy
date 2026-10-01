---
status: approved
issue: 55
author: olafkfreund
---

# Intent: An opt-in convenience must never cost someone their rebuild

## Problem

`nix/enable-card.py` runs during Home Manager activation to switch Nixi's card
on once. It is a convenience: it exists so a newly installed plugin is actually
visible, because the shell accepts a toggle for a disabled plugin and silently
does nothing (nixarchy#709). Four defects, and the first two are the ones a user
meets.

**An unguarded parse can fail the entire `home-manager switch`.** The
defaults-copy path at `:110` calls `json.load` with nothing around it, while the
user-file path immediately above at `:97-104` carefully catches `OSError` and
`ValueError` and returns 0 with a message. So a truncated or version-skewed
`/run/current-system/sw/share/omarchy/config/omarchy/shell.json` -- a file the
user does not own and did not edit -- raises out of the activation script and
takes the whole rebuild down at `nixiEnableCard`.

That is the wrong trade by a wide margin. Losing a rebuild is expensive and
confusing; not auto-enabling a card is a minor inconvenience with a one-line
manual fix that the script already knows how to print.

**`barWidget.enable` only works the first time.** The marker is checked at `:90`
before any comparison of which ids were requested, and written on the first
successful pass regardless. Its path (`hm-module.nix:196`) carries no ids. So a
user who first rebuilt with `barWidget.enable = false` and later sets it to
`true` gets nothing: no button, no message, nothing in the journal. The option
silently does not work for exactly the people who did not want it initially.

**`shell.json` is rewritten with no backup**, while `install.py` backs up the
less valuable `omarchy-menu.jsonc` before touching it. The write is atomic so it
cannot half-land, but it reflows the file and drops key order with no prior copy
to compare against.

**The read-modify-write is unlocked** against a file the running shell watches
(`FileView watchChanges`, per the script's own docstring at `:19-20`) and Setup >
Plugins writes. The window is narrow and is precisely the one this feature runs
in: first activation on a live desktop.

## Proposed outcome

- A malformed file that the user does not control cannot fail their rebuild.
  Worst case, the card is not auto-enabled and the script says so.
- `services.nixi.barWidget.enable` takes effect whenever it changes, not only on
  a machine that had it set the first time.
- A user whose `shell.json` was rewritten can see what it looked like before.
- A plugin toggled in Setup during an activation is not silently discarded.

## Affected users and systems

- Every Home Manager user, on every `home-manager switch` -- this runs on all of
  them.
- Most sharply: anyone whose Omarchy defaults file is mid-upgrade or truncated,
  who currently loses the whole rebuild for an opt-in feature.
- `nix/enable-card.py` and the marker path in `nix/hm-module.nix:191-201`.

## Constraints

- Must stay stdlib-only; this runs inside activation with no package set.
- Must not turn a silent failure into a noisy one that fires on every rebuild.
  The script already prints actionable messages and should keep that tone.
- Must not write `shell.json` when it has not changed -- activation runs often
  and a no-op rebuild should touch nothing.
- Must not weaken the existing safety: the symlink refusal at `:94`, the
  version-1 check, and the atomic write all stay.
- Changing the marker scheme has to handle machines that already carry the old
  marker, or the fix silently does nothing for exactly the users who hit the bug.

## Open questions

1. What does the new marker key on -- the set of ids, a hash of them, or a small
   JSON file recording what was handled? A file is more debuggable and more to
   go wrong; a suffixed path is cruder and obvious.
2. What happens to the existing `enabled-once` marker on machines that have it?
   Treating its presence as "card handled, button not" is probably right, but it
   is a migration decision and should be deliberate.
3. Is a backup wanted at all, or is it clutter? `install.py` sets the precedent,
   but a `.bak-nixi` beside a config the user may never have looked at could be
   noise. If yes: once, or every time it changes?
4. Lock or mtime recheck? `flock` is stronger and adds a failure mode of its own
   inside activation; re-stat-and-bail is weaker and cannot deadlock.
5. Should a failure to enable be visible anywhere other than activation output,
   which scrolls past? A notification would be seen, and would also be the kind
   of noise constraint two warns against.
