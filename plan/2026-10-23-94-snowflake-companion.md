---
status: approved
issue: 94
spec: spec/2026-10-23-94-snowflake-companion.md
---

# Plan: An optional snowflake companion that obeys nixi's rules

## Approved decisions (from the spec, so this file stands alone)

- **Two repos.**
  - The fork `olafkfreund/nixoarchy-snowflake` (Void: GTK3 + WebKit2GTK layer-shell orb,
    Python server, SVG face) does the work. Base commit `09911db`; line numbers below
    refer to it.
  - nixi adds only `services.nixi.companion.{enable,package}` and reuses
    `bridge/bridge.js` **unchanged**.
- **Snowflake.** Only the silhouette changes.
  - `snowPath()` returns one path: a hexagonal plate (inradius 62, flat top and bottom)
    plus six arms to r≈104, each with two pairs of side branches and round joins.
  - It replaces the body circle, the rim and the `miniVoid` preview circle.
  - The face engine (springs, moods, eyes, sparks, halo, melt/notch) is untouched.
- **Bridge-only agent path.**
  - The switch is a module constant `NIXI_BRIDGE = "@nixiBridge@"`, which the Nix build
    replaces with a JSON argv. Bridge mode is on when it parses to a non-empty list. It
    is never read from the environment or from config (nixi #76/#77).
  - When unsubstituted, Void behaves exactly as upstream.
  - One bridge process per conversation.
  - Agent, model and reasoning effort come from `agent`, `model` and `reasoningEffort` in
    `~/.config/omarchy/nixi.json`.
  - `VOID_TOKEN`, `VOID_PORT` and `SUDO_ASKPASS` are not passed to the bridge.
- **Event map:**
  - `text` → `delta` (a new `messageId` sends `break` first)
  - `tool` → `tool` (title only)
  - `permission` → Void's approval card, skipping its own `always` cache:
    `yes` → `allow_once`, `always` → `allow_always` or else `allow_once`,
    `no`/timeout → `reject_once` or else the first `reject*`; no matching option means no
  - `notice`/`status` → `status`
  - `done` → `result`
  - `error` → `error`
  - `fatal` → `error`, then close the bridge; the next prompt starts a new one
  - everything else is ignored (diagnostics go to the log)
- **Cancel and close.**
  - `stop_proc` → `{"type":"cancel"}`.
  - New chat, folder change, fatal or exit → `{"type":"close"}`, then SIGTERM after 2s.
- **Off in bridge mode.** Hidden in the UI when `/api/state` says `bridge: true`, and
  refused by their handlers:
  - trust and root modes, askpass
  - model picker, cost meter, compact
  - Plug-ins
  - the Updates thread, `sync_autostart`
  - history writes and the history menu
  - screenshot attach, `void see`, live view
- **Trust.** Shown read-only from `nixi.json`. Typing `/mechanic` or `/guide` sends
  `{"type":"trust","trust":…}`.
- **Nix package (fork).**
  - `wrapGAppsHook3` with GTK3, WebKitGTK 4.1, gtk-layer-shell, glib-networking and
    GStreamer.
  - Python env: pygobject3, pycairo, numpy, pillow, faster-whisper.
  - piper-tts and espeak-ng.
  - Package argument `nixiBridge ? null`. No Kokoro. Models download into the XDG cache
    at runtime.
- **nixi.**
  - `companion.package` defaults to `null`, like `aiMirror.package`, with an assertion
    that it is set when enabled.
  - `home.packages` gets the package overridden with
    `nixiBridge = [ "${plugins}/${pluginId}/bridge/nixi-node" "${plugins}/${pluginId}/bridge/bridge.js" ]` (deviation, S6: the card runs the bridge through the `nixi-node` wrapper, which pins the adapters and `NIXI_CONTEXT_COMMAND`; a bare node would drop both).
  - No systemd unit and no Hyprland bind.
  - `docs/architecture.md` notes that the bridge's event names have a second consumer.
- **Accepted limits** (intent Q1/Q4): no tool output in Void's terminal sheet, no
  history, no screen features, ear accessories overlap the arms.

## Who does what (agent team)

```text
S0 setup (lead)
 ├─ wave 1, parallel:  S1 snowflake (coder "snow") · S2 bridge mode (coder "bridge") · S3 Nix package (Codex, handoff)
 ├─ wave 2, parallel:  S4 bridge-mode UI (coder "snow", SendMessage) · S5 bridge test (agy, handoff) · S6 nixi module (lead)
 └─ wave 3:            S7 build + eval (lead) · S8 review (fresh Opus agent + Codex/agy second opinion) · S9 runtime check (user + lead)
```

The three steps in a wave touch separate files, so they don't conflict. Each agent
commits on its own branch in the fork. The lead merges them into the fork branch
`feat/94-snowflake-companion` in step order. Codex and agy run headless through the
`handoff` skill: one plan step each, with no commits of their own. The lead reviews and
commits their work. The lead finishes anything an agent hands back unfinished.

## Steps

**S0. Setup (lead).** Clone the fork to `/mnt/code/Source-home/GitHub/nixoarchy-snowflake`,
create branch `feat/94-snowflake-companion` from `main` (`09911db`), and check out
`git worktree`s for the wave-1 agents. Verify with `git -C … log --oneline -1` = `09911db`.
Traps: the clone in the scratchpad is shallow; don't work in it.

**S1. Snowflake body** (fork `app/static/index.html`; coder "snow")
- Add `function snowPath(core=62, reach=104)` near the other geometry (by `EYE`,
  line 780). It returns the path string. Points are rounded to 0.1.
- Line 479: `<circle r="76" fill="url(#ballG)"/>` → `<path class="ball" fill="url(#ballG)"/>`.
- Line 487: `<circle id="rim" r="75" …>` → `<path id="rim" class="ball" fill="none" …>`.
  Keep its stroke attributes.
- At startup, set `d` on both: `document.querySelectorAll('#body>.ball')`.
- CSS lines 29, 72–85: every `#body>circle` → `#body>.ball`. Don't touch
  `#body>ellipse`.
- Line 2448: `'#body > circle'` → `'#body > .ball'`.
- `miniVoid()` line 763: `sv('circle',{r:76,…})` → `sv('path',{d:snowPath(),…})`, same
  other attributes.
- Verify:
  - `grep -n "#body>circle\|#body > circle" app/static/index.html` → nothing.
  - Open `app/static/index.html` headless (`python3 -m http.server` + Chromium screenshot,
    or the `run` skill). The snowflake renders and the eyes sit inside the plate.
- Traps:
  - `#rim` was matched by `#body>circle` too. Both shapes need `class="ball"`.
  - Don't change `melt()`, `#gooBall`, `R=84`, `sph()` or the body transform.
  - Keep `pointer-events` as it is.

**S1b. Read as a real snowflake** (fork `app/static/index.html`; coder "snow")
*Added during implementation after the user saw S1 live (2026-10-23): it read as Void with
spikes.*
- `snowPath(core=62, reach=138)`: the same plate, plus long thin arms that taper to a diamond
  tip, 3 branch pairs per arm (lengths 30/22/13), and 6 secondary spikes from the edge
  midpoints to r=84.
- Crystal facets: a stroked `path.ball.facet` (centre-to-vertex lines and an inner hexagon,
  white at 22%), hidden and faded by the existing `.ball` rules.
- Icy default look: body `#5aa9e6`, pupils `#1b4f8a`, white eye whites. The glow and sparks
  follow the pupil colour. The `:root` defaults match.
- Verify: a live screenshot on the desktop. Eyes stay inside the plate.

**S1c. The NixOS logo as the snowflake** (fork `app/static/index.html`, `app/server.py`; lead)
*Added at the user's request after S1b (2026-10-23): "make it look like the NixOS logo"; the
S1b colours looked creepy.*
- The six lambda polygons from the NixOS logo SVG, scaled by 145/1152 and rotated 60° apart,
  alternating the logo's dark (`#3e5993`→`#4d6fb7`) and light (`#6d9bbc`→`#77b6e1`)
  gradients, in a `g.ball.nix`. `snowPath()` is now the flat-topped hexagon plate (inradius
  58) in the logo's hole (inradius 55.8), under the lambdas. S1b's branches and facets are gone.
- Default look in both the page and `server.py` (`look()` and `DEFAULTS`): navy body
  `#1b2a4a`, pupils `#3e5993`, white eyes.
- Verify: a live screenshot. Eyes sit on the plate and the lambdas stay inside the frame.

**S2. Bridge mode** (fork `app/server.py`; coder "bridge")
- Near the config constants (~line 93), add `NIXI_BRIDGE = "@nixiBridge@"` and a helper
  `bridge_argv()`. It returns a list only when the value is a JSON non-empty list of
  non-empty strings, otherwise `None`. Add `BRIDGED = bridge_argv() is not None`.
- New `class Bridge` next to `run_claude` (line 2506):
  - `start()`: `Popen(argv, cwd=ST.cwd, env=…, stdin/stdout PIPE, text, bufsize=1,
    start_new_session=True)`. The env is `os.environ` minus `VOID_TOKEN`, `VOID_PORT` and
    `SUDO_ASKPASS`, plus `NIXI_AGENT`, `NIXI_MODEL` and `NIXI_REASONING_EFFORT` read from
    `nixi.json` (keys `agent`, `model`, `reasoningEffort`; unset when `agent` is empty).
    stderr goes to the server log.
  - `send(obj)`, and `close()`: send `{"type":"close"}`, wait 2s, then SIGTERM the group.
  - One module instance, `BRIDGE`.
- `run_bridge(prompt, emit)`:
  - Start the bridge if needed, send `{"type":"prompt","text":prompt}`, then read lines
    and apply the event map above until `done`, `error` or `fatal`.
  - For `permission`, a worker thread calls the new `Approvals.ask_bridge(title, options)`.
    That method publishes the same `approve` BUS event (`always` = an `allow_always`
    option exists), waits like `ask()`, never reads or writes `self.always`, and returns
    the picked `optionId`. The worker then sends `{"type":"permission","id":…,"optionId":…}`.
  - Returns `"done"`.
- Line 3440: `r = run_bridge(prompt, emit) if BRIDGED else run_claude(prompt, emit, partial)`.
- `stop_proc()` (line 2608): if `BRIDGED`, cancel the pending cards, send cancel, return.
- `/api/new` (3275) and `/api/cd` (3280): if `BRIDGED`, call `BRIDGE.close()`. Also close
  it on server exit.
- Trust passthrough: in `/api/ask`, when `BRIDGED` and the text is exactly `/mechanic` or
  `/guide`, send `{"type":"trust",…}` and reply with the ack text. No agent turn.
- Refusals when `BRIDGED` (return `403 {"error":"off in nixi mode"}`): `/api/askpass`,
  `/api/askpass/answer`, `/api/update`, `/api/update/check`, `/api/plugins`,
  `/api/compact`, `/api/history`, `/api/resume`, `/api/capture`.
  - Skip starting `Updates` (~line 3541).
  - `sync_autostart()` returns at once.
  - The history append at line 363 is a no-op.
  - `/api/settings` ignores the keys `trust`, `root_mode`, `model`, `auto_model`,
    `autostart` and `cost_*`.
- `/api/state` (2982): add `"bridge": BRIDGED` and, when bridged, `"trust"` read from
  `nixi.json` (default `"guide"`).
- Verify:
  - `python3 -m py_compile app/server.py`.
  - With the constant unsubstituted, `python3 -c 'import sys; sys.path.insert(0,"app"); import server; assert not server.BRIDGED'`.
  - S5 tests the rest.
- Traps:
  - Run Void's approval card exactly as it is. Only skip the `always` cache.
  - Never put `TOOL_TOKEN` in the bridge env.
  - Don't change `run_claude`, so non-Nix installs keep working.
  - Approval timeout 600s → reject.

**S2b. Wake word "Hey Nixi"** (fork `app/server.py`, `app/quick.py`, `app/static/index.html`; coder "bridge")
*Added during implementation at the user's request (2026-10-23); not in the approved spec.*
- `WAKE_RE` (server.py:1371): the name group becomes Nixi plus likely Whisper mishearings
  (`nixi|nixie|nixy|nixey|nixee|nicksy|nicksie`). `stt_hint` (146) and the wake transcription
  hint (1520) say "Hey Nixi". `FOLLOW_NOTE` (1364) says "hey Nixi".
- `quick.py:338` strips "hey nixi" prefixes. `index.html` shows “Hey Nixi” in its labels
  (549, 550, 584).
- Unchanged: the window class "Void" (Hyprland rules depend on it), app names, data and
  config paths, launcher name.
- Verify: `WAKE_RE` matches "Hey Nixi, open firefox" (captures "open firefox") and
  "hey nixie what's up", and no longer matches "hey void".

**S3. Nix package** (fork `flake.nix`, `nix/package.nix`, `bin/void`; Codex via handoff)
- `flake.nix`:
  - Inputs: `nixpkgs` (nixos-unstable).
  - Outputs: `packages.{x86_64,aarch64}-linux.{void,default}` = `callPackage ./nix/package.nix {}`.
  - `formatter` = `nixpkgs-fmt`.
- `nix/package.nix`:
  - `stdenvNoCC.mkDerivation` with nativeBuildInputs `makeWrapper wrapGAppsHook3
    gobject-introspection` and buildInputs `gtk3 webkitgtk_4_1 gtk-layer-shell
    glib-networking gst_all_1.gstreamer gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good`.
  - `py = python3.withPackages (p: [ p.pygobject3 p.pycairo p.numpy p.pillow p.faster-whisper ])`.
  - Install `app/` → `$out/share/void/app`, `bin/void` → `$out/bin/void`, and
    `data/void.desktop` + icon.
  - `wrapProgram $out/bin/void --set VOID_PYTHON ${py}/bin/python --set VOID_APP
    $out/share/void/app --prefix PATH : ${lib.makeBinPath [ grim slurp wl-clipboard
    libnotify playerctl pulseaudio brightnessctl piper-tts espeak-ng ]}`, plus
    `"''${gappsWrapperArgs[@]}"` (set `dontWrapGApps = true` and pass them yourself).
  - `nixiBridge ? null`: when non-null, `substituteInPlace
    $out/share/void/app/server.py --replace-fail '"@nixiBridge@"' ${lib.escapeShellArg
    (builtins.toJSON (builtins.toJSON nixiBridge))}`. That gives a Python string literal
    holding the JSON array.
- `bin/void`:
  - When `VOID_APP` and `VOID_PYTHON` are set: `APP=$VOID_APP`, `PY=$VOID_PYTHON`, skip
    the venv check (lines 22–42), and use `$VOID_PYTHON` as `SP` instead of probing
    `/usr/bin/python3` (line 105).
  - `void setup` exits with "installed by Nix; nothing to set up".
- Verify:
  - `nix build .#void`.
  - `./result/bin/void --help`, or `void doctor`, prints with no import errors.
  - `nix build --impure --expr '(builtins.getFlake (toString ./.)).packages.x86_64-linux.void.override { nixiBridge = ["/bin/node" "/x/bridge.js"]; }'`,
    then `grep -c bridge.js result/share/void/app/server.py` ≥ 1.
- Traps:
  - Check the attribute names on the pin with `nix eval nixpkgs#python3Packages.faster-whisper.version`.
    If faster-whisper fails to build, drop it, keep typing-only, and report back. Don't
    patch ctranslate2.
  - CPU only: no CUDA.
  - The substitution must keep the line valid Python. Check with
    `python3 -m py_compile result/share/void/app/server.py`.

**S4. Bridge-mode UI** (fork `app/static/index.html`; coder "snow", after S1 and S2)
- Where the page reads `/api/state`, when `bridge` is true add `body.nixi`.
- CSS `body.nixi` hides: the trust/root controls (Brain tab), the model picker and cost
  meter, the Plug-ins button, update rows, the history menu item, the clip/screenshot
  button (`#clipB`, line 617), live view, and the autostart toggle.
- The Brain tab shows "Trust: <trust> (set by nixi: type /mechanic or /guide)".
- Verify:
  - Serve the page with a stub `/api/state` returning `{"bridge":true,"trust":"guide"}`.
    Those controls are hidden.
  - With `bridge:false` the page is unchanged.
- Traps: hide with CSS only. Leave the handlers in place; S2 refuses them on the server.

**S5. Bridge test** (fork `tests/test_bridge.py`; agy via handoff, after S2)
- `unittest`, skipped unless `NIXI_SRC` (a nixi checkout with `bridge/node_modules`) and
  `node` exist.
- Set `server.NIXI_BRIDGE` to `["node", "$NIXI_SRC/bridge/bridge.js"]`, with a temporary
  `HOME`. Write `nixi.json` with `{"agent":"claude","trust":"mechanic"}`.
- Copy `run-bridge.js`'s setup: a stub `claude` on PATH, and
  `NIXI_ACP_COMMAND=["node","$NIXI_SRC/bridge/testing/fake-agent.js"]` with `FAKE_AGENT_LOG`.
- Cases:
  1. Text streams as `delta` events.
  2. A permission answered `yes` sends the `allow_once` optionId (read the fake agent's
     log).
  3. `stop_proc()` makes the agent log a cancel.
  4. After a `fatal` (kill the bridge), the next prompt starts a new process.
- Verify: `NIXI_SRC=/mnt/code/Source-home/GitHub/nixi-nixarchy python3 -m unittest tests/test_bridge.py -v`
  passes. Without `NIXI_SRC` it reports skipped.
- Traps:
  - The source-checkout bridge honours `NIXI_ACP_COMMAND`; the packaged one does not
    (#76). That is expected.
  - Read the fake agent's env flags in `bridge/testing/fake-agent.js` before asserting.

**S6. nixi module + docs** (nixi `nix/hm-module.nix`, `README.md`, `docs/architecture.md`; lead)
- Options, next to `aiMirror` (line 92): `companion.enable = lib.mkEnableOption "the
  snowflake desktop companion (Void fork), driven through Nixi's bridge"`, and
  `companion.package = lib.mkOption { type = lib.types.nullOr lib.types.package; default
  = null; … }`. The description follows `aiMirror.package` and names the fork's flake.
- Config, in the `mkMerge` list: `(lib.mkIf cfg.companion.enable { assertions = [ {
  assertion = cfg.companion.package != null; message = "services.nixi.companion.package
  must be set: …"; } ]; home.packages = lib.optional (cfg.companion.package != null)
  (cfg.companion.package.override { nixiBridge = [ "${plugins}/${pluginId}/bridge/nixi-node"
  "${plugins}/${pluginId}/bridge/bridge.js" ]; }); })`.
- Before writing this, check `nix/package.nix` for the node the bridge is patched to. If
  it is not `pkgs.nodejs-slim`, use what it uses.
- README: a "Snowflake companion" section with the flake input, the two options, a
  hotkey example for `void` / `void listen`, and what bridge mode turns off.
- `docs/architecture.md`: one paragraph saying the companion consumes the bridge's
  stdout events, so a rename needs the fork updated.
- Verify: S7.
- Traps:
  - No flake input in nixi.
  - `services.nixi.voice` stays removed.
  - Don't touch `bridge/`.

**S7. Build and eval (lead)**
- Fork: `nix build .#void` and `nix flake check`.
- nixi:
  - `nix flake check`.
  - Evaluate HM through the module for three cases:
    - companion off: compare the `home-files`/`home-path` drvPath with `master`.
    - on, with the fork's package as `--override-input`, or the store path from the fork
      build: `void` is in `home-path` and its `server.py` contains the bridge path.
    - on, without a package: the assertion text appears.
  - `node --test bridge/` and `python3 tools/test_nixi.py`.
- Then S5 with `NIXI_SRC`.

**S8. Review**
- A fresh agent on `model: "opus"`, given only this plan's path and `git diff` from both
  repos.
- Then `second-opinion`: Codex `review --base master` (nixi) and `--base main` (fork),
  and agy in plan mode on the fork diff.
- The lead fixes confirmed findings, and records any change of plan here in the same
  commit.

**S8 outcome.** The Opus reviewer found no bypass of nixi's trust rules. Fixed in the fork
(`fix(bridge): close the review findings`):
- `claude_bin()` returns `None` when bridged, so auto-compact can't run `claude` directly.
- Folders, projects and memory are off in nixi mode (deviation from S2: the bridge ignores the
  Popen cwd and runs its agent from nixi's directory, so Void's folder switching could only
  mislead).
- `/mechanic` and `/guide` reach the server.
- `nixi.json` is read from `~/.config/omarchy`, the same file the bridge uses.
- The settings filter uses the real keys.

The README now says "Hey Nixi". Follow-up for nixi, outside this plan because `bridge/` is out of
scope: add Void's `runtime.json` and config files to `SECRET_PATHS` / `EXEC_WRITE_PATHS`.

**S9. Runtime check** (user's desktop; lead with ai-mirror, if granted)
- Enable the companion in the user's config and rebuild (the user runs `nixarchy-apply`).
- Moods, melt to an edge and back, clicks on arm tips and in the gaps, skin gallery.
- Guide: "edit ~/.bashrc" is refused and the file is unchanged.
- Mechanic: an approval card appears and nixi undo restores the file.
- Reading `~/.ssh/id_ed25519` is blocked.
- `pgrep -af claude` shows only `claude-agent-acp` under `bridge.js`.

## Tests

| Command | Expected |
|---|---|
| `nix build .#void` (fork) | builds |
| `python3 -m py_compile app/server.py result/share/void/app/server.py` | no output |
| `NIXI_SRC=… python3 -m unittest tests/test_bridge.py -v` (fork) | 4 passed |
| `node --test bridge/` (nixi) | all pass, unchanged count |
| `python3 tools/test_nixi.py` (nixi) | all pass |
| `nix flake check` (both) | passes |
| HM eval, companion off vs `master` | same `home.file`, user units, activation and package names (deviation, S7: the drvPath differs anyway, because nixi's package source is the whole repo, docs and plan included, and the HM manual lists the new options) |

## Rollback

- Users: set `services.nixi.companion.enable = false` (the default) and rebuild. Nothing
  else changed.
- Code:
  - Revert the merge commits on each repo's branch. nixi's change is limited to
    `nix/hm-module.nix`, `README.md` and `docs/architecture.md`.
  - The fork keeps upstream behaviour when `nixiBridge` is null, so reverting it is
    optional.
- Void's own data in `~/.local/share/void` and `~/.config/void` can be deleted by hand.
  Nix doesn't create them.
