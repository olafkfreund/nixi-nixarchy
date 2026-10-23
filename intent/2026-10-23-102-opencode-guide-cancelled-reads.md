---
status: draft
issue: 102
author: olafkfreund
---

# Intent: opencode at Guide answers instead of giving up, and keeps secrets out

## Problem

With **opencode** as nixi's agent, Guide is close to unusable, and its secret handling is
unknown:

- **A cancelled read ends the whole turn.** At Guide, any read outside opencode's directory
  (`~/.config/nixi`) asks permission. Even `/etc/hostname` does. Guide cancels every request (its
  guarantee), and opencode then ends the turn with `stopReason: "cancelled"` and **no answer**.
  Claude, in the same situation, carries on without the file and explains. (Measured 2026-10-23,
  opencode 2.0.32 via `opencode acp`, nixi's installed bridge.)
- **One variant never finished.** Through the companion, a Guide request to read a `~/.ssh`
  canary left the turn open with no `done`. The UI stayed busy until the turn was stopped by
  hand. Nothing in nixi times out a turn that stops producing events.
- **Secrets are only safe by accident.** `OPENCODE_PERMISSIONS` allows `read` for everything
  except `*.env`. There is no `.age` rule and no `SECRET_PATHS`. At Guide, reads outside the
  directory happen to be cancelled. At Mechanic, nobody has measured whether `~/.ssh` or `.age`
  files are read without a card.

Users who choose opencode in the card (SUPER+,) or the companion get Guide answers that just stop,
an occasional wedged card, and an unverified secret guarantee.

## Proposed outcome

- At **Guide**, opencode answers from what it may read (the manual, `KNOWLEDGE.md`, the files
  nixi allows). A denied read lets the turn continue to an answer, as with Claude, instead of
  ending it.
- **No wedged turns:** a turn that stops producing events gets a bounded, visible end (a
  message, and the card unlocks), for any agent.
- **Secrets with opencode:** at Guide a secret path is never read. At Mechanic reading one asks
  first, matching #96's guarantee for Claude, or the docs say exactly what opencode can't
  guarantee. Both are measured live with the canary method.
- Tests cover the rules nixi sends opencode and the turn timeout. The canary check goes into
  `docs/model-verification.md`.

## Affected users and systems

- nixi: `bridge/trust-policy.js` (`OPENCODE_PERMISSIONS`/`opencodePermissions`),
  `bridge/bridge.js` (permission answering and turn lifecycle), possibly `Conversation.qml` (a
  stalled-turn message), docs.
- Users who pick opencode as nixi's agent; everyone, for the stalled-turn guard.

## Constraints

- Guide's guarantee stays: nothing that needs a permission ever runs at Guide.
- Claude (#96) and Codex (#97) behaviour unchanged.
- No reliance on the model choosing not to read a secret.
- Measured, not assumed: opencode 2.0.32 as pinned. Every claim about its permission semantics
  gets a live check.

## Open questions

1. **How to let the turn continue:** answer a Guide request with opencode's *reject* option
   instead of ACP *cancelled*, if opencode continues after a reject; or allow in-scope reads
   (the manual's directory) so fewer requests happen at all? (The spec measures which opencode
   honours.)
2. **The stalled-turn guard:** what timeout (for example 120 s without any event), and should it
  apply to every agent (recommended) or only opencode?
3. **If opencode can't be made to keep secrets at Mechanic:** refuse opencode at Guide like Codex
   (#97), or allow it with a warning?
