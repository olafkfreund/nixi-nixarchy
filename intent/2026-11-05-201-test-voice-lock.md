---
status: approved
issue: 201
author: olafkfreund
---

# Intent: Nixi's tests stay off the live desktop's runtime folder

## Problem

The tests start real Nixi servers with a throwaway `HOME`, so they can't touch the user's config. But they keep the
real `XDG_RUNTIME_DIR`, or fall back to `/run/user/<uid>` if it's unset, and `app/server.py` and `app/floor.py` use that folder to find live things:

| In `XDG_RUNTIME_DIR` | Used for |
| ---- | ---- |
| `nixarchy-voice-floor.lock` | The voice lock shared with the live Nixi and other voices |
| `nixi-companion-<uid>.sock` | The live Nixi window; `open_in_nixi` sends it `aside:on` when Hyprland isn't in the environment |
| `omarchy-shell-<hash>.sock` | The live desktop shell |
| `hypr/` | The live Hyprland instance |
| `ai-mirror/` | The live desktop-control state, read when `ai-mirror` is installed |

Effects:

- **Seen:** parallel page tests queue on the one voice lock and fail. `test_agent_voice_fit` went from mostly
  failing to 8 of 8 passing, over repeated rounds, once it was isolated (nixoarchy-snowflake #54).
- **From reading the code, not observed:** a test server could keep the live Nixi or another voice waiting, or send
  messages to the live window, shell or Hyprland.

Nine more page tests have the same setup: accessories, mirror, stages, settings, caption, weather, character, token and
voice. The shared `_ServerEnv`, used by about 30 test files, keeps the real folder as well.
This repeats the kind of mistake #176 made with `HOME`, where tests overwrote the user's real config.

## Proposed outcome

- A test server or `_ServerEnv` test can't reach the live voice lock, window, shell, Hyprland or ai-mirror state, because it
  has its own throwaway runtime folder that exists for the whole run. A test may put things in it. It's always set,
  never left unset, so nothing falls back to `/run/user/<uid>`.
- A guard fails loudly if the voice lock's path is outside the throwaway folder, as `_ServerEnv` already does for `HOME`.
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
   partial fix leaves the same trap. The spec must handle `_ServerEnv` importing `server` once: the lock's path is
   fixed then, and the folder has to outlive the first test class.
2. **Should the suite also fail if a test touches the live folder?** Recommended: only the import guard above. Watching
   the folder during a run would flag other programs on the desktop.

## Approval (2026-11-05)

Approved by the user, with the recommended answers to both open questions.
