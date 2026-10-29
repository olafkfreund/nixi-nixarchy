---
status: approved
issue: 128
author: olafkfreund
---

# Intent: sops-nix user secrets are fenced too

## Problem

sops-nix puts secrets marked `neededForUsers` in `/run/secrets-for-users`, a symlink to
`/run/secrets-for-users.d`. nixi's `SECRET_PATHS` (`bridge/trust-policy.js`) covers
`/run/secrets` and `/run/secrets.d`, and agenix's two paths, but not these. So an agent can
read them like any file at every trust level. Found in the #118 review.

## Proposed outcome

- Both paths are secret paths: reads ask (Claude) or are refused (OpenCode), and shell
  commands naming them ask, exactly like `/run/secrets`.

## Affected users and systems

- Hosts using sops-nix with `neededForUsers`. `bridge/trust-policy.js` and its tests.

## Constraints

- Same shape as #102's agenix.d addition: the link and its target both, because Claude and
  OpenCode match the literal path (or the resolved one, for #118's OpenCode gate).

## Open questions

None.
