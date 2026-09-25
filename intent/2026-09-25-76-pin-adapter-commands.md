---
status: draft
issue: 76
author: olafkfreund
---

# Intent: The environment can replace the agent binary Nixi launches

## Problem

`nix/package.nix` wraps the bridge's node with four `--set-default` flags, so
`bridge/nixi-node` reads:

```bash
export NIXI_CLAUDE_ACP_COMMAND=${NIXI_CLAUDE_ACP_COMMAND-'["…/claude-agent-acp"]'}
export NIXI_CODEX_ACP_COMMAND=${NIXI_CODEX_ACP_COMMAND-'["…/codex-acp"]'}
export NIXI_OPENCODE_COMMAND=${NIXI_OPENCODE_COMMAND-'["…/opencode","acp"]'}
export NIXI_CONTEXT_COMMAND=${NIXI_CONTEXT_COMMAND-'["…/nixi-context"]'}
```

`${VAR-default}` uses the default only when the variable is **unset**. Anything
that exports one of these before the card starts wins over the store path the
Nix build pinned. A line in `~/.bashrc`, `~/.zshrc`, `~/.profile` or a systemd
user environment file is enough, and it applies from the next card open onward.

The consequence is not that a setting changes. It is that **the process Nixi
believes is the agent is a different process**. Trust levels, the permission
rules in `bridge/trust-policy.js`, and Guide's cancel are all enforced by the
bridge against whatever it spawned; none of them constrain a substituted
binary, because that binary decides what to report back.

`NIXI_CONTEXT_COMMAND` is the quieter one and is not mentioned in the issue at
all: it replaces `nixi-context`, which supplies the grounding text the agent is
given. It does not change who the agent is, it changes what the agent is told
is true.

This is deliberate, not an oversight. `nix/package.nix:49-50` says so:

> `# store paths become the bridge's defaults; --set-default keeps NIXI_* from the environment in charge.`

So this is a decision to revisit, not a bug to patch quietly.

## Proposed outcome

On a Nix deployment, the adapter and context commands Nixi launches are the
ones the build pinned, and no environment variable can redirect them. A user
who wants a different adapter overrides the package, which is the same place
every other Nix-level choice is made.

Nothing about the non-Nix path changes: an imperative install still resolves
adapters from `PATH`, and `bridge/harness-policy.js` still reports a missing
adapter with a message naming what to install.

## Affected users and systems

- Anyone running Nixi from the Home Manager module (p620, razer).
- Anyone developing an ACP adapter locally who currently points Nixi at a build
  with `NIXI_CLAUDE_ACP_COMMAND=…`. This is the group that loses something.
- The bridge's own tests are unaffected: they set `NIXI_ACP_COMMAND` and spawn
  `node` directly (`bridge/testing/run-bridge.js:42`), never through
  `nixi-node`, so a hard pin in the wrapper is invisible to them. Verified.

## Constraints

- Must not change behaviour for installs that resolve adapters from `PATH`.
- Must not break `bridge/testing/run-bridge.js` or any existing test.
- The `installCheckPhase` assertion at `nix/package.nix:239` (`grep -q
  'NIXI_CONTEXT_COMMAND' $plugin/bridge/nixi-node`) must still hold.
- The replacement path for adapter development has to be written down in the
  same change, not left implied — removing a capability without naming its
  substitute is how this gets reverted in six months.

## Open questions

1. **Does `NIXI_ACP_COMMAND` stay honoured?** It is the any-agent wildcard and
   is what the test harness uses. `nix/package.nix` never sets it, so hard
   pinning the three per-agent variables already makes it dead on a Nix
   deployment (the per-agent name is checked first in
   `harness-policy.js:adapterOverride`). Leaving it in place keeps the tests
   working unchanged. The alternative — honouring it only when no per-agent
   variable is set — is what the code already does, so I believe the answer is
   "no change needed", but it deserves an explicit yes.

2. **Does `NIXI_CONTEXT_COMMAND` get the same treatment?** I think yes and the
   issue does not ask for it, which is why it is a question rather than an
   assumption.

3. **Is losing the env-var route for adapter development acceptable?** This is
   the real cost and the reason the current code chose otherwise. A developer
   would use `services.nixi.package = pkgs.nixi.override { claudeAcp = …; }`.

## Note on severity

Filed alongside #74 and #75 during a security sweep. Both of those were
investigated on a live desktop and **did not hold** — #75 is refuted outright
and #74 did not reproduce across three probes. This issue is the one of the
three that survived scrutiny, and it survived larger than filed: four
variables rather than one.

It is still not a privilege escalation on its own. Anything that can write
`~/.bashrc` can already run code as the user. What it changes is what a
*misleading* approval buys — the same argument #52 settled for writes that run
with nobody present. Deny-listing the rc files (option 1 in the issue) polices
one door of four; this removes the capability instead.
