---
status: draft
issue: 16
author: olafkfreund
---

# Intent: The agents default must ask whether the adapter builds, not what the config says

## Problem

`services.nixi.agents` decides which ACP adapters Nix pins into Nixi. Its
default (`nix/hm-module.nix:73`) is

```nix
lib.optional (pkgs.config.allowUnfree or false) "claude" ++ [ "codex" ]
```

`claude-agent-acp` depends on the unfree `claude-code`, so the option tries to
pin it only where unfree is permitted. The test it uses to decide that is the
wrong test.

`pkgs.config.allowUnfree` does not answer "does this machine allow unfree". It
answers "was the `pkgs` handed to this Home Manager evaluation constructed with
`allowUnfree`", and those are different questions. Home Manager can be given a
`pkgs` that is standalone, re-imported, or wired through a different module
argument than the one `nixpkgs.config` was set on, and in each of those the read
returns `false` on a machine where unfree packages install perfectly well. The
`or false` then swallows the disagreement silently: there is no warning, no
eval error, nothing in the build log. The option simply pins one agent fewer
than the user asked for.

That is not hypothetical. On a nixarchy laptop (2026-09-17) with
`programs.nixarchy.allowUnfree` on at the NixOS level and unfree packages
installing normally, the resulting profile carried

```
codex-acp-1.12.0
opencode-1.18.30
          <- no claude-agent-acp
```

i.e. `lib.optional` contributed nothing and the default evaluated to
`[ "codex" ]`.

The consequence is a dead keybinding, because the two halves of the system
disagree about which agent exists. `~/.config/omarchy/defaults/agent` still
said `claude`, and `bridge/harness-policy.js:12-16` reads that file as an
**explicit choice**. An explicit choice is honoured and fails loudly if its
adapter is missing (`resolveAdapter`), which is the correct behaviour and was
settled deliberately in #13: silently starting an agent other than the one
asked for would be worse. So SUPER+H died on

> Claude Code's ACP adapter (claude-agent-acp) is not on the system PATH.

on a desktop that had opencode and codex pinned and working.

#13 does not cover this case and was not meant to. Its fallback
(`harness-policy.js:35-40`) rescues a machine with *no* `defaults/agent` file by
picking the first agent that can actually be started. This laptop had the file.
The bridge is behaving correctly here; the packaging lied to it.

What makes this worth fixing rather than documenting is that the failure is
invisible at the moment it happens. The user gets no signal at rebuild time and
an error at the moment they press the help key — the one key a beginner presses
when something is already wrong.

## Proposed outcome

- A machine that can build `claude-agent-acp` gets `claude` in the default,
  regardless of how its Home Manager `pkgs` was wired.
- A machine that genuinely cannot build it (unfree refused) still evaluates,
  still installs, and still gets a working card with the agents it can have.
  Refusing unfree must not become an eval error.
- The default and `defaultText` agree with each other, so
  `services.nixi.agents` documents what it actually does.
- No change for anyone who sets `services.nixi.agents` explicitly.
- The observable end state: on the laptop in the report, SUPER+H opens the card
  on Claude after a rebuild, with no change to `defaults/agent`.

## Affected users and systems

- Every nixarchy machine taking the default, i.e. everyone who has not set
  `services.nixi.agents`. Machines that allow unfree gain a pinned
  `claude-agent-acp` (651 MiB) they were meant to have already — a real download
  on first rebuild, and the reason this is not purely a bugfix in size terms.
- `nix/hm-module.nix:66-87` — the default, the `defaultText`, and the option
  description, which all state the `allowUnfree` rule and go stale together.
- Not the bridge. `bridge/harness-policy.js` is correct as it stands and this
  intent proposes no change to it.
- nixarchy itself pins the pair deliberately in some configurations
  (nixarchy#731, where claude-agent-acp and unfree claude-code are 651 MiB of a
  public 5 GB cache); those set the option explicitly and must keep working
  untouched.

## Constraints

- Must not break eval on a machine that refuses unfree. Whatever replaces the
  config read has to *not throw* there — this is the whole difficulty, since
  the natural way to ask "does this package build" is to evaluate it, and
  evaluating an unfree derivation on such a machine is exactly what throws.
- Must not make the default depend on impure evaluation or on anything read
  from outside the Nix store.
- Must stay a `defaultText` that a human can read in the generated option docs;
  a default nobody can describe is worse than one that is occasionally wrong.
- Must not pin more than the machine consented to. Erring toward installing
  unfree software on a machine that refused it is the one failure mode worse
  than today's.
- `nix flake check` must pass on both an unfree-allowing and an unfree-refusing
  evaluation.

## Open questions

1. **Is "can it build" the right question, or should the default stop being
   conditional at all?** A conditional default is what produced this bug. The
   alternative is a fixed default plus a loud, actionable message when an agent
   in the list cannot be pinned. That is a larger behavioural change and may be
   the better one; deciding it is the point of this intent.
2. **Should a disagreement warn?** When the default resolves to fewer agents
   than `defaults/agent` names, the system currently says nothing until the key
   is pressed. A `lib.warn` at rebuild time would have surfaced this in
   seconds. Worth it, or noise on the many machines that legitimately pin a
   subset?
3. **Does the 651 MiB matter here?** Fixing this means machines that allow
   unfree start pulling an adapter they were silently spared. That is the
   correct outcome, but it is a surprise on the next rebuild and may deserve a
   release note rather than a silent fix.
