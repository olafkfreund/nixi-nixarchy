---
status: draft
issue: 201
author: olafkfreund
---

# Intent: Nixi's tests stay off the live desktop's runtime folder

## Problem

The tests start real Nixi servers with a throwaway `HOME`, so they can't touch the user's config. But they keep the
real `XDG_RUNTIME_DIR`, and `app/server.py` and `app/floor.py` use that folder to find live things:

| In `XDG_RUNTIME_DIR` | Used for |
| ---- | ---- |
| `nixarchy-voice-floor.lock` | The voice lock shared with the live Nixi and other voices |
| `nixi-companion-<uid>.sock` | The live Nixi window; a server sends it `aside:on` when it has no layer events |
| `omarchy-shell-<hash>.sock` | The live desktop shell |
| `hypr/` | The live Hyprland instance |

Effects:

- **Seen:** parallel page tests queue on the one voice lock and fail. `test_agent_voice_fit` went from mostly
  failing to 8 of 8 passing, over repeated rounds, once it was isolated (nixoarchy-snowflake #54).
- **From reading the code, not observed:** a test server could keep the live Nixi or another voice waiting, or send
  messages to the live window, shell or Hyprland.

Seven more page tests have the same setup: accessories, mirror, stages, settings, caption, weather, character and token
start a server the same way, as does `test_voice_fit`. The shared `_ServerEnv` that about 40 unit test files use keeps it as well.
This repeats the kind of mistake #176 made with `HOME`, where tests overwrote the user's real config.

## Proposed outcome

- A test server or `_ServerEnv` test can't reach the live voice lock, window, shell or Hyprland, because it has its own
  empty runtime folder.
- A guard fails loudly if a server is imported under the real runtime folder, as `_ServerEnv` already does for `HOME`.
- The page tests stop queueing on each other: running several at once doesn't fail them through the voice lock.

## Affected users and systems

Fork `olafkfreund/nixoarchy-snowflake`, `tests/` only. Nothing in `app/` changes. Whoever runs the tests on a live
desktop, on p620 and razer.

## Constraints

- **Must:** the browsers the page tests start keep what they need to run, so only the server's environment changes.
- **Must:** tests that already set their own runtime folder, such as `test_floor_wiring` and `test_mirror`, keep working.
- **Must not:** change what any test checks.

## Open questions

1. **How much of the suite?** Recommended: every server start and `_ServerEnv`, through one small shared helper, since a
   partial fix leaves the same trap.
2. **Should the suite also fail if a test touches the live folder?** Recommended: only the import guard above. Watching
   the folder during a run would flag other programs on the desktop.
