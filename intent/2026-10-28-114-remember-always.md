---
status: approved
issue: 114
author: olafkfreund
---

# Intent: an "always" stays answered

## Problem

At Mechanic, nixi asks before a command runs. The card offers "always" so the user can stop
being asked about the same thing. In practice it is asked again:

- The voice companion's own "always" covers one exact command in one chat
  (`nixoarchy-snowflake` `app/server.py`, `Approvals.always`), and is cleared on any new chat,
  resume or folder change.
- In nixi mode, "always" goes through the bridge to the agent adapter as `allow_always`. The
  adapter keeps it for that agent session only.
- nixi mode starts a fresh session almost every turn, so the answer is gone by the next
  question.

The user's request (2026-10-28): once something is approved with "always", remember it and
don't ask again.

## Proposed outcome

- An "always" answer is remembered across chats, sessions and restarts, for exactly what was
  approved, and that thing isn't asked about again.
- The user can see everything nixi has been told "always" about, and take any of it back.
- What "always" can be given for stays as narrow as today:
  - never an edit, a herdr write or a chained command (#90, #95, S26);
  - never at Guide, where nothing is approved;
  - never by voice (click only).

## Affected users and systems

- Users of nixi's card and of the voice companion at Mechanic.
- Code: the nixi bridge (`bridge/bridge.js`, trust policy, settings), the companion
  (`Approvals`), and docs (README trust section, SECURITY.md).
- Agents: Claude, Codex, opencode, each with its own adapter and its own idea of "always".

## Constraints

- **This is a trust-model change.** Remembering a yes forever is a standing permission, so it
  must be exact (the whole command, never a prefix or first word), and visible.
- Guide's guarantee is unchanged: nothing that asks for permission ever runs at Guide.
- Secrets rules (#96, #97, #102) still win. A remembered yes never reaches a secret path.
- The store is the user's own file, written safely: the #103 write-race rules apply.
- No silent widening. A remembered yes from one agent or trust level doesn't quietly apply to
  another unless the spec decides so on purpose.

## Open questions

- **Scope.** Should a remembered yes be global, per project folder, or per agent? Per folder plus
  agent is the narrowest that still helps.
- **Lifetime.** Forever until revoked, or should it expire (e.g. 30 days)?
- **Who answers.** Should the bridge answer a remembered request itself and never show a card
  (consistent across agents), or keep forwarding `allow_always` to each adapter?
- **Where it's managed.** A list in nixi's settings, a `/always` command, the companion's
  settings, or all three?
