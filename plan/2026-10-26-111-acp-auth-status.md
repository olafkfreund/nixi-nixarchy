---
status: draft
issue: 111
spec: spec/2026-10-26-111-acp-auth-status.md
---

# Plan: put `--settings` before `auth status` in the pinned Claude adapter

## Summary of the approved decisions

- **The bug.** claude-agent-acp 0.93.0 runs `claude auth status --json --settings <json>`. Claude Code 2.1.3xx rejects that with `unknown option '--settings'`. It accepts `--settings` only before the subcommand.
- **The fix.** Upstream fixed it in v0.97.0 (#1392, commit 6a33ded) by changing `args.push("--settings", …)` to `args.unshift("--settings", …)` in `src/acp-agent.ts`.
- **Where it goes.** Only `nix/adapters.nix` changes. Wrap the pinned claude adapter in a `postPatch` that makes the same edit with `substituteInPlace --replace-fail`.
- **When it applies.** The wrapper skips the patch when the adapter is null (unfree refused) or its version is 0.97.0 or later.
- **What it doesn't change.** The permissions nixi passes, and how it passes them. An adapter the user supplies through `override { claudeAcp = …; }`, or one found on PATH.
- **Rejected:** bumping the version with new hashes, dropping `settings`, filtering the log line, patching in the system flake.

Small enough to implement myself: one step, one file, so no `coder` handoff.

## Steps

1. **`nix/adapters.nix`.**
   - Before `in` (around line 44), add an `authStatusFix` binding:
     - Return `acp` unchanged if `acp == null || lib.versionAtLeast acp.version "0.97.0"`.
     - Otherwise return `acp.overrideAttrs (old: { postPatch = (old.postPatch or "") + …; })`, running:
       ```
       substituteInPlace src/acp-agent.ts --replace-fail 'args.push("--settings", JSON.stringify(context.override))' 'args.unshift("--settings", JSON.stringify(context.override))'
       ```
     - Give it a one-line comment naming #111, upstream #1392 and v0.97.0.
   - Line 47: change it to `claudeAcp = authStatusFix (adapterFor "claude" "claude-agent-acp");`.

   **Verify:** `nix flake check` passes.

   **Traps:**
   - The wrapper must sit outside `adapterFor`'s `tryEval`. Reading `acp.version` on a refused unfree package would throw, so the null check has to come first. `||` short-circuits, so the order inside it matters.
   - Keep the file's comment style: prose that explains why.

## Tests

1. `nix flake check`: all checks pass, including `hm-module-eval`. Its `refused.claudeAcp == null` and `allowed.claudeAcp != null` asserts must still hold.
2. Build the pinned adapter from p620's config against this branch:
   - Use `nix eval` on the companion or nixi package's `NIXI_CLAUDE_ACP_COMMAND`, or directly on `import ./nix/adapters.nix` with p620's pkgs.
   - Run `nix build`.
   - `grep 'args.unshift("--settings"' <out>/lib/node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js` must match.
3. Live:
   - Run the bridge once with `NIXI_CLAUDE_ACP_COMMAND='["<out>/bin/claude-agent-acp"]'` for one Claude session.
   - Its stderr must not contain `unknown option '--settings'`.
   - The baseline: the current server log shows the error on every session.

## Rollback

Revert the commit. `claudeAcp` goes back to the stock nixpkgs adapter, which still has the error but works otherwise.
