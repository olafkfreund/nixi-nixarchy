{ lib
, stdenvNoCC
, python3
, bash
, curl
, coreutils
, makeWrapper
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "nixi";
  version = (builtins.fromJSON (builtins.readFile ../manifest.json)).version;

  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let base = baseNameOf path; in
      !(lib.hasSuffix ".png" base || lib.hasSuffix ".gif" base
        || base == ".git" || base == "result");
  };

  nativeBuildInputs = [ makeWrapper ];

  # Nothing to compile: this is stdlib Python plus a bash launcher. The build
  # only places files and pins the interpreters, so the closure stays tiny.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/nixi $out/share/nixi/skills

    # The four programs. Python ones get a real interpreter; the launcher
    # needs curl and a shell.
    for p in nixi-server nixi-watch nixi-update-manual; do
      install -Dm755 bin/$p $out/bin/$p
      substituteInPlace $out/bin/$p \
        --replace-fail '#!/usr/bin/env python3' '#!${python3}/bin/python3'
    done
    install -Dm755 bin/nixi $out/bin/nixi
    substituteInPlace $out/bin/nixi \
      --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'
    wrapProgram $out/bin/nixi \
      --prefix PATH : ${lib.makeBinPath [ curl coreutils python3 ]}

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
    install -Dm644 BarWidget.qml  $out/share/nixi/plugin/BarWidget.qml
    install -Dm755 nixi-launch    $out/share/nixi/plugin/nixi-launch
    substituteInPlace $out/share/nixi/plugin/nixi-launch \
      --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'

    # Omarchy lifecycle hooks (opt-in via the module).
    for h in hooks/*.hook; do
      install -Dm755 "$h" $out/share/nixi/hooks/"$(basename "$h")"
      substituteInPlace $out/share/nixi/hooks/"$(basename "$h")" \
        --replace-fail '#!/usr/bin/env bash' '#!${bash}/bin/bash'
    done

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    # Every Python program must at least import-compile with the pinned
    # interpreter, and the launcher must parse.
    ${python3}/bin/python3 -m py_compile \
      $out/bin/nixi-server $out/bin/nixi-watch $out/bin/nixi-update-manual
    # py_compile drops __pycache__ beside the source; it must not ship.
    rm -rf $out/bin/__pycache__
    ${bash}/bin/bash -n $out/bin/.nixi-wrapped
    test -s $out/share/nixi/ui.html
    test -s $out/share/nixi/vendor/purify.min.js
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
