---
status: approved
issue: 127
spec: spec/2026-10-29-127-yolo-secret-card.md
coders:
  1: codex   # as #116-#120: Codex codes the trust logic
  2: codex
  3: codex
reviewers:
  - agy      # the other model, read-only; plus the default fresh Opus review
---

# Plan: YOLO still asks before touching a secret

## Approved decisions

- New async `touchesSecret(toolCall, cwd)` in `bridge/trust-policy.js`. It's true when
  either holds:
  - any named path (`locations[].path`, `rawInput.file_path`/`path`/`notebook_path`
    strings), resolved against `cwd` and `realpath`ed (on error, the resolved literal),
    is `isSecretPath`;
  - `rawInput.command` (argv joined with spaces) contains a `secretBashRules()`
    substring.
- The `SECRETS` substring list moves from `bridge/always.js` into `trust-policy.js`
  (exported as `secretCommandText(command)` or similar). `rememberable` uses it, with no
  behaviour change.
- The YOLO branch auto-allows only when `!herdrWrite && !(await touchesSecret(...))`.
  Otherwise it falls through to the remembered check and the card, with status
  "YOLO · asks: secret path".
- Guide, Mechanic, OpenCode reads (#118's gate) and Codex are unchanged.
- README "Trust" and SECURITY.md say YOLO still shows the card for secret paths.

## Steps

1. **`bridge/trust-policy.js`** (near `isSecretPath` ~68 and `secretBashRules` ~209)
   and **`bridge/always.js:9,20,40`.**
   - Add `export const namesSecret = (command) => …`. It joins an argv array, returns
     false for a non-string, then checks against the substrings derived from
     `secretBashRules()`.
   - Add `export async function touchesSecret(toolCall, cwd)` as decided. It needs
     `import { realpath } from "node:fs/promises"` and `resolve` from `node:path`; check
     what's already imported.
   - In `always.js`, drop the local `SECRETS` and the `commandText` use for secrets, and
     call `namesSecret(toolCall.rawInput.command)`.

   Verify: `cd bridge && node --test --test-reporter=dot ./*.test.js` (the lead runs the
   bridge tests; the sandbox blocks nested node).
   Traps:
   - `secretBashRules` is defined after `SECRET_PATHS`. Compute the substrings lazily
     inside the function, or after both declarations (TDZ).
   - `~` in a `file_path` isn't expanded by `resolve`. Expand a leading `~/` with
     `process.env.HOME` before resolving.
2. **`bridge/bridge.js:444-450`** (the YOLO branch). Change it to
   `if (policy.permission === "yolo" && !herdrWrite && !(await touchesSecret(params.toolCall, cwd))) { … }`.
   Before it, if YOLO and `touchesSecret` is true, emit the status
   `YOLO · asks: secret path`. Compute `touchesSecret` once, and only when the policy is
   YOLO. Import it at `bridge.js:17`.
   Verify: the suite.
   Traps:
   - This is inside the async block (#118). Don't move the Guide branch.
   - The remembered-approval check after it must still see `policy.permission === "ask"`
     only. In YOLO a secret request goes straight to the card, so check that the code
     path after the YOLO branch reaches the card for YOLO. If the existing card path is
     gated on `permission === "ask"`, extend it to "ask or (yolo and secret)".
3. **Tests and docs.**
   - **`trust-policy.test.js`:** `touchesSecret` is true for:
     - `locations` to a temp `.age` file and to a symlink to one;
     - `rawInput.file_path: "~/.ssh/k"`;
     - `rawInput.command: "cat ~/.netrc"`;
     - argv `["cat","/run/agenix/x"]`.

     It's false for a plain path and `uname -r`.
   - **A new bridge test** (`always-bridge.test.js` style, settings
     `{ trust: "mechanic", permissionMode: "yolo" }`):
     - `PLEASE_SECRET` → one card, and the status includes "asks: secret path";
     - `PLEASE_PLAIN` → no card, auto `allow_once`;
     - herdr → a card, as today.
   - **README:** the "Trust" YOLO line. **SECURITY.md:** the "Reaching auto-approve"
     row, and the out-of-scope YOLO line ("except secret paths").

   Verify: the suite green; `nix flake check`.

## Deviations

- **Step 2 (Codex):** after the async `touchesSecret`, the YOLO branch re-checks the current
  policy. A switch to Guide during the check cancels, the same pattern as #114's remembered
  lookup.
- **Step 2 (Claude, a gap in the plan):** switching *to* YOLO runs
  `allowAllPendingPermissions()`, which auto-allowed every waiting card except herdr
  writes, so a secret card already on screen would have been approved. It's now async and
  skips secret cards, re-checking that each card is still pending and the trust level is
  still Mechanic after the await. Its caller adds `.catch`. Step 3 adds the test: switching
  to YOLO with a secret card waiting leaves the card.

## Tests

- `cd bridge && node --test --test-reporter=dot ./*.test.js`; `nix flake check`.
- After deploy: YOLO on, Claude reads the canary symlink → a card.

## Rollback

Revert the merge commit.
