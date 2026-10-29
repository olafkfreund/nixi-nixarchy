---
status: draft
issue: 116
spec: spec/2026-10-29-116-always-passthrough-opencode-exec.md
coders:
  1: codex   # bridge logic with a clear test spec; Codex reads the repo natively
  2: codex
  3: codex
reviewers:
  - agy      # the other model reviews, read-only; plus the default fresh Opus review
---

# Plan: no standing "yes" leaks past nixi's trust model

## Approved decisions

- `allow_always` survives `requestPermission` only for:
  - `execute` calls where `rememberable(toolCall, cwd)` is true;
  - kinds other than `execute`, `read`, `search` and `EDIT_KINDS` (fetch, think,
    other/MCP, none).

  The herdr and chained filters stay for every kind. **Hide**, never "show and answer
  once".
- OpenCode `edit` denies are generated from `EXEC_WRITE_PATHS` by the same transform
  as the secret denies (`opencodePathDenies(paths)`); the two explicit `*nixi/always.json`
  patterns stay.
- `~/.config/opencode/**` is added to `EXEC_WRITE_PATHS` (both agents).
- No change to Guide, Codex, `answerPermission`'s branches or #114's store.

## Steps

1. **`bridge/bridge.js:400-407`.** Replace the three `.filter` calls with one:
   `.filter((option) => option.kind !== "allow_always" || offersAlways(params.toolCall))`.
   Define `offersAlways(toolCall)` just above `requestPermission`:
   - false if `isHerdrWrite(toolCall)` or `isChained(toolCall)`;
   - else, for `kind === "execute"`: `rememberable(toolCall, cwd)`;
   - else false for `read`, `search` or `EDIT_KINDS`;
   - else true.

   Give it a one-line comment citing #114 and #116.
   Verify: `cd bridge && node --test` (all green; existing #114 tests unchanged).
   Traps:
   - `rememberable` already excludes chained and herdr; keep the explicit checks
     anyway, since they apply to every kind.
   - Don't touch `answerPermission`.
2. **`bridge/trust-policy.js`.**
   - **(a)** Rename the body of `opencodeSecretDenies()` (~52-64) into
     `export function opencodePathDenies(paths)`, and make `opencodeSecretDenies = () =>
     opencodePathDenies(SECRET_PATHS)`.
   - **(b)** In `opencodeRules` (~66-82), build `edit` as
     `{ "*": "ask", ...Object.fromEntries(opencodePathDenies(EXEC_WRITE_PATHS).map((p) => [p, "deny"])),
     "*nixi/always.json": "deny", "*nixi/always.json.*": "deny" }`.
   - **(c)** Add `"~/.config/opencode/**",  // OpenCode's own permission config, loaded (#116)`
     to `EXEC_WRITE_PATHS` after the `~/.claude` entries.

   Verify: `node --test` (the existing OpenCode `edit` deepEqual is now expected to
   fail; it's fixed in step 3).
   Traps:
   - `EXEC_WRITE_PATHS` is declared after `opencodeRules` but read at call time; check
     the `OPENCODE_PERMISSIONS = opencodeRules("allow")` constant runs after both
     declarations (move it below `EXEC_WRITE_PATHS` if needed). ES module `const` TDZ
     throws otherwise.
   - `~/.local/bin/nixi-*` transforms to `*.local/bin/nixi-*`, which is fine.
3. **Tests and docs.**
   - **`bridge/trust-policy.test.js`:** update the OpenCode `edit` deepEqual to the
     generated object, and add:
     - every non-`//` `EXEC_WRITE_PATHS` entry yields a deny in OpenCode `edit`;
     - `opencodeSecretDenies()` is unchanged;
     - `EXEC_WRITE_PATHS` includes `~/.config/opencode/**`.
   - **`bridge/always-bridge.test.js` (or a new `bridge/always-offer.test.js`):** with
     `FAKE_AGENT_OPTIONS=always`, the card options include no `allow_always` for:
     - `PLEASE_SECRET`;
     - a new fixture `PLEASE_ELSEWHERE` (execute with `rawInput.cwd: "/elsewhere"`);
     - a new `PLEASE_READ` (kind `read`).

     They still include it for `PLEASE_PLAIN` and a new `PLEASE_FETCH` (kind `fetch`).
     Add the fixtures to `bridge/testing/fake-agent.js` next to `PLEASE_SECRET`.
   - **`SECURITY.md`:** in the "Remembered approvals" row, add "always is offered only
     for commands nixi keeps". In the exec-write row, or a new one, say the
     unattended-execution paths are denied for Claude and OpenCode, Codex excepted (#97).

   Verify: `cd bridge && node --test` all green, then `nix flake check`.
   Traps: fixture tool call ids must be unique (`t9`, `t10`, ...).

## Tests

- `cd bridge && node --test`: all pass.
- `nix flake check`: passes.
- After deploy, live: OpenCode at Mechanic+YOLO, "write ~/.config/systemd/user/nixi-test.service"
  → refused by config, no card, no file.

## Rollback

Revert the merge commit. There's no state format change.
