---
status: approved
issue: 149
spec: spec/2026-11-02-149-companion-plugins.md
reviewers:
  - codex   # the user asked for Codex and agy on this design; the sandbox and SVG sanitiser need a second read
  - agy
---

# Plan: Plugins for the Nixi companion

## Where the code lives

- **Companion:** `olafkfreund/nixoarchy-snowflake`, branched from `main`
  **after #144 slice 1 (PR #19) merges**. Line numbers below are at
  `feat/144-stages-slice1`; find each place by name if they've moved.
- **Nix option:** `nixi-nixarchy` `nix/hm-module.nix`.
- **Artifacts:** this repo.
- **Delivery:** slice A and slice B are separate PRs and separate deploys.

## Approved decisions (copied from the spec, so this file stands alone)

### The format

- **A plugin is a folder:**
  - `plugin.json`, required;
  - optional `quips.json`, `prop.svg` and `run`;
  - an optional licence file.
- **The manifest (`api: 1`):**
  - required keys: `api`, `id`, `name`, `version`;
  - optional keys: `description`, `quips`, `prop` `{file, anchor: head|left|right|base, layer: front|back}`,
    `notifications` `[{app|host, category: mail|chat|feed}]`,
    `stage` `{phrases[], hint, argv[], network: bool, cache_seconds, reads?: ["system-status"]}`.
- **Validation:**
  - `id` must match `^[a-z0-9][a-z0-9._-]{2,63}$`;
  - an unknown key rejects the plugin;
  - an `api` other than 1 shows "needs a newer Nixi";
  - duplicate IDs: both plugins are marked broken;
  - a broken plugin is listed in Settings with its reason, and nothing from it
    loads; Nixi keeps running.

### Data-only kinds (start on)

- **Quip pack:** lines added to the existing `quips.json` events. Unknown
  events are ignored; at most 120 characters per line and 200 lines per pack.
- **Notification map:**
  - matches only literal, lowercase app IDs, or hosts given as exact names or
    `*.suffix` (no regex);
  - each match sets the category to mail, chat or feed;
  - checked after the built-in FEED, MAIL and CHAT rules.
- **Prop:** one SVG at a Nixi-owned anchor, picked in Settings → Look.
  - **Size limits:** at most 16 KB, 200 elements and 8 levels deep.
  - **Rejected outright:** any DOCTYPE, ENTITY or `<?`.
  - **Allowed elements:** `svg`, `g`, `path`, `circle`, `ellipse`, `rect`,
    `line`, `polyline`, `polygon`.
  - **Allowed attributes:**
    - geometry;
    - `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`;
    - the opacities and `fill-rule`;
    - `transform`, numeric `translate`, `scale` and `rotate` only.
  - **Colours:** `none`, `#rgb`, `#rrggbb`, or `acc`, `text`, `dim`.
  - Anything else drops the whole prop: `style`, `href`, `url()`, `on*`, `use`,
    images, text, gradients, filters, animation, `foreignObject`.
  - `d` is at most 4,000 characters, and numbers lie within ±1000.
  - The page receives a node list `[{tag, a:{…}}]` and builds it with
    `createElementNS` and `setAttribute` only. Plugin IDs never become DOM
    IDs.
- **No agent tools and no MCP in v1.**

### Stage plugins (off until switched on)

- **How a stage is triggered:**
  - **Phrases:** what you said, normalised (lowercase, punctuation dropped),
    exactly matches one of an enabled plugin's phrases. Nixi runs the plugin
    with no agent turn; if two plugins match, it asks which one.
  - **The agent:** while any stage plugin is enabled, the spoken-reply note
    lists them, at most 8 lines, each under 80 characters.
    - The agent may answer `<<stage>>{"v":1,"kind":"plugin","id":"…"}`.
    - Nixi accepts it only for the id of an enabled plugin, then runs that
      plugin.
    - The page never sees `kind:"plugin"`.
  - **Clashes with Nixi's own phrases** ("close", "go back", "show it",
    "what's next", and the fast-path verbs): Nixi's own phrase wins, and the
    loader rejects the plugin.
- **The sandbox: `bwrap` is required.** It ships on the package's PATH. If it's
  missing, or a test run fails, stage plugins can't be switched on, and Settings
  says why. The command line:

  ```text
  bwrap --clearenv --unshare-all [--share-net] --die-with-parent --new-session
        --ro-bind /nix/store /nix/store --ro-bind <dir> /plugin --chdir /plugin
        --tmpfs /tmp --proc /proc --dev /dev
        [network: --ro-bind /etc/resolv.conf, /etc/ssl, /etc/static/ssl when present]
        [reads system-status: --ro-bind /run/current-system, /run/user/<uid>/systemd]
        --setenv PATH /plugin:<package PATH> --setenv LANG <lang> --setenv HOME /tmp
        /plugin/<argv…>
  ```

  - `argv[0]` must resolve inside the plugin folder.
- **Running it:**
  - **Input:** stdin gets `{"v":1,"query":…,"locale":…}`.
  - **Output:**
    - stdout must be one JSON object that `stages.validate` accepts as
      `facts`; nothing else is accepted;
    - stdout is capped at 64 KB and stderr at 8 KB (stderr is logged only).
  - **Time limit:** 3 s by default, 8 s at most; the process group is killed
    after that.
  - **One run per plugin at a time.**
  - **Cache:** keyed by plugin and query, for `cache_seconds` (0–600, default
    60). On a timeout the last good result shows, with its age.
- **Display only:** what a plugin outputs never goes into the agent's prompt.
  A follow-up question passes only the stage's title.
- **Consent:**
  - a stage plugin in a folder starts off;
  - switching it on shows a card styled like the approval card, with Allow
    and Cancel;
  - Allow stores the SHA-256 of `plugin.json` and every file in
    `~/.local/share/nixi-companion/plugins-state.json`;
  - if any file changes later, the plugin turns itself off and shows
    "Changed — check it again";
  - Nix-declared plugins count as consented, but their hash is recorded, so a
    rebuild that changes them shows as "Updated".
- **Nixi never downloads a plugin or an update.**

### Settings

- **Settings → More → Plugins:** each plugin shows its name, version and
  source (Nix or Folder), an on/off switch, one plain line per capability, the
  reason if it's broken, and a **Reload** button.

### Examples (in `plugins/examples/`, not enabled)

- `pirate-quips`, `element-chat` and `party-hat-plus`: data only, slice A.
- `nix-status`: no network, `reads: ["system-status"]`. Slice B.
- `rss-headlines`: network, with its own `config.json`. Slice B.

### Change from spec §6, made in this plan (covered by plan approval)

- **The spec says:** the Nix option passes the plugin folders to the launcher
  as `NIXI_PLUGIN_DIRS`.
- **Why that's wrong here:** nixi's module already rules that the environment
  must not be able to change what Nixi launches (`hm-module.nix:62`, #76).
  Stage plugins *are* things Nixi launches.
- **What the plan does instead:**
  - the package takes a `plugins ? [ ]` argument and links each plugin into
    `$out/share/nixi-companion/plugins/<id>`;
  - the module passes `cfg.companion.plugins` through the override it already
    makes (`companionPkg = cfg.companion.package.override { … }`,
    `hm-module.nix:27`);
  - the server scans `<package>/share/nixi-companion/plugins/`, found from its
    own `APP_DIR`, then `~/.local/share/nixi-companion/plugins/`;
  - no environment variable is read.

## Steps

Default implementer: the `coder` agent. Reviews: a fresh Opus review of each
slice's diff, then Codex and agy.

**Traps, every step:**
- **`index.html`:**
  - never put a `//` comment in the middle of a line, because it has twice
    commented out code;
  - run `node --check` on the extracted script;
  - no `innerHTML` with plugin data.
- **Python:**
  - standard library only;
  - no `shell=True`, and every argv is a list.
- **Previews:** headless and GPU-free only, and check `journalctl -k` after
  each.
- **Tests:** run them with `python3 -m unittest discover -s tests -q`.

### Slice A: data only (PR A)

**A1. `app/plugins.py` (new): find, validate, remember**
- **`scan(dirs)`:** returns `[Plugin(id, dir, manifest, source, error)]`. It
  applies every manifest rule above and catches every error per plugin.
- **`plugin_dirs()`:** returns the package plugin folder (`APP_DIR.parent /
  "plugins"` inside the store, and the git-checkout equivalent), then the user
  folder.
- **`State`:** loads and saves `plugins-state.json` (`{id: {enabled, sha256}}`)
  atomically: write a temp file, then `os.replace`.
- **`sha256_of(dir)`:** a hash over the sorted relative paths and contents,
  ignoring symlinks that point outside the folder.
- **Verify:** `tests/test_plugins.py` covers every rule, a bad `api`,
  duplicates, unknown keys, `argv` escaping the folder via `..` or a symlink,
  and the state round-trip.

**A2. Quips and notification maps (`app/server.py`)**
- **Quips:** `Quips.lines(event)` (`:1277`) also returns the lines from
  enabled packs. They're validated at load time.
- **Notifications:** in `Inbox.rows` (`:1502`), when the built-in rules give
  `other`, enabled plugin maps are checked:
  - an exact app id against the lowercased app name;
  - a host as an exact name or a `*.suffix` match, against the notification's
    host field (the one #142's icon lookup already uses).
- **Verify:** unit tests: a pack's lines appear only while it's enabled, and
  an Element notification counts as chat only with the map.

**A3. Props**
- **Sanitiser:** `plugins.sanitize_svg(bytes)` returns a node list, or raises
  with the reason. It enforces every limit above.
- **State:** `state_info()` sends `plugin_props: [{id, name, anchor, layer,
  nodes}]` for enabled props.
- **Page (`index.html`):**
  - a `<g>` per anchor, under `#accFront` and `#accBack` (`:593`);
  - Settings → Look lists the plugin props after the built-in skins;
  - when one is picked, `applyLook` builds its nodes with `createElementNS`
    and `setAttribute`, scaled into the anchor's box;
  - colours `acc`, `text` and `dim` map to the CSS variables.
- **Verify:**
  - sanitiser unit tests: a hat passes; each refused element or attribute
    rejects, as does a DOCTYPE, oversized input, deep nesting, or a
    1001-valued number;
  - `tests/accessories_fit.mjs` gets a case for `party-hat-plus` at each
    anchor.

**A4. Settings → Plugins**
- **Server routes** (named `companion-plugins`, because `/api/plugins` already
  manages Claude Code plugins):
  - `GET /api/companion-plugins` returns each plugin's id, name, version,
    source, enabled, capability lines and error;
  - `POST /api/companion-plugins {id, enabled}` handles data-only plugins in
    slice A (stage plugins come in B3);
  - `POST /api/companion-plugins/reload`.
- **Page:** a "Plugins" block in the More tab (`index.html:727`), copying the
  existing `label.tg` rows. Every field goes through `textContent`.
- **Verify:**
  - unit tests for the routes;
  - a page-test case: a plugin named `<b>x</b>` shows as text.

**A5. Nix**
- **Package (`nix/package.nix`):** a new `plugins ? [ ]` argument. The install
  phase links each into `$out/share/nixi-companion/plugins/$(basename)`.
- **Build-time check (`flake.nix`):** `lib.mkCompanionPlugin { src, pname }`
  checks `plugin.json` at build time, by running `app/plugins.py --check <dir>`
  (add that CLI entry). A bad manifest fails the build.
- **Module (nixi-nixarchy `nix/hm-module.nix`):**
  - a new `services.nixi.companion.plugins` option, a list of packages or
    paths, default `[]`, described as in spec §6;
  - it's passed into the existing `companionPkg = …override { … plugins =
    cfg.companion.plugins; }`.
- **Verify:**
  - `nix build .#examples.pirate-quips` (or similar) succeeds;
  - a deliberately broken manifest in a test derivation fails;
  - `nix eval` of the module with `plugins = [ … ]` works.
- **Trap:** the module change is a separate PR in nixi-nixarchy. Merge it
  after this repo's package accepts `plugins`.

**A6. Examples: `plugins/examples/{pirate-quips,element-chat,party-hat-plus}/`**
- Each is complete, with a README of three lines.
- The hat is drawn with the allowed shapes only.
- **Verify:** `app/plugins.py --check` passes on each, and the fit test passes.

**A7. Slice A review, live check, PRs, deploy**
- **Reviews:** Opus, Codex and agy.
- **Live on p620:** install the three examples via
  `services.nixi.companion.plugins`. In Settings they're listed and on. Pick
  the hat in Look. A pirate quip appears. An Element test notification gets the
  chat bubble.
- **Deploy:** the usual way, after posting on the agent bus. The nixi-nixarchy
  module PR goes with it.

### Slice B: stage programs (PR B)

**B1. The bwrap runner (`app/plugins.py`)**
- **`run_stage(plugin, query)`:** builds the bwrap argv exactly as above,
  using `subprocess.Popen` with an argv list, `start_new_session=True`, and
  `communicate(input=…, timeout=…)`. It enforces the output caps, kills the
  process group on a timeout, and validates the output with `stages.validate`
  (`facts` only).
- **`bwrap_ok()`:** one cached test run at start-up.
- **The package:** `bubblewrap` goes on the wrapper's PATH (`nix/package.nix:85`).
- **Verify:**
  - `tests/test_plugin_sandbox.py`, skipped without bwrap: a test program
    can't read `$HOME`, has no network when `network:false` (a socket connect
    fails), sees only the declared environment, is killed at the time limit,
    and output over the cap is refused;
  - unit tests for output validation and the cache.

**B2. Triggers**
- **Phrase fast path:** in `/api/ask`, before the agent, and after #144's own
  phrase fast path.
- **The agent's list:** added to the `run_bridge` note (`server.py`, the
  `answer_stages` addition), only while stage plugins are enabled.
- **Validation:** `stages.validate` accepts `{"kind":"plugin","id"}` only for an
  enabled stage plugin. The server runs it, then sends the resulting `facts`
  stage.
- **Busy:** one run per plugin at a time. A second request gets "still
  fetching…".
- **Verify:** tests for an exact phrase, a two-plugin collision (Nixi asks), a
  clash with a reserved phrase (the loader rejects it), `kind:"plugin"` with an
  unknown or disabled id (dropped), and plugin output never appearing in the
  next prompt.

**B3. Consent**
- **Turning on a folder stage plugin:** `POST /api/companion-plugins {id,
  enabled:true}` returns `{needs_consent: {what, runs, network, reads}}`. The
  page shows the consent card, styled like the approval card.
- **Allow:** `POST …/consent {id, sha256}` stores the hash, but only if the
  folder still hashes to that value.
- **When files change:** at scan or reload, a hash mismatch turns the plugin
  off and sets its error to "Changed — check it again".
- **Nix plugins:** a store-path plugin is consented; its hash is recorded,
  and a change shows "Updated".
- **Verify:** unit tests for the whole flow, including a file changed between
  showing the card and pressing Allow (refused).

**B4. Examples: `nix-status` and `rss-headlines`**
- **`nix-status`:** a small Python stdlib script. It reads the generation from
  `/run/current-system`, failed units from `systemctl --user --failed --plain
  --no-legend` (the binary comes from PATH), and the store size from `df`. It
  outputs `facts`.
- **`rss-headlines`:** a Python stdlib script that fetches the feed URL from
  its own `config.json` (`urllib`, a 4 s timeout), parses it with
  `xml.etree`, and outputs up to 5 `points`.
- **Verify:** each runs under `run_stage` in the sandbox test (`rss-headlines`
  against a local `http.server` fixture, network on), and `--check` passes.

**B5. Slice B review, live check, PR, deploy**
- **Reviews:** Opus, Codex and agy.
- **Live on p620:**
  - "nixi status" shows the notebook;
  - "headlines" shows the consent card first, then headlines;
  - editing `rss-headlines/run` switches it off with "Changed".

## Tests

| Check | Expected |
|---|---|
| `python3 -m unittest discover -s tests -q` | all pass, including `test_plugins*` and `test_plugin_sandbox` (skipped without bwrap) |
| `node tests/accessories_fit.mjs` (through its runner) | every prop fits, the example hat included |
| `node --check` on the page script | clean |
| `nix build` of the examples, and of the broken-manifest test | passes, and fails, respectively |
| `journalctl -k` after previews | no `ring timeout` or `gpu reset` |
| Live | A7 and B5 |

## Rollback

- **Quick:** turn each plugin off in Settings, or remove it from
  `services.nixi.companion.plugins` and rebuild. With no plugins, Nixi behaves
  exactly as before.
- **Full:** revert that slice's merge in nixoarchy-snowflake (and the module
  PR in nixi-nixarchy), bump the inputs in `nixos_config`, deploy p620 the
  usual way, and restart Nixi.

## Deviations
- **Slice B, steps B1–B4** (2026-11-04, nixoarchy-snowflake
  `feat/149-stage-programs`, by the Sonnet coder).
  - **Two sandbox additions so scripts can start:**
    - `--ro-bind /usr/bin/env /usr/bin/env`, when it exists, for
      `#!/usr/bin/env` scripts;
    - the sandbox `PATH` is `/plugin:$PATH`, plus the server
      interpreter's `/nix/store` directory.
  - **`rss-headlines`** fetches with a 2 s timeout (the runner's default
    kill is 3 s; there's no manifest timeout field).
  - **Output caps** (64 KB stdout, 8 KB stderr) are enforced by reader
    threads, not after `communicate()`.
  - **The consent card** sits inline in Settings → Plugins, not over
    Nixi.
    - `needs_consent` carries `{id, name, sha256, what, runs, network,
      reads}`.
    - The plain enable route forces `consent:false`, so the page can't
      skip the card.
  - **Failures:** an agent-requested plugin failure shows as a one-line
    facts notebook; a phrase-route failure is spoken.
  - **Collisions:** the reply to "Which one?" goes to the agent like any
    other message.
  - **Loader:** argv entries that are absolute paths or contain `..` are
    rejected, and phrases are normalised like `fast_path`.
  - **`nix/plugin.nix`'s `--check`** copies `stages.py` next to
    `plugins.py`, which imports it.
  - The old "a stage plugin can't be switched on" route test is replaced
    by the consent tests.
  - **Security fixes after the review** (Opus, Codex and agy each found
    the first one independently):
    - **A sandbox escape is closed.** `reads: ["system-status"]` no longer
      binds `/run/user/<uid>/systemd` or `/run/current-system`. A
      read-only bind still allowed connecting to the systemd manager's
      control sockets, and through them starting a transient unit outside
      the sandbox. Instead, the server collects
      `system_status {generation, failed}` and passes it on stdin.
      `nix-status` reports "unavailable" when the query fails. **This
      narrows an approved decision: system status is data, not access.**
    - **Consent is re-checked before every run:** the folder's hash is
      compared, and on a mismatch the plugin is switched off.
    - **Hash and symlink walks** raise on unlistable folders, and
      `review()` switches off broken, symlinked or vanished plugins.
    - **The consent card:**
      - name, description and hint lose control characters and are capped
        (60, 200 and 79 characters);
      - the card shows "Nixi tells the agent: <hint>";
      - network plugins are described as also reaching services on this
        computer.
    - **Limits:** `--size 64M` on `/tmp`, `RLIMIT_AS` 1 GiB and
      `RLIMIT_FSIZE` 64 MiB.
    - **I/O:** stdin is written from a thread, and stderr keeps draining
      past its cap.
    - **Stale results:** a background result is published only if its stage
      is still current, and the cache is cleared on reload or disable.
    - **Phrases:** `reserved()` rejects guide, mechanic and anything
      `quick.handle` answers.
    - **Source "nix"** is only a real `/nix/store` path; anything else
      needs consent.
    - **argv** rejects absolute paths and `..`, including after `=`, and
      stderr is cleaned before logging.
  - **Second security review** (Opus probing the real sandbox, Codex,
    agy):
    - **Phrase checks:** `reserved()` used `quick.handle`, which runs
      commands; scanning a plugin that declared "lock the screen" locked
      it. It now uses a side-effect-free `quick.matches()`.
    - **Network plugins run under pasta**
      (`--config-net --no-map-gw`, with no ports and DNS forwarded) in a
      network namespace of their own. They get the internet but not this
      computer's loopback services or abstract sockets (adb and 1Password
      were reachable before). Without pasta they refuse to run. `passt`
      is a new runtime dependency. **This narrows the approved
      `network: true`** to internet access. Services listening on the
      host's non-loopback addresses (e.g. a Tailscale IP) are still
      reachable, like any other host on that network.
    - **The card:** a manifest is rejected for control characters or
      Unicode separators in any field or argv element. argv is capped at
      8 elements of 80 characters.
    - **Limits:** a launcher sets `RLIMIT_NPROC` 64 and `RLIMIT_CORE` 0
      inside the namespace. `/dev/shm` is a 16 MiB tmpfs.
    - **Runs use a private copy:** each run uses a copy of the folder made
      while hashing it (`O_NOFOLLOW`, regular files only), bound read-only
      and removed afterwards.
    - **Duplicates:** a broken duplicate no longer switches off the valid
      Nix plugin with the same id.
    - **Card wording** (Codex): pasta doesn't filter the host's
      non-loopback addresses (a VPN or second network card), so the card
      says exactly what is isolated: "It can use the internet and your local
      networks. It cannot reach services that only listen on this computer
      (localhost)."
    - **Hashing streams** one file at a time in 1 MiB chunks, with a 64 MB
      folder cap. A file that changes while it's read is refused. The hash
      format is unchanged, so consent already given stays valid.
  - **Third security review** (Opus probing the real sandbox):
    - **Host addresses:** pasta forwards to any host-owned address, so a
      network plugin reached services on the Tailscale, Docker and libvirt
      addresses (ollama, ssh, NFS, the k8s API).
      - Pasta's command is now a router step that adds an `unreachable`
        route for every IPv4 and IPv6 address the host owns, then
        `exec`s bwrap.
      - The plugin can't remove the routes (it has no CAP_NET_ADMIN).
      - A run is refused if the routes can't be set.
      - `iproute2` is a new runtime dependency.
      - The card again says "It can use the internet (not this computer's
        own services)." This supersedes the wording change above.
    - **Nested user namespaces:** bwrap now gets
      `--unshare-user --disable-userns --cap-drop ALL`, so there are no
      nested user namespaces, no capabilities, and no tmpfs or remount
      bypass.
    - **Manifests** are opened `O_NOFOLLOW|O_NONBLOCK`, must be regular
      files, and are capped at 64 KiB. A FIFO `plugin.json` no longer
      hangs the scan.
    - **Hard links** (`st_nlink > 1`) are refused.
    - **The sandbox PATH** keeps only `/nix/store` entries.

- **A3** (2026-11-03, nixoarchy-snowflake `feat/149-plugins-slice-a`).
  - **The prop node list is flat:** `[{tag, a, p}]`, where `p` is the
    parent's index, so `<g>` can nest. Node 0 is the root `svg`. It carries
    the `viewBox`, and the page doesn't create an element for it.
  - **Anchor boxes,** in the page's units: head `[-30,-112,60,54]`, left
    `[-98,-34,40,40]`, right `[58,-34,40,40]`, base `[-36,68,72,26]`.
  - **The skin is stored as `plug:<id>`.** The id is used only as a data
    attribute, never as a DOM id.
  - **`plugins/examples/party-hat-plus/` moved forward from A6,** because
    the fit test needs it.
- **A5.**
  - **The examples are `legacyPackages.<system>.examples.*`**, built with
    `nix build .#examples.<name>`, not under `packages`.
  - **`lib.<system>.mkCompanionPlugin` is per system**, because it needs
    nixpkgs.
  - **The broken-manifest check** is
    `checks.<system>.broken-manifest-fails` (`testers.testBuildFailure`).
- **A4.** A refused toggle returns HTTP 200 with an `error` field, not a
  4xx.
- **A7 review** (Opus, Codex and agy).
  - **Props:**
    - they're drawn in a nested `<svg x y width height viewBox>` at the
      anchor box, which clips them;
    - the `viewBox` is sent as 4 numbers, each side at least 1;
    - each `scale()` is between 0.01 and 10, and the product along any path
      is at most 10;
    - every attribute is at most 64 characters (`d` and `points` at most
      4,000) before any regex runs.
  - **Module plugin entries** are packages, or path literals built through
    `mkCompanionPlugin`. A raw string is refused. `package.nix` asserts
    `lib.isStorePath`.
  - **Symlinked plugin folders** are skipped only in the user folder: the
    package folder is made of links to store paths. A symlink inside any
    plugin marks it broken.
  - **A plugin that is on stays switchable** even when it's broken.
  - **On a duplicate id, a Nix plugin wins** over a Folder one.
