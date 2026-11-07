# Home Manager module for Nixi.
#
# The split that matters: everything Nix owns is STATIC (the overlay plugin, the
# bridge, the bundled knowledge) and lives in the store; everything Nixi writes
# at runtime (the learning state, LEARNED.md, the fetched manual) stays a plain
# mutable directory under ~/.local/share/nixi.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.nixi;
  pluginId = "io.github.olafkfreund.nixi";

  # The agents' ACP adapters come from the USER's pkgs, so the unfree decision
  # (claude-agent-acp pulls in claude-code) stays in the user's own config.
  # An agent left out of the list -- or one this pkgs cannot build, which
  # adapters.nix warns about -- resolves from PATH at runtime instead.
  nixiPkg = cfg.package.override (import ./adapters.nix {
    inherit lib pkgs;
    agents = cfg.agents;
  } // {
    # ai-mirror is not in nixpkgs; it ships from its own flake, so the user
    # passes the package in. Null means Nixi never offers desktop control.
    aiMirror = cfg.aiMirror.package;
  });
  share = "${nixiPkg}/share/nixi";
  companionPkg = cfg.companion.package.override {
    nixiBridge = [ "${plugins}/${pluginId}/bridge/nixi-node" "${plugins}/${pluginId}/bridge/bridge.js" ];
    # Companion plugins are linked into the package, not passed as an environment variable: stage plugins are
    # programs Nixi launches, and the environment must not be able to change what Nixi launches (#76, #149).
    plugins = map (p: if lib.isDerivation p then p else cfg.companion.package.mkCompanionPlugin {
      src = p;
      pname = "nixi-plugin-${baseNameOf p}";
    }) cfg.companion.plugins;
  };
  plugins = "${nixiPkg}/share/omarchy/plugins";

  # Units run with a bare PATH; give them the user profile and the system
  # profile so `omarchy`, `nixarchy` and the chosen agent binary resolve.
  unitPath = lib.concatStringsSep ":" [
    "%h/.nix-profile/bin"
    "/etc/profiles/per-user/%u/bin"
    "/run/current-system/sw/bin"
    "%h/.local/bin"
  ];

in
{
  imports = [
    (lib.mkRemovedOptionModule [ "services" "nixi" "port" ]
      "Nixi no longer runs a local server: the card is an Omarchy overlay.")
    (lib.mkRemovedOptionModule [ "services" "nixi" "voice" ]
      "Nixi's voice input was removed; use Omarchy's built-in dictation.")
  ];

  options.services.nixi = {
    enable = lib.mkEnableOption "Nixi, the nixarchy guide (an Omarchy overlay card)";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.nixi;
      defaultText = lib.literalExpression "nixi.packages.\${system}.nixi";
      description = ''
        The Nixi package to use.

        This is also where a locally built ACP adapter goes. The adapter and
        grounding commands are pinned into the package at build time and
        cannot be redirected with `NIXI_*_COMMAND` environment variables
        (#76): the environment must not be able to change what Nixi launches
        as the agent, because the trust levels and permission rules are
        enforced by the bridge against whatever it spawned.

        ```nix
        services.nixi.package = pkgs.nixi.override { claudeAcp = myBuild; };
        ```

        An install that resolves its adapter from `PATH` rather than from Nix
        is unaffected.
      '';
    };

    agents = lib.mkOption {
      type = lib.types.listOf (lib.types.enum [ "claude" "codex" "opencode" ]);
      # The agents Nixi wants, stated unconditionally. Whether this machine can
      # actually build each one is a separate question, asked and reported by
      # nix/adapters.nix rather than folded invisibly into this list (#16).
      default = [ "claude" "codex" ];
      example = [ "claude" "codex" "opencode" ];
      description = ''
        Agents whose ACP adapters are pinned into Nixi from your `pkgs`:
        `claude-agent-acp`, `codex-acp`, or `opencode` (which speaks ACP itself).
        Claude Code is Nixi's default agent. An agent listed here whose adapter
        this configuration cannot build -- `claude-agent-acp` depends on the
        unfree `claude-code`, so it needs unfree to be allowed -- is skipped
        with a warning at rebuild time rather than failing the build. An agent
        not pinned, whether skipped or simply not listed, is still usable if its
        adapter is on `PATH`.
      '';
    };

    aiMirror.package = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = null;
      example = lib.literalExpression "inputs.ai-mirror.packages.\${pkgs.system}.default";
      description = ''
        The `ai-mirror` package that lets Nixi drive the desktop, or `null` to
        leave desktop control off entirely (the default).

        ai-mirror is not in nixpkgs, so the package comes from your own config,
        the same way the ACP adapters do. Setting it does NOT hand the agent
        your desktop: the server is attached only in **Mechanic**, never at
        Guide, and only on agents whose permission path Nixi has verified
        (today, Claude). ai-mirror then asks for control on your desktop
        itself, and `SUPER+SHIFT+ESCAPE` revokes it.
      '';
    };

    companion = {
      enable = lib.mkEnableOption
        "the snowflake desktop companion (a Void fork), driven through Nixi's bridge";

      peers = lib.mkOption {
        type = lib.types.listOf (lib.types.submodule {
          options = {
            name = lib.mkOption {
              type = lib.types.str;
              description = "The peer's host name, as shown on the fleet board.";
            };
            address = lib.mkOption {
              type = lib.types.str;
              description = "The peer's tailnet IPv4 address (100.64.0.0/10). Not a host name: a short name can resolve to the LAN, and the companion refuses any address outside the tailnet.";
            };
            port = lib.mkOption {
              type = lib.types.port;
              default = 9188;
              description = "The peer's `nixi-status` port.";
            };
          };
        });
        default = [ ];
        example = lib.literalExpression ''[ { name = "razer"; address = "100.90.72.124"; } ]'';
        description = ''
          The other hosts whose status the companion shows on its fleet board.
          Normally this is derived from the NixOS fleet list, not typed by
          hand. Written to `~/.config/nixi-companion/peers.json` only when
          non-empty, and then {option}`services.nixi.companion.peerTokenFile`
          must be set.
        '';
      };

      peerTokenFile = lib.mkOption {
        type = lib.types.nullOr (lib.types.pathWith { inStore = false; absolute = true; });  # a store path is world-readable
        default = null;
        example = "/run/agenix/nixi-status-token";
        description = ''
          File holding the token the peers' `nixi-status` expects. Only the
          path is written to `peers.json`; the companion reads the file at
          runtime. Pass a runtime path (e.g. an agenix secret), never a store
          path: the token would become world-readable.
        '';
      };

      package = lib.mkOption {
        type = lib.types.nullOr lib.types.package;
        default = null;
        example = lib.literalExpression "inputs.nixoarchy-snowflake.packages.\${pkgs.system}.default";
        description = ''
          The companion package, from the `olafkfreund/nixoarchy-snowflake`
          flake. It is not in nixpkgs, so it comes from your own config, the
          same way {option}`services.nixi.aiMirror.package` does.

          Nixi rebuilds it with its bridge pinned in: everything the snowflake
          asks goes through the same bridge, trust level and permission rules
          as the card, and the environment cannot point it elsewhere (#77).
          Void's own Claude runner, trust modes, self-updater and history are
          off in this build.
        '';
      };

      plugins = lib.mkOption {
        # A package, or a path literal (copied into the store and checked at build time). A string is refused:
        # it would name a folder outside the store, which the build cannot check.
        type = lib.types.listOf (lib.types.either lib.types.package (lib.types.addCheck lib.types.path builtins.isPath));
        default = [ ];
        example = lib.literalExpression "[ inputs.nixoarchy-snowflake.legacyPackages.\${pkgs.system}.examples.party-hat-plus ]";
        description = ''
          Companion plugins: folders with a `plugin.json` (quip packs,
          notification maps, SVG props, and programs that fill a stage). Each
          is linked into the companion package, so what Nixi can load is fixed
          at build time and the environment cannot add to it. Build one with
          `inputs.nixoarchy-snowflake.lib.''${pkgs.system}.mkCompanionPlugin
          { src = ./my-plugin; pname = "my-plugin"; }`, which checks the
          manifest and fails the build if it is wrong.

          Every plugin starts off. Turn it on in Settings > More > Plugins;
          plugins that run programs also ask for your permission there, and
          run in a sandbox. Nixi never downloads a plugin or an update.
          Plugins you copy by hand into
          `~/.local/share/nixi-companion/plugins/` are found too.
        '';
      };

      commandDone = {
        enable = lib.mkEnableOption ''
          a "done" notification when a long shell command finishes in a terminal
          you are not looking at. It reaches the desktop as an ordinary
          notification (app `nixi-job`), so the shell, the companion's takeover
          and its give-back apply unchanged. Only the command's first word and
          its duration are sent, never the command line. Needs
          `programs.bash.enable` and/or `programs.zsh.enable`'';
        seconds = lib.mkOption {
          type = lib.types.ints.positive;
          default = 30;
          description = "The shortest command, in seconds, that earns a notification.";
        };
      };

      echoCancel.enable = lib.mkEnableOption ''
        a PipeWire WebRTC echo-cancellation module that adds the source
        `nixi-echo-cancel-source` (`~/.config/pipewire/pipewire.conf.d/61-nixi-echo-cancel.conf`).
        It does not select it as the companion's microphone, and needs a
        PipeWire restart or a new login to appear'';
    };

    autoEnable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Turn the Nixi card (and the bar button) on in the Omarchy shell on the
        first activation, so `nixi`, SUPER+H and the Help row work without a
        visit to Setup > Plugins. Happens once per home: turning the card off
        later is respected. A missing `shell.json` is created from Omarchy's
        defaults, as the shell itself would.
      '';
    };

    barWidget.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install the sparkles bar button, a separate plugin
        `${pluginId}-button` (Omarchy gives a third-party plugin a bar widget or
        an overlay, never both). Installed is not enabled: turn it on once in
        Setup > Plugins, like the card itself.
      '';
    };

    menuEntry.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Manage `~/.config/omarchy/extensions/omarchy-menu.jsonc` so "Help"
        appears in the Omarchy menu (SUPER+SPACE).

        Off by default because this makes Nix the owner of that whole file:
        Home Manager will refuse to clobber one you already wrote by hand, and
        any entries you add there yourself would have to move into
        {option}`services.nixi.menuEntry.extraEntries`.
      '';
    };

    menuEntry.extraEntries = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf lib.types.anything);
      default = { };
      example = lib.literalExpression ''
        { notes = { icon = "N"; label = "Notes"; action = "obsidian"; }; }
      '';
      description = "Your own menu entries, merged alongside Nixi's.";
    };

    watcher.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        A background service that notices which nixarchy features you already
        use and offers at most one tip a day. Nothing leaves the machine.
      '';
    };

    skill.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install the Nixi tutor skill into `~/.claude/skills/nixi` so your agent
        answers the Nixi way outside the card too.
      '';
    };

    manual = {
      autoUpdate = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Refresh the local copy of the nixarchy + Omarchy manuals on a weekly
          timer. This is the only part of Nixi that talks to the network, and
          it only ever fetches from the two pinned GitHub repositories.
        '';
      };
      onCalendar = lib.mkOption {
        type = lib.types.str;
        default = "weekly";
        description = "systemd calendar expression for the refresh timer.";
      };
    };

    omarchyHooks.enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Install the Omarchy lifecycle hooks: a one-time first-boot welcome and
        a manual refresh after each `omarchy update`.
      '';
    };
  };

  config = lib.mkIf cfg.enable (lib.mkMerge [
    {
      home.packages = [ nixiPkg ];

      xdg.configFile = {
        # The card: the whole plugin directory as one store symlink, the way
        # nixarchy installs its own plugins. Installed, not enabled -- that
        # lives in the shell's own shell.json, which nothing here writes.
        "omarchy/plugins/${pluginId}".source = "${plugins}/${pluginId}";

        # Knowledge the agent is grounded in. The bridge starts the agent in
        # ~/.config/nixi, so CLAUDE.md/AGENTS.md there are its tutor brief.
        "nixi/faq.json".source = "${share}/faq.json";
        "nixi/KNOWLEDGE.md".source = "${share}/KNOWLEDGE.md";
        "nixi/CLAUDE.md".source = "${share}/CLAUDE.md";
        "nixi/AGENTS.md".source = "${share}/AGENTS.md";
        "nixi/SKILL.md".source = "${share}/skills/SKILL.md";
      };

      # Enable the card once (nixarchy#709); see the script for the rules.
      home.activation.nixiEnableCard = lib.mkIf cfg.autoEnable
        (lib.hm.dag.entryAfter [ "linkGeneration" ] ''
          if [[ -z "''${DRY_RUN:-}" ]]; then
            ${pkgs.python3}/bin/python3 ${./enable-card.py} \
              "${config.xdg.configHome}/omarchy/shell.json" \
              "${config.xdg.stateHome}/nixi/enabled-once" \
              ${pluginId} "${lib.optionalString cfg.barWidget.enable "${pluginId}-button"}" \
              /run/current-system/sw/share/omarchy/config/omarchy/shell.json \
              /etc/profiles/per-user/${config.home.username}/share/omarchy/config/omarchy/shell.json
          fi
        '');

      # The mutable state directory is created up front with a private mode,
      # so the first run never has to widen anything.
      home.activation.nixiStateDir =
        lib.hm.dag.entryAfter [ "writeBoundary" ] ''
          run mkdir -p -m 700 "$HOME/.local/share/nixi"
          run chmod 700 "$HOME/.local/share/nixi"
        '';
    }

    (lib.mkIf cfg.barWidget.enable {
      xdg.configFile."omarchy/plugins/${pluginId}-button".source = "${plugins}/${pluginId}-button";
    })

    (lib.mkIf cfg.menuEntry.enable {
      xdg.configFile."omarchy/extensions/omarchy-menu.jsonc".text =
        builtins.toJSON (cfg.menuEntry.extraEntries // {
          help = {
            icon = "󰙴";
            label = "Help";
            description = "Ask anything about nixarchy";
            action = "nixi";
            aliases = [ "how" "nixi" "ayuda" ];
          };
        });
    })

    (lib.mkIf cfg.companion.enable {
      assertions = [{
        assertion = cfg.companion.package != null;
        message = "services.nixi.companion.package must be set: the companion is not in nixpkgs (see its option description).";
      }] ++ lib.optional (cfg.companion.peers != [ ] && cfg.companion.peerTokenFile == null) {
        assertion = false;
        message = "services.nixi.companion.peerTokenFile must be set when services.nixi.companion.peers is not empty.";
      };
      xdg.configFile."nixi-companion/peers.json" = lib.mkIf (cfg.companion.peers != [ ]) {
        text = builtins.toJSON {
          peers = map (p: { inherit (p) name address port; }) cfg.companion.peers;
          token_file = toString cfg.companion.peerTokenFile;
        };
      };
      xdg.configFile."pipewire/pipewire.conf.d/61-nixi-echo-cancel.conf" = lib.mkIf cfg.companion.echoCancel.enable {
        text = ''
          # Generated by services.nixi.companion.echoCancel. Edits are overwritten.
          context.modules = [
            {
              name = libpipewire-module-echo-cancel
              # A missing or failing module must never stop PipeWire at login.
              flags = [ ifexists nofail ]
              args = {
                library.name = aec/libspa-aec-webrtc
                # The default sink's monitor is the reference; the capture side follows the default source.
                monitor.mode = true
                capture.props = {
                  node.name = "nixi-echo-cancel-capture"
                }
                source.props = {
                  node.name = "nixi-echo-cancel-source"
                  node.description = "Nixi echo-cancelled mic"
                }
                sink.props = {
                  node.name = "nixi-echo-cancel-sink"
                  node.description = "Nixi echo canceller (not an output)"
                }
              }
            }
          ]
        '';
      };
      # nixi-node, not a bare node: it carries the pinned adapters and grounding command (#76).
      home.packages = lib.optional (cfg.companion.package != null) companionPkg;
      # Omarchy runs theme-set.d hooks on every `omarchy theme set`: the snowflake recolours live.
      xdg.configFile."omarchy/hooks/theme-set.d/nixi-companion" = lib.mkIf (cfg.companion.package != null) {
        executable = true;
        text = ''
          #!/bin/sh
          exec ${companionPkg}/bin/nixi-companion theme-changed
        '';
      };
      # A companion still running from an older build is restarted into this one (plan S21).
      # Through the user manager: activation has no WAYLAND_DISPLAY / HYPRLAND_INSTANCE_SIGNATURE.
      # Forking: the wrapper exits once server and window are up, and they must outlive it.
      home.activation.nixiCompanionRestart = lib.mkIf (cfg.companion.package != null)
        (lib.hm.dag.entryAfter [ "linkGeneration" ] ''
          if ${pkgs.procps}/bin/pgrep -af 'python[^ ]* [^ ]*nixi-companion/app/server\.py' \
              | ${pkgs.gnugrep}/bin/grep -vqF "${companionPkg}/"; then
            run ${pkgs.systemd}/bin/systemd-run --user --collect --no-block --quiet -p Type=forking \
              ${companionPkg}/bin/nixi-companion restart || true
          fi
        '');
    })

    # Hooks every interactive bash and zsh (HM appends these only when the shell program is enabled).
    (lib.mkIf cfg.companion.commandDone.enable (
      let
        hook = ''
          NIXI_JOB_SECONDS=${toString cfg.companion.commandDone.seconds}
          . ${share}/command-done.sh
        '';
      in
      {
        programs.bash.initExtra = lib.mkAfter hook;
        programs.zsh.initContent = lib.mkAfter hook;
      }
    ))

    (lib.mkIf cfg.skill.enable {
      home.file.".claude/skills/nixi/SKILL.md".source = "${share}/skills/SKILL.md";
    })

    (lib.mkIf cfg.watcher.enable {
      systemd.user.services.nixi-watch = {
        Unit = {
          Description = "Nixi tip watcher (at most one suggestion per day)";
          PartOf = [ "graphical-session.target" ];
          After = [ "graphical-session.target" ];
        };
        Service = {
          Type = "exec";
          Environment = [ "PATH=${unitPath}" ];
          ExecStart = "${nixiPkg}/bin/nixi-watch";
          Restart = "on-failure";
          RestartSec = 2;
        };
        Install.WantedBy = [ "graphical-session.target" ];
      };
    })

    (lib.mkIf cfg.manual.autoUpdate {
      systemd.user.services.nixi-manual = {
        Unit.Description = "Refresh Nixi's local nixarchy + Omarchy manual copy";
        Service = {
          Type = "oneshot";
          Environment = [ "PATH=${unitPath}" ];
          ExecStart = "${nixiPkg}/bin/nixi-update-manual";
        };
      };
      systemd.user.timers.nixi-manual = {
        Unit.Description = "Weekly refresh of Nixi's manual copy";
        Timer = {
          OnCalendar = cfg.manual.onCalendar;
          Persistent = true;
          RandomizedDelaySec = "6h";
        };
        Install.WantedBy = [ "timers.target" ];
      };
    })

    (lib.mkIf cfg.omarchyHooks.enable {
      xdg.configFile = {
        "omarchy/hooks/post-boot.d/nixi-welcome.hook".source =
          "${share}/hooks/nixi-welcome.hook";
        "omarchy/hooks/post-update.d/nixi-manual-refresh.hook".source =
          "${share}/hooks/nixi-manual-refresh.hook";
      };
    })
  ]);
}
