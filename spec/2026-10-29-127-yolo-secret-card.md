---
status: draft
issue: 127
intent: intent/2026-10-29-127-yolo-secret-card.md
---

# Spec: YOLO still asks before touching a secret

Builds on #118 (merged first): `isSecretPath(realPath)` in `bridge/trust-policy.js`,
and `requestPermission`'s Guide and YOLO branches inside its async block.

## Design

1. **`touchesSecret(toolCall, cwd)`** in `bridge/trust-policy.js` (async, exported).
   It's true when either holds:
   - **A named path is secret.** Paths come from every `toolCall.locations[].path`, plus
     `rawInput.file_path`, `rawInput.path` and `rawInput.notebook_path` when they're
     strings. Each is resolved against `cwd`, `realpath`ed (on any error, the resolved
     literal path is used), and checked with `isSecretPath`. A secret through a symlink
     counts, as in #118, and so does a literal secret path to a file that doesn't exist.
   - **The command text names a secret.** `rawInput.command` (an argv array joined with
     spaces) contains any of the substrings behind `secretBashRules()`. That's the same
     test `rememberable` already uses (`bridge/always.js` `SECRETS`), moved here and
     reused by both.
2. **`requestPermission`'s YOLO branch** (`bridge/bridge.js`) auto-allows only when
   `!herdrWrite && !(await touchesSecret(params.toolCall, cwd))`. Otherwise the request
   falls through to the card path unchanged: the remembered-approval check (which
   `rememberable` already refuses for secrets), then the card. The status line says
   "YOLO · asks: secret path" when this happens.
3. **Unchanged:**
   - Guide still cancels before any of this.
   - Mechanic still shows the card.
   - OpenCode reads are still decided by #118's gate, which refuses secrets before YOLO,
     so they never reach this branch.
   - Codex is unchanged (#97).
4. **Docs:** the README "Trust" YOLO sentence says "auto-approve, except anything that
   touches a secret path, which still shows the card". In SECURITY.md, the "Reaching
   auto-approve" row adds the same, and the out-of-scope line about YOLO gets "except
   secret paths".

## Alternatives rejected

- **Use only Claude's own ask rules (the request has no rule id):** the bridge can't see
  which rule fired. Matching the request itself is the only signal.
- **Disable YOLO for whole sessions that read secrets:** too broad, and not what was asked.
- **Only paths, not command text:** `cat ~/.ssh/id_ed25519` is a shell command and would
  still be auto-approved.

## Risks

- **Over-matching:** a command that mentions `.env` in a string, or a file named `x.age`,
  gets a card in YOLO. That fails safe, and it's the same matcher Mechanic and #114
  already use.
- **Under-matching:** a path built at run time (`$(echo ~/.s)sh`) isn't seen. The same
  best-effort limit as `secretBashRules`, already documented.
- **`realpath` per YOLO request:** milliseconds.

## Verification

- `trust-policy.test.js`: `touchesSecret` returns true for:
  - `locations` to a `.age` file and a symlink to one;
  - `rawInput.file_path` `~/.ssh/k` (expanded);
  - `cat ~/.netrc`;
  - an argv `["cat","/run/agenix/x"]`.

  It returns false for a plain path and a plain command.
- Bridge tests in YOLO (fake agent):
  - a secret-path command (`PLEASE_SECRET`) → a card, not auto-allowed;
  - a plain command (`PLEASE_PLAIN`) → auto-allowed;
  - a herdr write → a card, as today.
- The `always.js` tests still pass with `SECRETS` moved.
- `node --test ./*.test.js`; `nix flake check`.
- Live on p620 with YOLO on: Claude reads the canary link → a card appears.
