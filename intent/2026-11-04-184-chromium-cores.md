---
status: draft
issue: 184
author: olafkfreund
---

# Intent: test browsers stop dumping core

## Problem

Six page tests in olafkfreund/nixoarchy-snowflake start
`chromium --headless=new` and stop it with `terminate()`:
- `test_accessories_fit`
- `test_caption_fit`
- `test_mirror_fit`
- `test_stages_fit`
- `test_token_fit`
- `test_weather_fit`

On SIGTERM, Chromium trips an internal check and aborts (SIGABRT). So every
full test run leaves several 2.4 MB core dumps (12 in three hours on p620,
2026-11-04), and the desktop shows a "Process crashed: chromium"
notification for each. The tests pass. The crashes are noise, but they look
like real failures to the user and fill coredump storage.

## Proposed outcome

- A test run leaves no Chromium core dumps and no crash notifications.
- The tests still pass and still clean up their browsers: no Chromium left
  running after the suite.
- A browser that really crashes during a test still fails that test, as
  today.

## Affected users and systems

- olafkfreund/nixoarchy-snowflake `tests/`: the six harnesses above, and
  #178's new `test_character_fit` if it lands with the same pattern.
- Anyone who runs the suite. On p620 that's the agents, several times a day.
- No change to the app or its package.

## Constraints

- Tests only: no change under `app/`.
- Don't hide crashes outside the tests (no system or user-wide coredump
  setting).
- Keep the change small: one shared helper beats six copies, if the
  harnesses can share it.

## Open questions

1. **How?** Recommended: close the browser over CDP (`Browser.close`), which
   is a clean exit, and wait briefly. Only if it's still running, terminate
   it, with core dumps off for that one process (`RLIMIT_CORE=0` in the
   `Popen` `preexec_fn`). The other options are `RLIMIT_CORE=0` alone, which
   is smaller but still kills Chromium mid-flight, or `Browser.close` alone,
   which can leave the dump if the close hangs.
2. **A shared helper?** Recommended: yes. `tests/_browser.py` with
   `start_browser()` and `stop_browser()`, used by all six harnesses (and
   #178's), because the start and stop code is copied in each today.
