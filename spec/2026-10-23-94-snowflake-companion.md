---
status: draft
issue: 94
intent: intent/2026-10-23-94-snowflake-companion.md
---

# Spec: An optional snowflake companion that obeys nixi's rules

## Design

Two repos. The fork does the work. nixi adds one opt-in option and reuses its bridge
unchanged. Line numbers in the fork refer to `olafkfreund/nixoarchy-snowflake` at
`09911db`.

```text
void (fork, GTK/WebKit overlay)
  └─ server.py run_bridge()  ── NDJSON stdin/stdout ──  nixi bridge.js  ── ACP ── agent
       (voice, face, approvals card)                    (trust policy, changes, undo)
```

### 1. Snowflake body (fork: `app/static/index.html`)

Only the silhouette changes. The face engine stays as it is: springs, moods, eyes
(`sph()`), sparks, halo, melt-to-notch, and the body transform at ~line 1088.

- **Shape.** Add `snowPath()`, which returns one SVG path:
  - A hexagonal plate with inradius 62, flat top and bottom.
  - Six arms from the plate's corners out to r≈104, each with two pairs of side
    branches, drawn with round joins.
  - The eyes (`EYE` at line 780: |x|≤≈53, y −46…+37, up to ×1.1 under mood scale)
    stay inside the plate.
- **Where it replaces the circle:**
  - The body: line 479, `<circle r="76" fill="url(#ballG)">` → `<path class="ball">`.
  - The rim: line 487, `#rim` circle → the same path with a stroke only, `class="ball"`.
  - Both get their `d` once at startup.
  - `miniVoid()` (line 763) draws the same path for previews and the skin gallery.
- **Selectors.** Every `#body>circle` in the CSS (lines 29, 72–85) becomes
  `#body>.ball`. `#body>ellipse` stays as it is (it is the gloss). The code panel's
  `querySelector('#body > circle')` (line 2448) becomes `'#body > .ball'`.
- **Unchanged:**
  - `#ballG` and the gloss ellipses, which fit inside the plate.
  - `melt()` and `#gooBall`: a round liquid drop between the flake and the notch is
    intended, and the body already fades out over .12s.
  - `sendRegion()` and the `window.py` input region: the bbox grows, and clicks in the
    gaps between arms pass through via `pointer-events: visiblePainted`.

### 2. Bridge mode (fork: `app/server.py`)

- **The switch.** A module constant `NIXI_BRIDGE = "@nixiBridge@"`.
  - The Nix build replaces it with a JSON argv, `["<node>", "<.../bridge/bridge.js>"]`.
  - Bridge mode is on when the value parses as a non-empty list.
  - It is never read from the environment or from config (nixi #76/#77).
  - Unsubstituted (non-Nix installs), Void behaves exactly as upstream.
- **One bridge per conversation** (`docs/architecture.md` invariant 1). A `Bridge` class
  owns one `subprocess.Popen(NIXI_BRIDGE, cwd=ST.cwd, stdin=PIPE, stdout=PIPE)`, started
  lazily on the first prompt. It is closed with `{"type":"close"}` (then SIGTERM after 2s)
  on:
  - a new chat,
  - a folder change,
  - a `fatal` event,
  - server exit.
- **Environment.** `NIXI_AGENT`, `NIXI_MODEL` and `NIXI_REASONING_EFFORT` are read from
  `agent`, `model` and `reasoningEffort` in `~/.config/omarchy/nixi.json`, the keys
  `Ask.qml:185-187` reads. That gives the same agent as the card (intent Q2). If `agent`
  is empty, the variables are unset and the bridge falls back to Omarchy's default agent.
  `VOID_TOKEN`, `VOID_PORT` and `SUDO_ASKPASS` are **not** passed.
- **`run_bridge(prompt, emit)`** replaces `run_claude` at its only call site (line 3440)
  when bridge mode is on. It sends `{"type":"prompt","text":prompt}` and reads events
  until `done`, `error` or `fatal`:

  | bridge event | Void emit |
  |---|---|
  | `text` | `delta` (a new `messageId` sends `break` first) |
  | `tool` | `tool` (name = title, empty detail; no `toolres`) |
  | `permission` | Void's approval card (below) |
  | `notice`, `status` | `status` caption |
  | `learned`, `ack`, `config_options`, `diagnostic` | ignored (diagnostics go to the server log) |
  | `done` | `result` |
  | `error` | `error` |
  | `fatal` | `error`, then close the bridge; the next prompt starts a new one |

- **Approvals.** A `permission` event goes through Void's existing card UI
  (`BUS.pub(t="approve")` / `Approvals.answer`, lines 586-654). In bridge mode it skips
  Void's own `always` cache. The answer is mapped to an ACP option of the right kind,
  taken from the event's `options`:
  - `yes` → `allow_once`
  - `always` → `allow_always`, or `allow_once` if that kind is missing (the bridge already
    removes `allow_always` for edits)
  - `no` or a timeout → `reject_once`, or the first `reject*` option

  The answer is sent as `{"type":"permission","id","optionId"}`. If no option of the
  wanted kind exists, the answer is `no`. Policy stays in the bridge: Guide's refusals,
  YOLO and secret blocks happen before or instead of the event.
- **Cancel.** In bridge mode `stop_proc()` sends `{"type":"cancel"}` and cancels pending
  cards.
- **Removed in bridge mode.** Hidden in `index.html` when `/api/state` reports
  `bridge: true`, and refused by their handlers:
  - trust and root modes, askpass
  - model and auto-model picker, cost stop and meter, `compact_session` /
    `auto_compact`
  - the Plug-ins button (`plugin_set`)
  - the `Updates` thread (not started)
  - `sync_autostart` (no-op)
  - `history.jsonl` writes and the history menu
  - screenshot attach, `void see`, live view
- **Trust display.** Void's settings show nixi's `trust` from `nixi.json`, read-only. It
  is changed by typing `/mechanic` or `/guide`, which Void sends as
  `{"type":"trust","trust":…}`, the same command the card sends.

### 3. Nix package (fork: `flake.nix`, `nix/package.nix`, `bin/void`)

- **Build.** `stdenvNoCC.mkDerivation`, using `wrapGAppsHook3` and
  `gobject-introspection`, with buildInputs `gtk3 webkitgtk_4_1 gtk-layer-shell
  glib-networking gst_all_1.{gstreamer,gst-plugins-base,gst-plugins-good}`.
  - Python: `python3.withPackages (p: [ p.pygobject3 p.pycairo p.numpy p.pillow
    p.faster-whisper ])`.
  - `piper-tts` and `espeak-ng` on PATH.
- **Install.** `app/` → `$out/share/void/app`, and `bin/void` → `$out/bin/void`, wrapped
  with:
  - `VOID_PYTHON=<python env>`
  - `VOID_APP=$out/share/void/app`
  - PATH += `grim slurp wl-clipboard libnotify playerctl pulseaudio brightnessctl
    piper-tts espeak-ng`
- **Bridge argument.** Package argument `nixiBridge ? null` (a list).
  `substituteInPlace app/server.py --replace-fail '@nixiBridge@' <json>` runs only when it
  is set.
- **`bin/void`.** When `VOID_APP`/`VOID_PYTHON` are set, use them. That skips the venv
  check (lines 22-42) and the `/usr/bin/python3` probing (line 105). Data stays in
  `$XDG_DATA_HOME/void`. `void setup` refuses under Nix.
- **Not packaged.** Kokoro (`kokoro-onnx` is not in nixpkgs; Void falls back to piper).
  The models (faster-whisper `base.en`, the piper voice) download into the XDG cache on
  first use, as they do today.
- **Flake outputs.** `packages.${system}.{void,default}` for x86_64-linux and
  aarch64-linux, plus `formatter`.

### 4. nixi (`nix/hm-module.nix`, docs)

- Options under `services.nixi.companion`:
  - `enable` (`mkEnableOption`)
  - `package` (`nullOr package`, default `null`, documented like `aiMirror.package` at
    `hm-module.nix:92`)
- Config, inside the existing `mkIf cfg.enable` list:
  - An assertion that `package != null` when the companion is enabled.
  - `home.packages = [ (cfg.companion.package.override { nixiBridge = [
    "${pkgs.nodejs-slim}/bin/node" "${plugins}/${pluginId}/bridge/bridge.js" ]; }) ]`.
    `plugins` is the same `nixiPkg` the card uses, so the adapter pinning (#76) is
    shared.
  - The node must be the one `nix/package.nix` patches the bridge's shebangs to
    (`nodejs-slim`). The step checks this.
- No systemd unit and no Hyprland bind (intent Q3). The README shows how to bind
  `void` / `void listen` to a key.
- `bridge/` is not changed.

## Alternatives rejected

- **Run Void as it is, with only its dangerous modes stripped.** It would still be a
  second agent path with its own rules. Its "ask" mode approves edits silently. The user
  chose bridge-only.
- **Port the face to QML inside nixi.** That means rewriting about 1,200 lines of
  SVG/spring/filter code, with a high risk of visual regression. It also adds voice
  dependencies to nixi itself, which `services.nixi.voice` removed on purpose.
- **Vendor Void into nixi.** About 9.6k lines and the voice stack would land in nixi's
  closure and review load. The `aiMirror`-style optional package keeps nixi unchanged
  for users who leave the feature off.
- **Choose the bridge path with an environment variable.** That is exactly the hole #77
  closed: whoever controls the environment would control the enforcement.
- **A flake input in nixi for the fork.** It would add a lock entry and fetch for every
  user. Instead, the user passes the package, the same way as `aiMirror`.
- **A systemd unit that starts it with the session.** Not asked for (intent Q3). Void's
  launcher already starts its server on demand.

## Risks

- **The protocol drifts.** The bridge's events are internal to nixi. A rename breaks the
  companion without any test noticing. *Mitigation:* the fork runs a small test of
  `run_bridge` against nixi's `bridge/testing/fake-agent.js` + `run-bridge.js`. nixi's
  `docs/architecture.md` adds a note that the event names have a second consumer.
- **The shared settings file.** Void reads `nixi.json` and writes trust only through the
  bridge, so nothing new writes the file (the two-writers rule stays true).
- **Approvals hang.** Void's card has a 600s timeout and the bridge holds the request
  until it gets an answer. A timeout must send `reject`. A closed bridge must cancel
  open cards.
- **Native dependencies.** On the pinned nixpkgs (`20b1ddd`), `faster-whisper`'s
  CTranslate2 closure might not build, or might pull in CUDA. *Mitigation:* CPU only.
  If it breaks, fall back to typing-only and say so.
- **WebKitGTK and GPUs.** WebKitGTK under layer-shell on NVIDIA may need Void's existing
  `void render nocomp` option. No new code; documented.
- **Accessory overlap** (accepted at intent Q4).
- **Hosts.** Only the user's own desktop, through Home Manager, when opted in. No server
  or fleet host is affected.

## Verification

- **Fork, build.** `nix build .#void` succeeds. `nix flake check` passes.
- **Fork, bridge test.** A Python test runs `run_bridge` with `NIXI_BRIDGE` pointed at
  nixi's fake agent. It checks:
  - text streams as `delta`
  - a `permission` event answered `yes` sends the `allow_once` optionId
  - `cancel` reaches the bridge
  - `fatal` closes the bridge, and the next prompt starts a new one
- **nixi, module.** Evaluate a Home Manager config twice:
  - `companion.enable = false`: the derivation is identical to the current one.
  - `enable = true` with a package: `void` is in `home.packages` and its `server.py`
    contains the store path to `bridge.js`.
  - `enable = true` with no package: the assertion message appears.
- **nixi, tests.** `node --test bridge/` and `python3 tools/test_nixi.py` stay green.
- **Runtime, on the user's desktop:**
  - The snowflake goes through each mood, melts into an edge and comes back. Clicks on
    arm tips work and clicks in the gaps pass through. Skin gallery previews render.
  - In Guide, "edit ~/.bashrc" is refused and the file is unchanged.
  - In Mechanic, the same request shows Void's approval card, and nixi's undo restores
    the file.
  - Reading `~/.ssh/id_ed25519` is blocked.
  - `pgrep -af claude` shows `claude-agent-acp` under `node …/bridge.js` and never
    `claude -p`.
