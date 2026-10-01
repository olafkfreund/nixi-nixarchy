---
status: approved
issue: 27
author: olafkfreund
---

# Intent: Mechanic stops asking before read-only lookups

## Problem

On razer on 2026-09-21, Mechanic with Claude was asked to add one key
binding. Before the edit it raised five or six **Permission required**
prompts, each for a read-only `grep`, `ls` or file Read. Every one had to be
clicked through, so by the time the real write came, clicking **Allow** was a
reflex.

Mechanic's promise is that every *change* needs your yes. Asking about
lookups too weakens that promise. The prompt that matters looks the same as
five that do not, so people stop reading it. #21 made the prompt show the
whole command, which is only worth something if people still read it.

The cause is the mode mapping in `bridge/trust-policy.js`. Mechanic maps
Claude to `default`, which asks before every tool call it does not already
trust. The bridge then shows every request (`requestPermission` in
`bridge/bridge.js`). OpenCode does not have this problem: Nixi's
`OPENCODE_PERMISSIONS` already allows `read`, `grep`, `glob` and `list`
without asking. Codex has not been measured.

ACP tags every tool call with a `kind` (`read`, `search`, `edit`, `delete`,
`move`, `execute`, `fetch`, `think`, `switch_mode`, `other`). The bridge
receives it and uses it only to build the prompt's detail.

## Proposed outcome

- In Mechanic, a request that only reads or searches the machine runs
  without a prompt. The card still records that it ran, as a status line,
  the way YOLO does today.
- Every request that can change something is still shown and still needs an
  explicit yes: edits, deletes, moves, and any shell command not known to be
  read-only.
- Adding a key binding in Mechanic with Claude brings up one prompt, for the
  edit, instead of five or six.
- Guide and YOLO behave exactly as they do today.

## Affected users and systems

- Mechanic users with any agent. Mainly Claude. Codex needs measuring.
  OpenCode already behaves this way.
- `bridge/bridge.js` (`requestPermission`), `bridge/trust-policy.js`, their
  tests, and the Mechanic description in `README.md` and `docs/index.html`.

## Constraints

- **Nothing that can change the machine runs without a yes.** When in doubt,
  ask. A missing or unknown `kind` asks.
- **Reading secrets still asks.** A read that is only a lookup can still show
  the agent `~/.ssh`, `.env` files, or 1Password or agenix material. It must
  not stop asking for those. OpenCode's rules already ask for `*.env`.
- **Guide is untouched.** It keeps cancelling every request. Nothing is
  auto-allowed from Guide.
- Tested on a real desktop through the card, as #19–#21 were.

## Open questions

1. **Can the agent's own `kind` be trusted?** The agent labels its own tool
   calls. A mislabelled or compromised adapter could call a write a `read`.
   Options: trust `kind` alone; trust it only for tools already known to be
   read-only (Claude's `Read`, `Grep`, `Glob`, `LS`); or skip `kind` and use
   Claude's own permission settings instead, allowing those tools there the
   way Nixi already does for OpenCode.
2. **Read-only shell commands.** Should a shell `grep`, `ls` or `cat`
   (`kind: execute`) also skip the prompt? The safe answer is no, because
   pipes, `>` and `$(…)` can turn any command into a write. That leaves some
   prompts in place.
3. **`fetch`.** A web fetch changes nothing locally, but it sends data off
   the machine. Should it ask?
4. **A setting?** Should people who want the old behaviour be able to turn
   it back on ("ask for everything"), or is one behaviour enough?
