---
status: approved
issue: 120
spec: spec/2026-10-29-120-robustness-review.md
coders:
  1: codex
  2: codex
reviewers:
  - agy
---

# Plan: three small robustness fixes from the review

## Approved decisions

- **Stale takeover:** after `rename(lock, aside)`, `stat(aside)`. If its age is 10 s
  or less, `rename(aside, lock)` back and retry. If the put-back fails, throw
  "locked by another nixi" and leave the aside. Only a confirmed-stale aside is
  removed. Document the residual microsecond window in the comment.
- **Aborted search:** in `fallbackFiles`, return the empty result if
  `signal?.aborted` after `plocate` and before each `fd` scan.
- **Notice:** the quiet regex also swallows `^No remembered approval `.

## Steps

1. **`bridge/always.js:72-77`** and **`bridge/files.js:185-220`.**
   - always.js: inside `if (age > 10000)`, after a successful rename:
     `const again = await stat(aside).then((s) => Date.now() - s.mtimeMs, () => Infinity);`
     If `again <= 10000`, then `if (!(await rename(aside, lock).then(() => true, () => false)))
     throw new Error(\`${path} is locked by another nixi\`)`, then `continue`. Otherwise
     `rm(aside)` as now. Update the comment above `locked`.
   - files.js: in `fallbackFiles`, after computing `located` and before
     `if (locatedPaths.length > 0)`, add `if (signal?.aborted) return { rows: [],
     totalMatched: 0, capped: false, complete: false };`. Do the same before each
     `await scan(...)`.

   Verify: `cd bridge && node --test`.
   Traps:
   - The `for (tries…)` loop counts every try (#114 review): the `continue` must still
     count.
   - Don't change release.
2. **Tests and QML.**
   - `bridge/always.test.js`: create a stale lock directory (mtime set 20 s back with
     `utimes`). Make the race deterministic with a small seam: export a test hook, or
     stub `fs/promises` `stat` via a module-level indirection (`const fsx = { stat,
     rename, … }` used inside `locked`, mutated by the test). Then assert a fresh lock
     at the put-back point survives and the change fails or retries rather than
     deleting it.
   - `bridge/files.test.js`: call `fallbackFiles`, exported if not already, with an
     already-aborted `AbortController` signal and a stub `fd`/`plocate` on PATH that
     records calls. Assert no `fd` call and empty rows.
   - `Conversation.qml:1251`: the regex becomes
     `/^(Remembered for |Nothing remembered for |No remembered approval )/`.

   Verify: `node --test` green; `nix flake check`.
   Traps: `Conversation.qml` is also edited by #119: change only line 1251.

## Deviations

- **Stale takeover, found independently by both the Opus and agy reviews:** "if the
  put-back fails, throw" can't happen in the race it was meant for. The lock is an empty
  directory, and Linux `rename(2)` replaces an empty directory (measured on ext4), so a
  third writer that takes the name in the gap is overwritten, not detected. Two writers can
  then hold the store at once, and if the owner finished in the gap, the put-back lock has
  no owner until it is 10 s old (it heals itself). Node has no rename-no-replace. The code
  stays (it still narrows the old race, which deleted a fresh lock outright), and the code
  comment states this residual instead of the spec's "fails this change". The throw stays
  for other rename errors.
- **The aborted-search test's "fd never ran" assertion is weak.** Node may spawn and kill
  a child even with an already-aborted signal. The test is still deterministic through its
  `deepEqual` on `complete: false`, which fails without the fix.

## Tests

- `cd bridge && node --test`; `nix flake check`.

## Rollback

Revert the merge commit.
