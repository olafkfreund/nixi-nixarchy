{ lib
, stdenv
, stdenvNoCC
, buildNpmPackage
, autoPatchelfHook
, nodejs-slim
, gjs
, fd
, glib
, python3
, bash
, curl
, coreutils
, makeWrapper
  # Agent adapters are NOT bundled (see bridge/harness-policy.js resolveAdapter).
  # Pass nixpkgs' claude-agent-acp / codex-acp here to pin them; left null, the
  # bridge resolves them from PATH at runtime. The Home Manager module passes the
  # user's own packages in, so the unfree decision stays in the user's config and
  # `nix build .#nixi` never needs allowUnfree.
, claudeAcp ? null
, codexAcp ? null
  # OpenCode speaks ACP itself (`opencode acp`); nixpkgs' opencode is MIT.
, opencodeAcp ? null
}:

let
  pluginId = "io.github.olafkfreund.nixi";
  version = (builtins.fromJSON (builtins.readFile ../manifest.json)).version;

  # The bridge's node_modules, built from the lockfile alone so that editing the
  # bridge's JavaScript does not invalidate npmDepsHash. After the adapters were
  # dropped every dependency is MIT or Apache-2.0.
  bridgeModules = buildNpmPackage {
    pname = "nixi-bridge-modules";
    inherit version;
    src = lib.fileset.toSource {
      root = ../bridge;
      fileset = lib.fileset.unions [ ../bridge/package.json ../bridge/package-lock.json ];
    };
    npmDepsHash = "sha256-mP8ZEQrwoNK2+OzSyDUJlWsXBKdN9eKF9BHdcR3Sm/U=";
    dontNpmBuild = true;
    # @ff-labs/fff-node and @yuuang/ffi-rs ship prebuilt shared objects. They
    # happen to load on a machine with nix-ld; autoPatchelf makes them load from
    # the store without depending on that.
    nativeBuildInputs = [ autoPatchelfHook ];
    buildInputs = [ stdenv.cc.cc.lib ];
    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r node_modules $out/node_modules
      runHook postInstall
    '';
  };

  # The node the plugin runs everything with. When adapters are given, their
  # store paths become the bridge's defaults; --set-default keeps NIXI_* from the
  # environment in charge.
  adapterFlags = lib.concatStringsSep " " (
    lib.optional (claudeAcp != null)
      "--set-default NIXI_CLAUDE_ACP_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${claudeAcp}/bin/claude-agent-acp" ])}"
    ++ lib.optional (codexAcp != null)
      "--set-default NIXI_CODEX_ACP_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${codexAcp}/bin/codex-acp" ])}"
    ++ lib.optional (opencodeAcp != null)
      "--set-default NIXI_OPENCODE_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${opencodeAcp}/bin/opencode" "acp" ])}"
  );
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "nixi";
  inherit version;

  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let base = baseNameOf path; in
      !(lib.hasSuffix ".png" base || lib.hasSuffix ".gif" base
        || base == ".git" || base == "result");
  };

  nativeBuildInputs = [ makeWrapper ];
  # patchShebangs resolves interpreters (node, gjs) from these.
  buildInputs = [ nodejs-slim gjs ];

  # Nothing to compile: this is stdlib Python plus a bash launcher. The build
  # only places files and pins the interpreters, so the closure stays tiny.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/nixi $out/share/nixi/skills

    # The four programs. Python ones get a real interpreter; the launcher
    # needs curl and a shell.
    for p in nixi-server nixi-watch nixi-update-manual nixi-context; do
      install -Dm755 bin/$p $out/bin/$p
      substituteInPlace $out/bin/$p \
        --replace-fail '#!/usr/bin/env python3' '#!${python3}/bin/python3'
    done
    # nixi-server is also started directly (the systemd unit, a bare `nix run`
    # of it), so it must find the bundled assets on its own rather than only
    # when the launcher exported them.
    wrapProgram $out/bin/nixi-server \
      --set-default NIXI_FALLBACK_DIR $out/share/nixi
    # The overlay's bridge runs nixi-context before every prompt; with nothing
    # in ~/.config/nixi it must still find the bundled knowledge.
    wrapProgram $out/bin/nixi-context \
      --set-default NIXI_FALLBACK_DIR $out/share/nixi

    install -Dm755 bin/nixi $out/bin/nixi
    substituteInPlace $out/bin/nixi \
      --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'
    # $out/bin must be on PATH so `nix run` can reach nixi-server, and the
    # bundled assets must be findable when nothing was installed into
    # ~/.config/nixi. --set-default keeps a real install in charge.
    wrapProgram $out/bin/nixi \
      --prefix PATH : ${lib.makeBinPath [ curl coreutils python3 ]}:$out/bin \
      --set-default NIXI_FALLBACK_DIR $out/share/nixi

    # Static assets the server reads at runtime (the HM module links these
    # into ~/.config/nixi; bounded_read follows symlinks by design).
    install -Dm644 share/ui.html      $out/share/nixi/ui.html
    install -Dm644 share/faq.json     $out/share/nixi/faq.json
    install -Dm644 share/KNOWLEDGE.md $out/share/nixi/KNOWLEDGE.md
    install -Dm644 share/CLAUDE.md    $out/share/nixi/CLAUDE.md
    install -Dm644 share/AGENTS.md    $out/share/nixi/AGENTS.md
    for v in share/vendor/*.js; do
      install -Dm644 "$v" $out/share/nixi/vendor/"$(basename "$v")"
    done

    install -Dm644 skills/nixi/SKILL.md $out/share/nixi/skills/SKILL.md

    # Bar-widget plugin payload (Quickshell QML + manifest + launcher).
    install -Dm644 manifest.json  $out/share/nixi/plugin/manifest.json
    install -Dm644 button/BarWidget.qml $out/share/nixi/plugin/BarWidget.qml
    install -Dm755 nixi-launch    $out/share/nixi/plugin/nixi-launch
    substituteInPlace $out/share/nixi/plugin/nixi-launch \
      --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'

    # Omarchy lifecycle hooks (opt-in via the module).
    for h in hooks/*.hook; do
      install -Dm755 "$h" $out/share/nixi/hooks/"$(basename "$h")"
      substituteInPlace $out/share/nixi/hooks/"$(basename "$h")" \
        --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'
    done

    # ---- the native overlay plugin (omarchy-ask based, issue #8) ------------
    # Additive for now: the old widget above stays until the overlay replaces it
    # (plan step 16), so the Home Manager module keeps evaluating meanwhile.
    plugin=$out/share/omarchy/plugins/${pluginId}
    install -Dm644 manifest.json $plugin/manifest.json
    for q in Ask.qml Conversation.qml HarnessSelector.qml MenuSearch.qml MotionTuner.qml Tour.qml; do
      install -Dm644 "$q" "$plugin/$q"
    done
    # Tour logic shared with the node tests, and the tour/learning data.
    install -Dm644 TourModel.js $plugin/TourModel.js
    install -Dm644 share/tour.json $plugin/share/tour.json
    install -Dm644 share/learn.json $plugin/share/learn.json
    # The FAQ is searchable from the card, so it ships beside the QML.
    install -Dm644 share/faq.json $plugin/share/faq.json
    for js in bridge/*.js; do
      case "$js" in *.test.js|*/model-smoke.js) ;; *) install -Dm644 "$js" "$plugin/$js" ;; esac
    done
    install -Dm644 bridge/package.json $plugin/bridge/package.json
    cp -r ${bridgeModules}/node_modules $plugin/bridge/node_modules
    chmod -R u+w $plugin/bridge/node_modules
    # Omarchy refuses symlinks inside a plugin folder (`omarchy plugin validate`),
    # and npm's .bin links are CLI entry points the bridge never runs -- it
    # imports these packages as modules.
    rm -rf $plugin/bridge/node_modules/.bin
    # buildNpmPackage patches dependency shebangs (e.g. mathjs/bin/cli.js) to the
    # full nodejs it builds with, which drags npm and corepack into the closure
    # for CLIs the bridge never runs. Point every one at the runtime node instead,
    # so the next dependency that ships a CLI cannot reintroduce it.
    grep -rlE '^#!/nix/store/[a-z0-9]+-nodejs-[0-9]' $plugin/bridge/node_modules \
      | while read -r f; do
          sed -i "1s|^#!/nix/store/[a-z0-9]*-nodejs-[0-9][^/]*/bin/node|#!${nodejs-slim}/bin/node|" "$f"
        done
    patchShebangs $plugin/bridge

    # nodejs-slim: the runtime needs node, not npm or corepack (~25 MB less).
    # NIXI_CONTEXT_COMMAND: the Omarchy shell's PATH does not include this
    # package, so the bridge is told where its grounding CLI is.
    makeWrapper ${nodejs-slim}/bin/node $plugin/bridge/nixi-node ${adapterFlags} \
      --set-default NIXI_CONTEXT_COMMAND "[\"$out/bin/nixi-context\"]"

    # The bar button is a SECOND plugin: Omarchy gives a third-party plugin
    # either a bar widget or an overlay, never both (shell.qml
    # isBarWidgetPanelPlugin), so one manifest cannot carry the icon and the card.
    button=$out/share/omarchy/plugins/${pluginId}-button
    install -Dm644 button/manifest.json $button/manifest.json
    install -Dm644 button/BarWidget.qml $button/BarWidget.qml

    # Programs the plugin starts BY NAME resolve from the Omarchy shell's PATH,
    # not from this package. On p620 gjs is not installed at all and node, fd
    # live only in one user's profile, so each is pinned here -- in the built
    # copy only, so the repository stays line-comparable with upstream.
    # --replace-fail stops the build if upstream ever moves one of these calls.
    # xdg-open is deliberately left to the desktop's own handler configuration.
    substituteInPlace $plugin/Conversation.qml \
      --replace-fail '"node"' "\"$plugin/bridge/nixi-node\"" \
      --replace-fail '"gjs"' '"${gjs}/bin/gjs"'
    substituteInPlace $plugin/MenuSearch.qml \
      --replace-fail '"node"' "\"$plugin/bridge/nixi-node\""
    substituteInPlace $plugin/bridge/files.js \
      --replace-fail 'execFileAsync("fd"' 'execFileAsync("${fd}/bin/fd"'
    substituteInPlace $plugin/bridge/reveal.js \
      --replace-fail 'execFile("gdbus"' 'execFile("${glib.bin}/bin/gdbus"'

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    # Every Python program must at least import-compile with the pinned
    # interpreter, and the launcher must parse.
    ${python3}/bin/python3 -m py_compile \
      $out/bin/.nixi-server-wrapped $out/bin/nixi-watch $out/bin/nixi-update-manual \
      $out/bin/.nixi-context-wrapped
    # py_compile drops __pycache__ beside the source; it must not ship.
    rm -rf $out/bin/__pycache__
    ${bash}/bin/bash -n $out/bin/.nixi-wrapped
    grep -q "NIXI_FALLBACK_DIR" $out/bin/nixi-server \
      || { echo "nixi-server cannot find its assets when started directly"; exit 1; }
    test -s $out/share/nixi/ui.html
    test -s $out/share/nixi/vendor/purify.min.js
    # `nix run` works only if the wrapper can find its own server and its own
    # assets -- neither is on PATH or in ~/.config for a bare run.
    grep -q "$out/bin" $out/bin/nixi \
      || { echo "\$out/bin is not on the wrapped PATH; nix run cannot find nixi-server"; exit 1; }
    grep -q "NIXI_FALLBACK_DIR" $out/bin/nixi \
      || { echo "wrapper does not point at the bundled assets"; exit 1; }

    # ---- overlay plugin ----
    plugin=$out/share/omarchy/plugins/${pluginId}
    for f in manifest.json Ask.qml Conversation.qml MenuSearch.qml Tour.qml TourModel.js \
             share/tour.json share/learn.json share/faq.json bridge/bridge.js bridge/grounding.js \
             bridge/trust-policy.js bridge/nixi-node; do
      test -s "$plugin/$f" || { echo "overlay plugin is missing $f"; exit 1; }
    done
    for f in manifest.json BarWidget.qml; do
      test -s "$out/share/omarchy/plugins/${pluginId}-button/$f" \
        || { echo "the bar button plugin is missing $f"; exit 1; }
    done
    ${nodejs-slim}/bin/node --check $plugin/bridge/bridge.js
    # Omarchy's validator rejects any symlink inside a plugin folder.
    links=$(find $plugin -type l)
    test -z "$links" || { echo "symlinks inside the plugin folder: $links"; exit 1; }
    # Only the slim runtime node may be referenced (see the shebang rewrite).
    ! grep -rlE '^#!/nix/store/[a-z0-9]+-nodejs-[0-9]' $plugin \
      || { echo "a shebang still points at full nodejs (npm/corepack in the closure)"; exit 1; }
    # No bundled adapters, and nothing that brings their SDK binaries along.
    for bundled in @anthropic-ai @openai @agentclientprotocol/claude-agent-acp @agentclientprotocol/codex-acp; do
      ! test -e "$plugin/bridge/node_modules/$bundled" \
        || { echo "bundled adapter code leaked into the plugin: $bundled"; exit 1; }
    done
    # Test fixtures never ship.
    ! test -e $plugin/bridge/testing || { echo "bridge/testing leaked into the plugin"; exit 1; }
    grep -q 'NIXI_CONTEXT_COMMAND' $plugin/bridge/nixi-node \
      || { echo "the bridge is not told where nixi-context is"; exit 1; }
    # Every program launched by name was pinned.
    ! grep -nE '"(node|gjs)"' $plugin/*.qml \
      || { echo "a bare node/gjs call is left in the plugin QML"; exit 1; }
    ! grep -nE 'execFile(Async)?\("(fd|gdbus)"' $plugin/bridge/*.js \
      || { echo "a bare fd/gdbus call is left in the bridge"; exit 1; }
    # The native file finder must actually load from the store, not just exist.
    ( cd $plugin/bridge && ${nodejs-slim}/bin/node --input-type=module -e \
        "const m = await import('@ff-labs/fff-node'); if (!m.binaryExists()) { console.error('fff native library not found'); process.exit(1) }" ) \
      || { echo "@ff-labs/fff-node does not load from the store"; exit 1; }
  '';

  meta = {
    description = "Nixi — an offline-first guide, tour and AI tutor for nixarchy";
    longDescription = ''
      A corner chat widget for nixarchy (Omarchy vendored for NixOS): a live
      guided tour verified through Hyprland events, a learning path, and an
      agent-backed tutor grounded in a locally fetched copy of the nixarchy
      and Omarchy manuals. Local only (127.0.0.1), Python stdlib only, no
      telemetry.
    '';
    homepage = "https://github.com/olafkfreund/nixi-nixarchy";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    mainProgram = "nixi";
  };
})
