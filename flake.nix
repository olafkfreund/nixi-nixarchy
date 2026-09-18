{
  description = "Nixi — an offline-first guide, tour and AI tutor for nixarchy";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: rec {
        nixi = pkgs.callPackage ./nix/package.nix { };
        default = nixi;
      });

      # `nix run github:olafkfreund/nixi-nixarchy` opens the card, if the Nixi
      # plugin is installed and enabled in the running Omarchy shell.
      apps = forAllSystems (pkgs: rec {
        nixi = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.nixi}/bin/nixi";
        };
        default = nixi;
      });

      # The supported way in. `homeManagerModules` is the older spelling and
      # is kept as an alias so either name works.
      homeModules.default = import ./nix/hm-module.nix self;
      homeManagerModules.default = self.homeModules.default;

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [ python3 curl jq nixpkgs-fmt ];
          shellHook = ''
            echo "nixi dev shell — ./install.sh for an imperative install,"
            echo "                 nix build .#nixi for the packaged one."
          '';
        };
      });

      checks = forAllSystems (pkgs: {
        # Building the package runs its installCheckPhase (py_compile on every
        # program, bash -n on the launcher, assets non-empty).
        package = self.packages.${pkgs.stdenv.hostPlatform.system}.nixi;

        # The behavioural self-check: updater precedence, offline search, tour
        # and search data, portability, and the invariant that no Omarchy
        # runtime integration point was renamed. Needs git and a writable HOME.
        selfcheck = pkgs.runCommand "nixi-selfcheck"
          { nativeBuildInputs = [ pkgs.python3 pkgs.git ]; } ''
          cp -r ${./.} src && chmod -R u+w src && cd src
          export HOME=$(mktemp -d) && mkdir -p "$HOME/.cache"
          git init -q . && git add -A
          python3 tools/test_nixi.py
          touch $out
        '';

        # The agents default and its capability probe (#16). CI already builds
        # the module's activation package (.github/workflows/ci.yml), including
        # one configuration that sets no `agents` and so uses the default -- but
        # it only asserts that the default EVALUATES, never what it resolves to,
        # and it evaluates it with allowUnfree = false, where the old expression
        # happened to give the right answer. That is how a default that silently
        # pinned one agent fewer than asked for survived. This check asserts the
        # value, on both kinds of pkgs.
        #
        # legacyPackages cannot be reconfigured, so nixpkgs is imported twice
        # here to get a pkgs that allows unfree and one that refuses it. The
        # probe under test is the shipped nix/adapters.nix, not a copy.
        hm-module-eval =
          let
            system = pkgs.stdenv.hostPlatform.system;
            # The module's OWN default, not a copy of it: a check that asserts
            # against a literal cannot notice the default drifting, which is the
            # class of bug this is here to catch. Reading `options` needs no
            # Home Manager evaluation, so no extra flake input.
            agents = (self.homeModules.default {
              config = { };
              inherit (nixpkgs) lib;
              inherit pkgs;
            }).options.services.nixi.agents.default;
            probe = allowUnfree: import ./nix/adapters.nix {
              inherit (nixpkgs) lib;
              inherit agents;
              pkgs = import nixpkgs { inherit system; config = { inherit allowUnfree; }; };
            };
            refused = probe false;
            allowed = probe true;
          in
          assert agents == [ "claude" "codex" ];  # the default is unconditional (#16)
          assert refused.claudeAcp == null;      # unfree refused: skipped, not an eval error
          assert refused.codexAcp != null;       # ... and the free adapter is still pinned
          assert allowed.claudeAcp != null;      # unfree allowed: pinned, whatever config says
          pkgs.runCommand "nixi-hm-module-eval" { } "touch $out";

      });

      formatter = forAllSystems (pkgs: pkgs.nixpkgs-fmt);
    };
}
