{ lib
, stdenvNoCC
, buildNpmPackage
, nodejs-slim
, gjs
, fd
, glib
, python3
, bash
, jq
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
  # bridge's JavaScript does not invalidate npmDepsHash. After the adapters and
  # the native file index were dropped, every dependency is MIT or Apache-2.0
  # and none of them ships a binary, so nothing here needs patchelf.
  bridgeModules = buildNpmPackage {
    pname = "nixi-bridge-modules";
    inherit version;
    src = lib.fileset.toSource {
      root = ../bridge;
      fileset = lib.fileset.unions [ ../bridge/package.json ../bridge/package-lock.json ];
    };
    npmDepsHash = "sha256-+hVJkMXXoTih3i/+IP73NUCPuunlhgweQtXaFH4tktw=";
    dontNpmBuild = true;
    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r node_modules $out/node_modules
      runHook postInstall
    '';
  };

  # The node the plugin runs everything with. When adapters are given, their
  # store paths are PINNED with --set, not offered as defaults: the environment
  # cannot redirect what Nixi launches as the agent (#76).
  #
  # --set-default writes `export VAR=${VAR-store-path}`, which any exported
  # variable beats -- a line in ~/.bashrc, ~/.zshrc or ~/.config/environment.d
  # is enough. That does not merely change a setting: trust levels, the rules in
  # bridge/trust-policy.js and Guide's cancel are all enforced by the bridge
  # against whatever it spawned, and none of them constrain a substituted binary,
  # because that binary decides what to report back.
  #
  # To develop an adapter locally, override the package rather than the
  # environment: services.nixi.package = pkgs.nixi.override { claudeAcp = …; }.
  # There is deliberately no option to re-enable the environment route; a
  # setting whose only purpose is to reopen this gets switched on and left on.
  #
  # NIXI_ACP_COMMAND is untouched. nothing here sets it, and adapterOverride in
  # bridge/harness-policy.js reads the per-agent name first, so pinning these
  # makes the wildcard unreachable on a Nix deployment while it keeps working
  # for PATH installs and for bridge/testing/run-bridge.js.
  adapterFlags = lib.concatStringsSep " " (
    lib.optional (claudeAcp != null)
      "--set NIXI_CLAUDE_ACP_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${claudeAcp}/bin/claude-agent-acp" ])}"
    ++ lib.optional (codexAcp != null)
      "--set NIXI_CODEX_ACP_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${codexAcp}/bin/codex-acp" ])}"
    ++ lib.optional (opencodeAcp != null)
      "--set NIXI_OPENCODE_COMMAND ${lib.escapeShellArg (builtins.toJSON [ "${opencodeAcp}/bin/opencode" "acp" ])}"
  );
in
stdenvNoCC.mkDerivation {
  pname = "nixi";
  inherit version;

  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let base = baseNameOf path; in
      !(lib.hasSuffix ".png" base || lib.hasSuffix ".gif" base
        || base == ".git" || base == "result" || base == "docs");
  };

  nativeBuildInputs = [ makeWrapper ];
  # patchShebangs resolves interpreters (node, gjs) from these.
  buildInputs = [ nodejs-slim gjs ];

  # Nothing to compile: this is stdlib Python plus a bash launcher. The build
  # only places files and pins the interpreters, so the closure stays tiny.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    # The safe-IO module those programs import (descriptor-bound directory walk,
    # atomic replace). It must sit in the same directory as them -- a script's own
    # directory is its sys.path[0] -- which is also where install.py puts it on
    # the imperative path (#60). Not executable, and no shebang to substitute.
    install -Dm644 bin/nixi_safeio.py $out/bin/nixi_safeio.py

    # The Python programs get a real interpreter.
    for p in nixi-watch nixi-update-manual nixi-context; do
      install -Dm755 bin/$p $out/bin/$p
      substituteInPlace $out/bin/$p \
        --replace-fail '#!/usr/bin/env python3' '#!${python3}/bin/python3'
    done
    # The overlay's bridge runs nixi-context before every prompt; with nothing
    # in ~/.config/nixi it must still find the bundled knowledge.
    wrapProgram $out/bin/nixi-context \
      --set-default NIXI_FALLBACK_DIR $out/share/nixi

    install -Dm755 bin/nixi $out/bin/nixi
    # `nixi` only asks the running Omarchy shell to open the card, so it needs
    # nothing beyond a shell: omarchy-shell comes from the desktop's PATH.
    substituteInPlace $out/bin/nixi \
      --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'

    # Knowledge the agent is grounded in (the HM module links these into
    # ~/.config/nixi; nixi-context falls back to them).
    install -Dm644 share/faq.json     $out/share/nixi/faq.json
    install -Dm644 share/KNOWLEDGE.md $out/share/nixi/KNOWLEDGE.md
    install -Dm644 share/CLAUDE.md    $out/share/nixi/CLAUDE.md
    install -Dm644 share/AGENTS.md    $out/share/nixi/AGENTS.md

    install -Dm644 skills/nixi/SKILL.md $out/share/nixi/skills/SKILL.md

    # Omarchy lifecycle hooks (opt-in via the module).
    for h in hooks/*.hook; do
      install -Dm755 "$h" $out/share/nixi/hooks/"$(basename "$h")"
      substituteInPlace $out/share/nixi/hooks/"$(basename "$h")" \
        --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'
    done

    # ---- the overlay plugin (omarchy-ask based, issue #8) ---------------------
    plugin=$out/share/omarchy/plugins/${pluginId}
    install -Dm644 manifest.json $plugin/manifest.json
    for q in Ask.qml Conversation.qml HarnessSelector.qml MenuSearch.qml Tour.qml; do
      install -Dm644 "$q" "$plugin/$q"
    done
    # Tour logic shared with the node tests, and the tour/learning data.
    install -Dm644 TourModel.js $plugin/TourModel.js
    install -Dm644 TextFormat.js $plugin/TextFormat.js
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
      --set NIXI_CONTEXT_COMMAND "[\"$out/bin/nixi-context\"]"

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
      $out/bin/nixi-watch $out/bin/nixi-update-manual $out/bin/.nixi-context-wrapped \
      $out/bin/nixi_safeio.py
    # The shared module must be there AND actually importable from that directory,
    # which is the whole reason it is installed beside the programs rather than
    # anywhere tidier. -B so no __pycache__ lands in the store (checked below).
    test -s $out/bin/nixi_safeio.py || { echo "the safe-IO module is missing"; exit 1; }
    ${python3}/bin/python3 -B -c \
      'import sys; sys.path.insert(0, "'"$out"'/bin"); import nixi_safeio; nixi_safeio._dirfd' \
      || { echo "nixi_safeio is not importable from the package bin directory"; exit 1; }
    # py_compile drops __pycache__ beside the source; it must not ship, and
    # nor must any other bytecode.
    rm -rf $out/bin/__pycache__
    ! find $out -name '__pycache__' -o -name '*.pyc' | grep -q . \
      || { echo "bytecode leaked into the store output"; exit 1; }
    ${bash}/bin/bash -n $out/bin/nixi

    # ---- overlay plugin ----
    plugin=$out/share/omarchy/plugins/${pluginId}
    for f in manifest.json Ask.qml Conversation.qml MenuSearch.qml Tour.qml TourModel.js TextFormat.js \
             share/tour.json share/learn.json share/faq.json bridge/bridge.js bridge/grounding.js \
             bridge/trust-policy.js bridge/nixi-node; do
      test -s "$plugin/$f" || { echo "overlay plugin is missing $f"; exit 1; }
    done
    for f in manifest.json BarWidget.qml; do
      test -s "$out/share/omarchy/plugins/${pluginId}-button/$f" \
        || { echo "the bar button plugin is missing $f"; exit 1; }
    done
    # manifest.json is the single source `version` above is derived from; the
    # button's copy is hand-maintained and nothing read it, so it was free to go
    # stale at the next release (#56).
    button_version=$(${jq}/bin/jq -r .version "$out/share/omarchy/plugins/${pluginId}-button/manifest.json")
    [ "$button_version" = "${version}" ] \
      || { echo "button/manifest.json says $button_version, the package is ${version}"; exit 1; }
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
    # ...and told UNCONDITIONALLY (#76). The check above passes for both
    # spellings, because --set and --set-default both emit the variable name;
    # only --set-default emits the shell default-expansion form, so `=[$][{]`
    # is what tells them apart. Without this, reverting to --set-default would
    # reopen the hole with every test still green.
    #
    # The character classes are not decoration. Written `=''${`, the `$` is an
    # ERE anchor and `{` opens an interval, so the pattern matches NOTHING and
    # the check silently passes whatever the wrapper says. That is exactly the
    # failure this guards against, and only a negative test caught it.
    ! grep -qE 'NIXI_(CLAUDE_ACP|CODEX_ACP|OPENCODE|CONTEXT)_COMMAND=[$][{]' $plugin/bridge/nixi-node \
      || { echo "an adapter or context command is still overridable from the environment"; exit 1; }
    # Every program launched by name was pinned.
    ! grep -nE '"(node|gjs)"' $plugin/*.qml \
      || { echo "a bare node/gjs call is left in the plugin QML"; exit 1; }
    ! grep -nE 'execFile(Async)?\("(fd|gdbus)"' $plugin/bridge/*.js \
      || { echo "a bare fd/gdbus call is left in the bridge"; exit 1; }
    # `@` file search is plocate and fd only: no prebuilt shared object may
    # come back in without the patchelf machinery coming back with it.
    ! find $plugin/bridge/node_modules -name '*.so' -o -name '*.node' | grep -q . \
      || { echo "a native binary reappeared in the bridge's node_modules"; exit 1; }
  '';

  meta = {
    description = "Nixi — an offline-first guide, tour and AI tutor for nixarchy";
    longDescription = ''
      An Omarchy overlay card for nixarchy (Omarchy vendored for NixOS): a
      guided tour verified through Hyprland events, a learning path, and an
      agent-backed tutor (Claude, Codex or OpenCode over ACP) grounded in a
      locally fetched copy of the nixarchy and Omarchy manuals. No server,
      no telemetry.
    '';
    homepage = "https://github.com/olafkfreund/nixi-nixarchy";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    mainProgram = "nixi";
  };
}
