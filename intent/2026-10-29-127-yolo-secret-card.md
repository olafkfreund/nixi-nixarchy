---
status: draft
issue: 127
author: olafkfreund
---

# Intent: YOLO still asks before touching a secret

## Problem

YOLO answers every permission request "allow once" by itself. That includes a request
to read a secret or run a command that names one. Measured on p620 (2026-10-29): Claude
resolved a symlink to a canary `.age` file, matched nixi's secret rule and asked. YOLO
approved, and the canary was printed.

The README promises secrets "still ask, in both levels". SECURITY.md puts what an agent
does in YOLO out of scope, so today the promise quietly doesn't hold in YOLO. The user
decided (2026-10-29): **YOLO should show a card for secrets.**

## Proposed outcome

- In YOLO, any request that touches a secret path shows the approval card instead of being
  auto-approved. Everything else in YOLO is unchanged.
- At Guide such requests are still cancelled. At Mechanic they still show a card.
- README and SECURITY.md state it.

## Affected users and systems

- YOLO users of Claude and OpenCode. Codex can't be fenced from paths (#97), so it's
  unchanged.
- `bridge/bridge.js` (`requestPermission`'s YOLO branch), maybe `bridge/trust-policy.js`,
  tests, README, SECURITY.md.

## Constraints

- No widening. Herdr writes already skip YOLO (#95); secrets follow the same shape.
- The bridge must recognise a secret request from what it receives: Claude's request, a
  shell command's text, or an OpenCode read the bridge already resolves (#118).

## Open questions

- How does the bridge tell that a Claude request is a secret one? The request doesn't say
  which rule matched. The spec decides between matching the request's paths and command
  against `SECRET_PATHS` in the bridge, and other options.
