# Which ACP adapters can this `pkgs` actually produce?
#
# Asked by EVALUATING each adapter, not by inspecting configuration.
# `pkgs.config.allowUnfree` answers "how was this pkgs constructed", which is a
# different question: Home Manager can be handed a pkgs that reads false on a
# machine where unfree installs perfectly well, and the old default silently
# pinned one agent fewer than asked for (#16).
#
# An agent that cannot be pinned becomes null, which is already the "resolve the
# adapter from PATH at runtime" case (see nix/package.nix), so it degrades to a
# working card rather than an eval error -- refusing unfree stays a supported
# configuration. It warns, because the failure this replaces was silent until
# the user pressed the help key.
#
# tryEval catches the unfree refusal. It does NOT catch a missing attribute, so
# the `?` guard has to come first or an older nixpkgs fails eval outright.
{ lib, pkgs, agents }:

let
  adapterFor = agent: attribute:
    if !(lib.elem agent agents) then null
    else if !(pkgs ? ${attribute}) then
      lib.warn
        ("Nixi cannot pin ${attribute} for the ${agent} agent: your nixpkgs has no such package. "
          + "${agent} still works if its adapter is on PATH. "
          + "Set services.nixi.agents to the agents you want to silence this.")
        null
    else if !(builtins.tryEval pkgs.${attribute}.outPath).success then
      lib.warn
        ("Nixi cannot pin ${attribute} for the ${agent} agent: it does not evaluate in this "
          + "configuration, most often because it is unfree or depends on something unfree. "
          + "Allow it (nixpkgs.config.allowUnfree, or an allowUnfreePredicate for just this "
          + "package), or set services.nixi.agents to the agents you want. "
          + "${agent} still works if its adapter is on PATH.")
        null
    else pkgs.${attribute};
in
{
  claudeAcp = adapterFor "claude" "claude-agent-acp";
  codexAcp = adapterFor "codex" "codex-acp";
  # OpenCode speaks ACP itself; the package is its own adapter.
  opencodeAcp = adapterFor "opencode" "opencode";
}
