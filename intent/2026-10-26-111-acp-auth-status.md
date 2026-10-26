---
status: approved
issue: 111
author: olafkfreund
---

# Intent: the Claude adapter's sign-in check fails on every session

## Problem

At the start of every Claude session, the bridge's log shows
`error: unknown option '--settings'`, followed by `claude auth status failed: …`.

How it happens:

- Nixi hands the trust permissions to claude-agent-acp as session `settings`.
- Version 0.93.0 of the adapter passes them on as `claude auth status --json --settings <json>`.
- Claude Code 2.1.3xx accepts `--settings` only before the subcommand.

So the adapter's sign-in check fails every time, and it reports no sign-in identity. Sessions themselves still work, and nixi doesn't read that identity today. The cost is a noisy log and a check that never passes. The noise also hides real errors in the companion and bridge logs.

Upstream fixed this in v0.97.0 (#1392) by moving `--settings` in front of the subcommand. nixpkgs still has 0.93.0, in both the locked input and current nixos-unstable.

## Proposed outcome

- A Claude session no longer logs `unknown option '--settings'`.
- `claude --settings <json> auth status --json` runs and succeeds.
- Once nixpkgs ships 0.97.0 or later, nixi uses that adapter unchanged, with no code left to remove by hand.

## Affected users and systems

- Every user of the claude agent with a pinned adapter (`services.nixi.agents` includes claude). This is the default on p620.
- Users who resolve the adapter from PATH are not affected by this fix.
- The file to change is `nix/adapters.nix` (or wherever `claudeAcp` is consumed).

## Constraints

- Must not change the permissions nixi passes, or how it passes them.
- Must be a no-op on adapter versions 0.97.0 and later.
- Must fail the build loudly if the upstream line changes. A patch that silently doesn't apply is not acceptable.
- Rebuilding the adapter from source is acceptable, since it isn't in the binary cache once patched. A local build takes about a minute.

## Open questions

None. Not chosen: waiting for nixpkgs to update the adapter. That keeps the error on every session for an unknown time.
