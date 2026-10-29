---
status: approved
issue: 128
spec: spec/2026-10-29-128-secrets-for-users.md
---

# Plan: sops-nix user secrets are fenced too

Below the handoff threshold (one step, one source file and its test), so the lead
implements it.

## Approved decisions

- `SECRET_PATHS` gains `"/run/secrets-for-users/**"` and `"/run/secrets-for-users.d/**"`,
  next to `/run/secrets.d/**`.
- Nothing else changes in code: the Claude asks, the OpenCode denies, `isSecretPath` and
  `touchesSecret` are all generated from that list. The shell rule `Bash(*/run/secrets*)`
  already matches.

## Steps

1. **`bridge/trust-policy.js:139`**: add the two entries after `"/run/secrets.d/**",`
   with a comment ("sops-nix neededForUsers, and its target (#128)").
   **`bridge/trust-policy.test.js`**: one test:
   - both paths are in `SECRET_PATHS`;
   - `claudePermissions(false).ask` includes `Read(/run/secrets-for-users/**)`;
   - `opencodePermissions(false).permission.read["/run/secrets-for-users/*"] === "deny"`;
   - `isSecretPath("/run/secrets-for-users.d/1/x")`.

   Verify: `cd bridge && node --test --test-reporter=dot ./*.test.js`.

## Tests

- The suite green; `nix flake check`.

## Rollback

Revert the merge commit.
