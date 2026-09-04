# Home Manager module for Nixi.
#
# The split that matters: everything Nix owns is STATIC (the programs, the UI,
# the bundled knowledge) and lives in the store; everything Nixi writes at
# runtime (the session token, the learning state, the fetched manual) stays a
# plain mutable directory under ~/.local/share/nixi. That is the same boundary
# the server already enforces with its descriptor-bound private-state code, so
# nothing here weakens it.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.nixi;
  pluginId = "io.github.olafkfreund.nixi";
  share = "${cfg.package}/share/nixi";

  # Voice dependencies belong to the PROGRAMS, not to one systemd unit.
  # `nixi` starts its own server whenever the health check fails, and that
  # copy inherits the user's interactive PATH -- so putting whisper only on
  # the unit gives voice that works from the service and silently does not
  # work from the launcher. Wrapping both binaries makes every entry point
  # carry what it needs, and pulls the packages into the user's closure so
  # enabling the option is genuinely all that is required.
  #
  # --set-default, not --set: NIXI_* from the environment still wins, so the
  # options stay overridable for testing without rebuilding.
  nixiPkg =
    if !cfg.voice.enable then cfg.package
    else
      pkgs.symlinkJoin {
        name = "${cfg.package.name}-voice";
        paths = [ cfg.package ];
        nativeBuildInputs = [ pkgs.makeWrapper ];
        postBuild = ''
          for p in nixi nixi-server; do
            rm -f "$out/bin/$p"
            makeWrapper ${cfg.package}/bin/"$p" "$out/bin/$p" \
              --prefix PATH : ${lib.makeBinPath [ cfg.voice.package pkgs.pipewire ]} \
              --set-default NIXI_WHISPER_MODEL ${lib.escapeShellArg "${cfg.voice.model}"} \
              --set-default NIXI_WHISPER_LANG ${lib.escapeShellArg cfg.voice.language} \
              --set-default NIXI_VOICE_SILENCE_RMS ${toString cfg.voice.silenceThreshold} \
              ${lib.optionalString (cfg.voice.prompt != "")
                "--set-default NIXI_WHISPER_PROMPT ${lib.escapeShellArg cfg.voice.prompt}"}
          done
        '';
      };

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
      Environment = [
        "PATH=${unitPath}"
        "NIXI_PORT=${toString cfg.port}"
      ];
      ExecStart = exec;
      Restart = "on-failure";
      RestartSec = 2;
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };
in
{
  options.services.nixi = {
    enable = lib.mkEnableOption "Nixi, the nixarchy guide widget";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.nixi;
      defaultText = lib.literalExpression "nixi.packages.\${system}.nixi";
      description = "The Nixi package to use.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8642;
      description = ''
        Loopback port for the widget server. Only reachable from this machine,
        and every state-touching request additionally needs the per-session
        token, so this is a convenience knob, not a security boundary.
      '';
    };

    barWidget.enable = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install the Quickshell bar widget into
        `~/.config/omarchy/plugins/${pluginId}` so Nixi gets a snowflake button
        in the top bar.
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
        answers the Nixi way outside the widget too.
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

    voice = {
      enable = lib.mkEnableOption ''
        push-to-talk voice input. The desktop records through PipeWire and
        whisper.cpp transcribes locally, so it behaves the same whichever
        browser opens the widget. The text only ever lands in the input box
        for you to check -- nothing is auto-sent, no audio leaves the machine
      '';

      package = lib.mkOption {
        type = lib.types.package;
        default = pkgs.whisper-cpp;
        defaultText = lib.literalExpression "pkgs.whisper-cpp";
        description = "Speech-to-text engine providing `whisper-cli`.";
      };

      model = lib.mkOption {
        type = lib.types.path;
        default = pkgs.fetchurl {
          url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
          hash = "sha256-oDd5yG3zMjB19eeWyyzlAp8A7Ihp7uP9+4l6/jbG0AI=";
        };
        defaultText = lib.literalExpression "fetchurl { ... ggml-base.en.bin }";
        description = ''
          ggml speech model. The default is `base.en` (148 MB, English) --
          a good accuracy/latency trade for short spoken questions. Swap in
          `ggml-small.en.bin` for better accuracy at roughly 3x the time, or
          `ggml-tiny.en.bin` on a slow machine. Models are not in nixpkgs, so
          this is a pinned `fetchurl`; set `language` too if you replace it
          with a multilingual model.
        '';
      };

      language = lib.mkOption {
        type = lib.types.str;
        default = "en";
        example = "auto";
        description = ''
          Spoken language passed to whisper, or "auto" to detect. Only
          meaningful with a multilingual model -- the default `.en` model
          understands English alone.
        '';
      };

      silenceThreshold = lib.mkOption {
        type = lib.types.ints.between 0 32767;
        default = 1100;
        description = ''
          RMS level below which a recording is treated as silence and never
          sent to the model. This is not a nicety: whisper does not return
          nothing when it hears nothing, it invents plausible sentences, and
          a fabricated question in the input box looks exactly like one you
          asked. Measured here, a quiet room through a real microphone is
          ~530 and speech is ~3500, out of a 32767 full scale.

          Raise it if a silent room still produces text; lower it if quiet
          speech is being dropped. Microphone gain is hardware, so the
          default cannot be right for every desk.
        '';
      };

      prompt = lib.mkOption {
        type = lib.types.str;
        default = "";
        example = "Words used here: nixarchy, kubectl, Grafana, my-project.";
        description = ''
          Initial prompt biasing the decoder's vocabulary. Empty keeps Nixi's
          built-in nixarchy word list, which matters more than it sounds:
          without it `base.en` transcribes "nixarchy" as "Nixaki". Set this to
          add jargon or names of your own.
        '';
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

      # Static assets, linked read-only out of the store. The server reads
      # these with bounded_read, which follows symlinks on purpose.
      xdg.configFile = {
        "nixi/ui.html".source = "${share}/ui.html";
        "nixi/faq.json".source = "${share}/faq.json";
        "nixi/KNOWLEDGE.md".source = "${share}/KNOWLEDGE.md";
        "nixi/CLAUDE.md".source = "${share}/CLAUDE.md";
        "nixi/AGENTS.md".source = "${share}/AGENTS.md";
        "nixi/SKILL.md".source = "${share}/skills/SKILL.md";
        "nixi/vendor".source = "${share}/vendor";
      };

      systemd.user.services.nixi = mkService {
        description = "Nixi widget server (offline manual answers + agent relay)";
        exec = "${nixiPkg}/bin/nixi-server";
      };

      # The mutable state directory is created up front with the private mode
      # the server insists on, so the first run never has to widen anything.
      home.activation.nixiStateDir =
        lib.hm.dag.entryAfter [ "writeBoundary" ] ''
          run mkdir -p -m 700 "$HOME/.local/share/nixi"
          run chmod 700 "$HOME/.local/share/nixi"
        '';
    }

    (lib.mkIf cfg.barWidget.enable {
      xdg.configFile = {
        "omarchy/plugins/${pluginId}/manifest.json".source =
          "${share}/plugin/manifest.json";
        "omarchy/plugins/${pluginId}/BarWidget.qml".source =
          "${share}/plugin/BarWidget.qml";
        "omarchy/plugins/${pluginId}/nixi-launch".source =
          "${share}/plugin/nixi-launch";
      };
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
