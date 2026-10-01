---
status: approved
issue: 16
intent: intent/2026-09-18-16-agents-default-unfree.md
---

# Spec: An unconditional agents default, with a capability probe that reports

## Design

Three changes in `nix/hm-module.nix`, and one new check in `flake.nix`.

### 1. The default becomes a literal list

`nix/hm-module.nix:73` drops the condition:

```nix
default = [ "claude" "codex" ];
defaultText = lib.literalExpression ''[ "claude" "codex" ]'';
```

The option now states which agents Nixi wants and says nothing about the
evaluation it is running in. `defaultText` becomes the literal default, so the
generated option docs show a list instead of paraphrasing a rule.

The option description loses its `nixpkgs.config.allowUnfree` paragraph and
gains one sentence: an agent whose adapter cannot be built here is skipped with
a warning, and remains usable from `PATH`.

### 2. A capability probe replaces the config read

`nix/hm-module.nix:14-20` currently does:

```nix
claudeAcp = if lib.elem "claude" cfg.agents then pkgs.claude-agent-acp else null;
```

It becomes a probe that asks whether the derivation can actually be evaluated
here:

```nix
# Whether this pkgs can produce the adapter, asked by evaluating it rather
# than by inspecting config: `pkgs.config.allowUnfree` answers "how was this
# pkgs built", which is a different question and was wrong on a real machine
# (#16). tryEval catches the unfree refusal; a missing attribute it does NOT
# catch, so the `?` guard comes first.
adapterFor = agent: attribute:
  if !(lib.elem agent cfg.agents) then null
  else if !(pkgs ? ${attribute}) then
    lib.warn "Nixi cannot pin ${attribute} for the ${agent} agent: your nixpkgs has no such package. ${agent} still works if its adapter is on PATH. Set services.nixi.agents to silence this." null
  else if !(builtins.tryEval pkgs.${attribute}.outPath).success then
    lib.warn "Nixi cannot pin ${attribute} for the ${agent} agent: it does not evaluate in this configuration, most often because it is unfree or depends on something unfree. Allow it (nixpkgs.config.allowUnfree, or an allowUnfreePredicate for just this package), or set services.nixi.agents to the agents you want. ${agent} still works if its adapter is on PATH." null
  else pkgs.${attribute};

claudeAcp = adapterFor "claude" "claude-agent-acp";
codexAcp = adapterFor "codex" "codex-acp";
opencodeAcp = adapterFor "opencode" "opencode";
```

Both branches of the intent's decision fall out of this one function: the
default can be unconditional *because* an agent that cannot be pinned degrades
to `null` with a warning instead of throwing, and `null` is already the
"resolve from PATH at runtime" case that `nix/package.nix:16-21` documents and
`bridge/harness-policy.js` implements. Nothing downstream changes.

The probe is applied to all three agents, not only claude. `codex-acp` and
`opencode` are free today, but the bug being fixed is *asking a question whose
answer you assume*, and hard-coding "these two are fine" repeats it.

### 3. The warning fires on the list, never on omissions

`adapterFor` returns `null` silently when the agent is not in `cfg.agents`. A
machine that deliberately pins `[ "codex" "opencode" ]` (nixarchy#731) says
nothing about claude, so nothing is warned — as the intent requires. The
warning is only ever about an agent the configuration asked for and did not
get.

`lib.warn` rather than `lib.trace` or an assertion: it is the one that prefixes
`evaluation warning:` and cannot fail the build. An assertion is wrong here by
construction — refusing unfree must remain a supported configuration.

Two distinct messages, because `builtins.tryEval` returns `{ success, value }`
and no error text, so the module cannot quote the real reason. Rather than
guess one, the missing-attribute case is separated (where the reason is known
exactly) from the eval-failure case (where the message names unfree as the
likely cause and gives both remedies without claiming certainty).

### 4. A check that evaluates the module both ways

`flake.nix:43` gains a `hm-module-eval` check. Today `checks` only builds the
package and runs the Python self-check; nothing evaluates the Home Manager
module, which is why this bug could exist. The check evaluates the module's
adapter selection against a `pkgs` with `allowUnfree = true` and one with
`allowUnfree = false`, asserting that both succeed and that the unfree-refusing
one yields `claudeAcp == null`.

It evaluates the `let` bindings, not a full Home Manager configuration: the
defect lives in that expression, and importing Home Manager into `checks` adds
a flake input and an eval far larger than the thing under test.

## Alternatives rejected

**Keep the condition, fix the test** (`tryEval` inside `lib.optional` instead of
reading `config`). Smaller diff and it fixes the reported machine. Rejected by
the approved intent: a conditional default makes "what Nixi wants" and "what
this machine can have" the same sentence, so the failure stays silent — the
user still gets a shorter list with no explanation of why.

**`pkgs.config.allowUnfreePredicate` / a deeper config read.** Every variant
inspects how `pkgs` was constructed, which is the wrong question. It also
misses the user who allows exactly one unfree package by predicate; the probe
gets that user right for free, because it evaluates the actual derivation.

**`lib.meta.availableOn` or `meta.unfree`.** Answers a narrower question than
"does this evaluate here" — it would not catch a broken or unsupported-platform
adapter, and `claude-agent-acp` is itself Apache-2.0 (`meta.unfree = false`),
so reading `meta.unfree` on it returns the wrong answer outright. Measured:
the unfree refusal comes from its dependency on `claude-code`, and only
forcing the derivation surfaces it.

**An assertion instead of a warning.** Turns a supported configuration
(refusing unfree) into a build failure. Directly contradicts the intent's
constraint.

**Warn once, or warn about agents left out of an explicit list.** Rejected in
the intent: nagging a correct configuration is how warnings get ignored.

## Risks

- **Every machine on the default now pulls `claude-agent-acp` (651 MiB)** on
  the next rebuild, where before it was silently skipped on any machine whose
  `pkgs` read `false`. This is the intended fix, and the surprise the intent's
  remaining open question (a release note) is about.
- **nixarchy's own configurations** that pin a subset are unaffected — they set
  the option explicitly and the probe stays silent for what they omitted. If
  any nixarchy host relies on the *default* to drop claude, it will now warn and
  start pinning it; that host should set `services.nixi.agents` instead. Worth
  checking before merge.
- **Warning fatigue on a deliberately free machine.** A user who refuses unfree
  and never sets the option sees the warning on every rebuild. Accepted in the
  intent, with "set `services.nixi.agents`" in the message as the way out.
- **Eval cost.** The probe forces one derivation per listed agent, which the
  module already did for the agents it pinned. No measurable change.
- **`tryEval` is a blunt instrument.** It catches any `throw` during evaluation
  — an adapter genuinely broken in the user's nixpkgs is reported as if it were
  unfree. The message is hedged accordingly ("most often because"). It does not
  catch `abort` or a missing attribute; the latter is handled by the `?` guard,
  the former would fail eval as it does today.

## Verification

Measured on this machine, 2026-09-18, with `NIXPKGS_ALLOW_UNFREE` cleared from
the environment (it is set here, and it invalidates any test of this that does
not clear it):

| probe, `allowUnfree = false` | result |
| --- | --- |
| `tryEval pkgs.claude-code.outPath` | `false` |
| `tryEval pkgs.claude-agent-acp.outPath` | `false` |
| `tryEval pkgs.codex-acp.outPath` | `true` |
| `tryEval pkgs.hello.outPath` | `true` |
| `tryEval pkgs.definitely-not-a-package.outPath` | **error escapes** — not caught |

and with `allowUnfree = true`, `claude-agent-acp` probes `true`. These are the
facts the design rests on: the probe distinguishes the two machines, and the
missing-attribute guard is required rather than defensive.

Done is proven by:

1. `nix flake check` passes, including the new `hm-module-eval`.
2. The new check asserts, on a `pkgs` with `allowUnfree = false`: eval succeeds,
   `claudeAcp == null`, `codexAcp != null`.
3. The new check asserts, on a `pkgs` with `allowUnfree = true`:
   `claudeAcp != null`.
4. `nix eval .#homeModules.default` style evaluation of the option's
   `defaultText` matches the literal default (they can no longer drift, but the
   check is free).
5. Runtime, on the laptop from the report: after a rebuild, `SUPER+H` opens the
   card on Claude with no change to `~/.config/omarchy/defaults/agent`, and the
   profile contains `claude-agent-acp`. This is the observable outcome the
   intent promised and the only proof that matters to the user.
6. On a machine refusing unfree: the rebuild prints the warning naming claude
   and the remedy, completes, and `SUPER+H` opens the card on an agent that
   starts.

Not verified by this change: `bridge/harness-policy.js` behaviour, which is
untouched. Its existing tests (`bridge/harness-policy.test.js`) must still pass
unchanged — if they do not, the change has leaked out of its scope.
