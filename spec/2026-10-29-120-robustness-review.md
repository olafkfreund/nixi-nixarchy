---
status: draft
issue: 120
intent: intent/2026-10-29-120-robustness-review.md
---

# Spec: three small robustness fixes from the review

## Design

1. **Stale lock takeover** (`bridge/always.js:72-77`). After `rename(lock, aside)`
   succeeds, `stat(aside)`. If its age is now 10 s or less, the rename took a fresh
   lock that someone created after this process's `stat`. Then `rename(aside, lock)`
   puts it back, and the loop retries. Only a confirmed-stale aside is removed.
   - The put-back can fail if yet another process created `lock` in between. Then
     the change fails with "locked by another nixi", and the aside is left for its
     owner's release to tidy up.
   - Release (`rm(lock)` in `finally`) is unchanged.
   - Residual: the microseconds between `rename` and the put-back. Documented in the
     comment.
2. **Aborted search** (`bridge/files.js:185-220`). In `fallbackFiles`, after the
   `plocate` calls and before each `fd` scan, `if (signal?.aborted)` return the empty
   result (`{ rows: [], totalMatched: 0, capped: false, complete: false }`). The
   caller already drops results for an older request id.
3. **Panel notice leak** (`Conversation.qml:1251`). The quiet regex also swallows
   `^No remembered approval `, so it becomes
   `/^(Remembered for |Nothing remembered for |No remembered approval )/`. Any other
   notice still shows (#114).

## Alternatives rejected

- **Owner tokens in the lock directory:** they move the race to the token read and
  release, at more code. A pid liveness check doesn't fit: the 10 s age rule already
  treats a dead owner as stale.
- **flock(2):** Node has no binding, and a native module is a new dependency.

## Risks

- None beyond the documented residual for 1. Item 2 only returns earlier. Item 3
  only hides one more panel notice while quiet.

## Verification

- `always.test.js`: a lock that becomes fresh between the stat and the rename is put
  back and not removed. Simulate by stubbing `stat` to return old then new, or with a
  test seam.
- `files.test.js`: an aborted signal before the `fd` scan returns no rows and runs no
  `fd`.
- QML: read the one-line diff (there's no QML test harness).
- `node --test` green; `nix flake check`.
