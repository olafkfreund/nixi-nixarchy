---
status: approved
issue: 16
spec: spec/2026-09-18-16-agents-default-unfree.md
---

# Plan: An unconditional agents default, with a capability probe that reports

## The approved decisions, carried over

Implementable without opening the intent or spec.

1. **`services.nixi.agents` defaults to the literal `[ "claude" "codex" ]`.** It
   states which agents Nixi wants and no longer inspects how its `pkgs` was
   built. `opencode` is *not* added; that would be a separate change.
2. **Each agent in the list is probed by evaluating its derivation.** Not by
   reading `pkgs.config.allowUnfree`, which answers "how was this `pkgs`
   constructed" — a different question, and the one that was wrong on a real
   machine.
3. **An agent that cannot be pinned degrades to `null` with a `lib.warn`.** Not
   an assertion: refusing unfree stays a supported configuration. `null` is
   already the "resolve the adapter from PATH at runtime" case
   (`nix/package.nix:16-21`), so nothing downstream changes.
4. **The warning is about the list, never about omissions.** An agent absent
   from `cfg.agents` is silently `null`. A machine pinning `[ "codex"
   "opencode" ]` deliberately says nothing about claude and must stay quiet.
5. **It warns on every rebuild, not once.** The condition persists until the
   user resolves it; both remedies (allow unfree, or set the option) go in the
   message.
6. **Two distinct messages.** `builtins.tryEval` returns `{ success, value }`
   with no error text, so the module cannot quote the real reason. The
   missing-attribute case (reason known exactly) is separated from the
   eval-failure case (names unfree as the likely cause, without claiming
   certainty).
7. **The probe applies to all three agents.** `codex-acp` and `opencode` are
   free today; hard-coding "these two are fine" would repeat the very mistake
   being fixed.
8. **`bridge/` is not touched.** `harness-policy.js` is correct as it stands.

Facts this rests on, measured on 2026-09-18 with `NIXPKGS_ALLOW_UNFREE` cleared
from the environment (it is set on this machine and silently invalidates any
test that does not clear it):

- With `allowUnfree = false`: `tryEval pkgs.claude-agent-acp.outPath` →
  `false`; `codex-acp` and `hello` → `true`.
- With `allowUnfree = true`: `claude-agent-acp` → `true`.
- `claude-agent-acp` is **Apache-2.0** (`meta.unfree = false`). It fails only
  through its dependency on `claude-code`, so reading `meta.unfree` gives the
  wrong answer — the derivation must actually be forced.
- A **missing attribute is not caught** by `tryEval`; the error escapes. The
  `pkgs ? name` guard is therefore required, not defensive.

## Refinement of spec §4 (the check)

The spec says the check evaluates the module's adapter selection rather than a
full Home Manager configuration. Two mechanics it did not settle:

- `flake.nix:9-10` builds `forAllSystems` from `nixpkgs.legacyPackages.${system}`,
  which **cannot be reconfigured**. The check must `import nixpkgs { inherit
  system; config.allowUnfree = …; }` itself to get the two `pkgs` it compares.
- If the check re-implements the probe inline it tests a copy of the logic, not
  the shipped logic. So the probe is factored into a new `nix/adapters.nix`,
  imported by both `nix/hm-module.nix` and the check.

That new file is the only structural addition in this plan and exists solely so
the check exercises the real expression.

## Steps

1. **`nix/adapters.nix` (new)**: a function `{ lib, pkgs, agents }:` returning
   `{ claudeAcp, codexAcp, opencodeAcp }`, containing `adapterFor` exactly as
   the spec gives it — the `lib.elem` guard, then `pkgs ? attribute`, then
   `(builtins.tryEval pkgs.${attribute}.outPath).success`, each failing branch
   returning `lib.warn <message> null`. Carry the spec's comment explaining why
   the question is asked this way and why the `?` guard comes first.
   → verify by `nix eval --impure --expr` importing it directly with an
   `allowUnfree = false` pkgs and `agents = [ "claude" "codex" ]`: it evaluates,
   `claudeAcp` is `null`, `codexAcp` is not.

2. **`nix/hm-module.nix:14-21`**: replace the three `if lib.elem …` lines in the
   `nixiPkg = cfg.package.override { … }` block with
   `import ./adapters.nix { inherit lib pkgs; agents = cfg.agents; }`. Update
   the comment above it (`:14-16`), which currently explains the unfree
   decision in terms of the user's config.
   → verify by `nix eval .#homeModules.default` succeeding and
   `git diff nix/hm-module.nix` touching only that block and the option.

3. **`nix/hm-module.nix:73-74`**: `default = [ "claude" "codex" ];` and
   `defaultText = lib.literalExpression ''[ "claude" "codex" ]'';`.
   → verify by reading the two lines back; they must be the same list.

4. **`nix/hm-module.nix:77-86`**: rewrite the option `description`. Drop the
   `nixpkgs.config.allowUnfree` sentences; add one sentence saying an agent
   whose adapter cannot be built here is skipped with a warning and stays usable
   from `PATH`.
   → verify by `grep -n allowUnfree nix/hm-module.nix` returning nothing.

5. **`flake.nix:43`**: add the `hm-module-eval` check. For each of
   `allowUnfree = true` and `false`, `import nixpkgs { inherit system; config = { inherit allowUnfree; }; }`,
   call `./nix/adapters.nix` with `agents = [ "claude" "codex" ]`, and assert:
   unfree-refused → `claudeAcp == null` and `codexAcp != null`; unfree-allowed →
   `claudeAcp != null`. A `pkgs.runCommand` that touches `$out` when the
   assertions hold.
   → verify by `nix flake check` passing, and by temporarily reverting step 3's
   default to confirm the check can actually fail.

   **Deviation, applied during implementation.** As specified, the check passed
   `agents = [ "claude" "codex" ]` as a literal, so nothing in the suite
   verified the module's *actual* default — and step 3's own verification was
   only "read the two lines back". A check asserting against a copy of the value
   under test cannot notice that value drifting, which is precisely the class of
   bug this issue is about, and it made this step's own failure test incoherent.
   The check now reads `options.services.nixi.agents.default` from the module
   and asserts it equals `[ "claude" "codex" ]`. Reading `options` needs no Home
   Manager evaluation, so the spec's "no extra flake input" constraint holds.

   Confirmed failing as required: with the old conditional default restored, the
   check fails with `list of size '1' is not equal to list of size '2', left
   hand side is '[ "codex" ]'` — i.e. it reproduces the reported bug exactly,
   because `legacyPackages` reads `allowUnfree = false`. This check would have
   caught the original defect.

6. **Pre-merge, not a code change**: check whether any nixarchy host relies on
   the *default* to drop claude rather than setting `services.nixi.agents`
   explicitly. Such a host will now warn and start pinning 651 MiB and should
   set the option instead.
   → verify by grepping the nixarchy config repo for `services.nixi.agents`;
   record the answer in the PR description.

   **Answered, and it came out the opposite of the assumption.** No nixarchy
   host is affected at all, because **nixarchy always defines the option
   itself** — `nixarchy/modules/home.nix:615-619`:

   ```nix
   services.nixi.agents = [ "opencode" "codex" ]
     ++ lib.optional (appEnabled "claude-code" || defaultAgent == "claude") "claude";
   ```

   An option's `default` applies only when nothing defines it, so nixi's default
   is never consulted on a nixarchy machine. p620 gets claude through
   `programs.nixarchy.defaultAgent = "claude"`
   (`hosts/p620/nixos/nixarchy.nix:96`), and its installed `nixi-node` already
   pins `claude-agent-acp-0.75.1`. It works today and this change does not touch
   it — no new closure, no warning, no behaviour change. razer is likewise
   unaffected; its `agents = [ "claude" ]` merges with nixarchy's list.

   So the population this fix reaches is **users of nixi's Home Manager module
   without nixarchy's module**, where the default is actually used. That matches
   issue #16's own report, which is from "a nixarchy predating the release that
   names the agents itself". The spec's 651 MiB risk stands as written — it is
   about machines on the default — but no host we control is one of them, and
   the open question about a release note is correspondingly smaller.

   **Method note, because it caused a false claim in the PR.** The first check
   used `which claude-agent-acp`, which proves nothing: the adapter is never on
   `PATH` by design, it is baked into `nixi-node` as `NIXI_CLAUDE_ACP_COMMAND`
   (as `hosts/p620/nixos/nixarchy.nix:91-92` says outright). The correct test is
   grepping the installed `bridge/nixi-node` wrapper for the pinned store path.

7. **`git commit`** each of steps 1-5 together as one change (they are not
   independently valid: step 3 without step 1 breaks eval on an unfree-refusing
   machine), citing the plan.

## Tests

```bash
# 1. The whole check suite, including the new module eval.
nix flake check

# 2. The probe, both ways, against the real file. Clearing the env var is not
#    optional: NIXPKGS_ALLOW_UNFREE=1 is set on this machine and makes the
#    unfree-refusing case silently pass.
env -u NIXPKGS_ALLOW_UNFREE -u NIXPKGS_CONFIG nix eval --impure --expr '
  let
    probe = allowUnfree:
      import ./nix/adapters.nix {
        lib = (import <nixpkgs> {}).lib;
        pkgs = import <nixpkgs> { config = { inherit allowUnfree; }; };
        agents = [ "claude" "codex" ];
      };
  in {
    refused = (probe false).claudeAcp == null;
    allowed = (probe true).claudeAcp != null;
    codex   = (probe false).codexAcp != null;
  }'
# expected: { allowed = true; codex = true; refused = true; }

# 3. The bridge must be untouched.
node --test bridge/harness-policy.test.js

# 4. The option docs show a list, not a rule.
grep -n allowUnfree nix/hm-module.nix     # expected: no output
```

Runtime proof, on the laptop from the report — the only evidence the user cares
about:

- After `nixarchy-apply`, `SUPER+H` opens the card on Claude with **no** change
  to `~/.config/omarchy/defaults/agent`, and the profile lists
  `claude-agent-acp`.
- On a machine refusing unfree: the rebuild prints `evaluation warning:` naming
  claude and the remedy, completes, and `SUPER+H` opens the card on an agent
  that starts.

## Rollback

Single commit, no migration, no state written anywhere: `git revert <sha>`
restores the previous default and deletes `nix/adapters.nix`. The only
user-visible consequence of reverting is that machines which allow unfree go
back to silently not pinning `claude-agent-acp` — i.e. back to the bug. Nothing
needs cleaning up, because nothing outside the store was changed.
