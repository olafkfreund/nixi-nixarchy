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

- The default names the agents Nixi wants unconditionally, so a machine that
  can build `claude-agent-acp` gets it regardless of how its Home Manager `pkgs`
  was wired.
- A machine that genuinely cannot build it (unfree refused) still evaluates,
  still installs, and still gets a working card with the agents it can have —
  and is *told*, at rebuild time, which agent was left out and why. Refusing
  unfree must not become an eval error.
- No failure of this kind is silent again: the gap between what Nixi pinned and
  what the machine believes its agent is becomes visible before the user
  presses a key, not after.
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
- The `defaultText` must be the literal default. An unconditional default makes
  this free, and it is a reason to prefer one: the option docs stop describing a
  rule and start showing a list.
- The warning must be actionable — the agent, the reason, and the remedy — and
  must not fire on a machine where everything pinned correctly.
- Must not pin more than the machine consented to. Erring toward installing
  unfree software on a machine that refused it is the one failure mode worse
  than today's.
- `nix flake check` must pass on both an unfree-allowing and an unfree-refusing
  evaluation.

## Decisions

Both of the questions this intent was opened to settle now have answers
(2026-09-18). They are recorded here as decided, not open.

**1. The default stops being conditional.** `services.nixi.agents` names the
agents Nixi wants, full stop, and no longer inspects the evaluation it happens
to be running in. A conditional default is what produced this bug: it made
"which agents does Nixi want" and "which agents can this machine have" the same
sentence, so when the second answer was wrong the first one silently changed.
Separating them means the option states an intention that is always true, and
the machine's capability is discovered and *reported* rather than folded
invisibly into the answer.

**2. A machine that cannot pin an agent says so at rebuild time.** When an agent
in the list cannot be pinned, the build warns, naming the agent, the reason, and
what the user can do about it. This is the half of the decision that makes the
first half safe: with an unconditional default, the warning is the only thing
between an unfree-refusing machine and a hard eval failure, and it is also the
signal whose absence let the reported laptop fail silently for a day.

The warning is about the list, not about the agents missing from it. A machine
that deliberately pins `[ "codex" "opencode" ]` (nixarchy#731) never asked for
claude and must stay silent — warning there would be nagging a correct
configuration, which is how warnings get ignored.

Accepted cost: a machine that *does* list an agent it cannot build — most
plainly, one taking the new unconditional default while refusing unfree — warns
on every rebuild, not once. That is repetitive by design. The condition is real
and persists until the user resolves it, either by allowing unfree or by naming
the agents they actually want, and both remedies belong in the warning text.

## Open questions

**3. Does the 651 MiB deserve a release note?** Unchanged from the original
draft and still open. Fixing this means machines that allow unfree start pulling
`claude-agent-acp` on the next rebuild — the correct outcome, but a surprise.
This does not block the spec; it is a release-time decision.

**A scoping point for the approver.** "Unconditional" is read here as dropping
the condition from the set that already exists, giving `[ "claude" "codex" ]`.
It is not read as adding `opencode`, which has never been in the default and
whose inclusion would be a separate change with its own download. Say so if the
intended reading was all three.
