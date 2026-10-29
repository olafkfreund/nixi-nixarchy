---
status: approved
issue: 128
intent: intent/2026-10-29-128-secrets-for-users.md
---

# Spec: sops-nix user secrets are fenced too

## Design

Add `"/run/secrets-for-users/**"` and `"/run/secrets-for-users.d/**"` to `SECRET_PATHS`
in `bridge/trust-policy.js`, next to `/run/secrets.d/**`, with the same comment shape as
#102's agenix.d entry. Everything is generated from that list, so nothing else changes in
code:

- Claude's Read/Grep/Glob asks;
- OpenCode's read denies;
- #118's `isSecretPath`;
- #127's `touchesSecret`.

The shell rule `Bash(*/run/secrets*)` already matches `/run/secrets-for-users` as a
substring, so no new shell rule is needed.

## Alternatives rejected

- **A broader `/run/secrets*/**` glob:** Claude's glob `/run/secrets*/**` also matches
  unrelated names, and isn't the pattern style the list uses.

## Risks

None. It only adds denies and asks.

## Verification

- `trust-policy.test.js`:
  - both paths are in `SECRET_PATHS`;
  - `claudePermissions().ask` has `Read(/run/secrets-for-users/**)`;
  - the OpenCode read denies include `/run/secrets-for-users/*`;
  - `isSecretPath("/run/secrets-for-users.d/1/x")` is true.
- The "cannot silently shrink" test minimum stays valid. `node --test`; `nix flake check`.
