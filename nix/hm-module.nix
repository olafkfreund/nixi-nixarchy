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
  # An agent left out of the list resolves from PATH at runtime instead.
  nixiPkg = cfg.package.override {
    claudeAcp = if lib.elem "claude" cfg.agents then pkgs.claude-agent-acp else null;
    codexAcp = if lib.elem "codex" cfg.agents then pkgs.codex-acp else null;
    opencodeAcp = if lib.elem "opencode" cfg.agents then pkgs.opencode else null;
  };
  share = "${nixiPkg}/share/nixi";
  plugins = "${nixiPkg}/share/omarchy/plugins";

  # Units run with a bare PATH; give them the user profile and the system
  # profile so `omarchy`, `nixarchy` and the chosen agent binary resolve.
  unitPath = lib.concatStringsSep ":" [
    "%h/.nix-profile/bin"
    "/etc/profiles/per-user/%u/bin"
    "/run/current-system/sw/bin"
    "%h/.local/bin"
  ];

  mkService = { description, exec, ... }: {
    Unit = {
      Description = description;
      PartOf = [ "graphical-session.target" ];
      After = [ "graphical-session.target" ];
    };
    Service = {
      Type = "exec";
      Environment = [ "PATH=${unitPath}" ];
      ExecStart = exec;
      Restart = "on-failure";
      RestartSec = 2;
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };
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
      description = "The Nixi package to use.";
    };

    agents = lib.mkOption {
      type = lib.types.listOf (lib.types.enum [ "claude" "codex" "opencode" ]);
      default = [ "claude" "codex" ];
      example = [ "claude" "codex" "opencode" ];
      description = ''
        Agents whose ACP adapters are pinned into Nixi from your `pkgs`:
        `claude-agent-acp`, `codex-acp`, or `opencode` (which speaks ACP itself).
        `claude-agent-acp` depends on the unfree `claude-code`, so the default
        needs `allowUnfree`; set `[ ]` or `[ "codex" "opencode" ]` to avoid it.
        An agent not listed is still usable if its adapter is on `PATH`.
      '';
    };

    barWidget.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install the snowflake bar button, a separate plugin
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

      # A 0.9.x install left a real directory where the plugin link now goes,
      # which would fail checkLinkTargets; see the script for what it removes.
      home.activation.nixiOldPluginDir =
        lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
          DRY_RUN=''${DRY_RUN:+1} ${pkgs.bash}/bin/bash ${./migrate-plugin-dir.sh} \
            "${config.xdg.configHome}/omarchy/plugins/${pluginId}"
        '';

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
            icon = "󰘥";
            label = "Help";
            description = "Ask anything about nixarchy";
            action = "nixi";
            aliases = [ "how" "nixi" "ayuda" ];
          };
        });
    })

    (lib.mkIf cfg.skill.enable {
      home.file.".claude/skills/nixi/SKILL.md".source = "${share}/skills/SKILL.md";
    })

    (lib.mkIf cfg.watcher.enable {
      systemd.user.services.nixi-watch = mkService {
        description = "Nixi tip watcher (at most one suggestion per day)";
        exec = "${nixiPkg}/bin/nixi-watch";
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
