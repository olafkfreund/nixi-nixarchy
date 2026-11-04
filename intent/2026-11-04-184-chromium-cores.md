---
status: draft
issue: 184
author: olafkfreund
---

# Intent: test browsers stop dumping core

## Problem

Six page tests in olafkfreund/nixoarchy-snowflake start
`chromium --headless=new` (`test_accessories_fit`, `test_caption_fit`,
`test_mirror_fit`, `test_stages_fit`, `test_token_fit`, `test_weather_fit`),
and so do some agents' own scripts. On p620, these browsers abort **at
startup**. Every recorded stack is `ChromeMain → ContentMainRunnerImpl::Initialize
→ ZygoteHostImpl::Init → sandbox::Credentials::CanCreateProcessInNewUserNS`,
then a CHECK, then `abort()`. Chromium can't create the user namespace its
sandbox needs, which is what happens when it's started inside an
already-sandboxed process: the agents run in herdr panes (`kitty-70310`),
and some of them (Codex, agy, Claude Code's sandboxed shell) restrict
namespaces.

Each abort leaves a 2.4 MB core (12 in three hours on 2026-11-04), and a
"Process crashed: chromium" notification. `kernel.core_pattern` pipes
cores to systemd-coredump, so `RLIMIT_CORE` doesn't stop them.

The first draft blamed `terminate()` on shutdown. The stacks show that's
wrong (Codex's review). Still open: whether a failed launch makes a test
fail, retry, or skip. The full suite passed with 11 skips, so some page
tests may silently not run when their browser can't start.

## Proposed outcome

- A test run that starts Chromium doesn't abort it, so there's no core
  dump and no crash notification.
- A page test whose browser can't start **says so**: it's a visible skip
  with the reason, or a failure, never a silent pass.
- No Chromium is left running after the suite.
- A browser that really crashes mid-test still fails that test.

## Affected users and systems

- olafkfreund/nixoarchy-snowflake `tests/`: the six harnesses above, and
  #178's new `test_character_fit` if it lands with the same pattern.
- Anyone who runs the suite. On p620 that's the agents, several times a day.
- No change to the app or its package.

## Constraints

- Tests only: no change under `app/`.
- Don't hide crashes outside the tests: no system or user-wide coredump
  setting.
- Chromium's sandbox is a security boundary. Turning it off
  (`--no-sandbox`) is only acceptable for test browsers that load the
  test's own local server, never in the app, and only when the sandbox
  can't start.
- Stdlib only, no new Python dependencies. Keep it small: one shared helper
  beats six copies.

## Open questions

1. **How do test browsers start where user namespaces are blocked?**
   Recommended: before launching, check once whether the sandbox can start
   (a probe run of `chromium --headless=new --version` style, or by checking
   `unshare -U true`). If it can't, add `--no-sandbox` for these local-only
   test browsers. Other options:
   - skip the page tests there, with a clear reason, which loses coverage
     in agent runs;
   - leave it, which keeps the noise.
2. **A shared helper?** Recommended: yes, `tests/_browser.py`, with
   `start_browser()` (the probe and the flags) and `stop_browser()`, used by
   all six harnesses and #178's. The details belong in the spec.
3. **Is the 11-skip count hiding page tests that never ran?** To be checked
   in the spec: the answer decides whether this is only noise, or lost test
   coverage too.
