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

      # `nix run github:olafkfreund/nixi-nixarchy` opens the widget without
      # installing anything.
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

        # The behavioural self-check: updater precedence, offline search,
        # the learned-fact broker, and the invariant that no Omarchy runtime
        # integration point was renamed. Needs git and a writable HOME.
        selfcheck = pkgs.runCommand "nixi-selfcheck"
          { nativeBuildInputs = [ pkgs.python3 pkgs.git ]; } ''
          cp -r ${./.} src && chmod -R u+w src && cd src
          export HOME=$(mktemp -d) && mkdir -p "$HOME/.cache"
          git init -q . && git add -A
          python3 tools/test_nixi.py
          touch $out
        '';

      });

      formatter = forAllSystems (pkgs: pkgs.nixpkgs-fmt);
    };
}
