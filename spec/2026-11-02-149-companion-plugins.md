---
status: draft
issue: 149
intent: intent/2026-11-02-149-companion-plugins.md
---

# Spec: Plugins for the Nixi companion

Code: `olafkfreund/nixoarchy-snowflake`. Line numbers below are at
`feat/144-stages-slice1`, which merges first. Plus `nixi-nixarchy`
`nix/hm-module.nix`. Codex and agy reviewed the design (2026-11-02); where
they differed, the choice and the reason are under **Alternatives rejected**.

## Design

### 1. A plugin is a folder

```text
<id>/
  plugin.json        required
  quips.json         optional, a quip pack
  prop.svg           optional, an accessory
  run                optional, an executable for a stage
  OFL.txt / LICENSE  optional
```

`plugin.json`, version 1:

```json
{
  "api": 1,
  "id": "org.example.transit",
  "name": "Nearby transit",
  "version": "1.0.0",
  "description": "Departures from the stop you set.",
  "quips": "quips.json",
  "prop": {"file": "prop.svg", "anchor": "head", "layer": "front"},
  "notifications": [{"app": "element", "category": "chat"}, {"host": "app.slack.com", "category": "chat"}],
  "stage": {
    "phrases": ["next bus", "bus times"],
    "hint": "bus departures from your stop",
    "argv": ["./run"],
    "network": true,
    "cache_seconds": 60
  }
}
```

**Validation:**
- Every key is optional except `api`, `id`, `name` and `version`.
- `api` must be 1; anything else shows "needs a newer Nixi" in Settings.
- `id` must match `^[a-z0-9][a-z0-9._-]{2,63}$`.
- Unknown keys reject the plugin, so a capability can't hide in a key Nixi
  doesn't check.
- Two plugins with the same `id` are both marked broken, and neither loads.

**A broken plugin** (bad JSON, a failed check, a missing file) is listed in
Settings with the reason, and nothing from it loads. Nixi itself keeps
running.

**Folders scanned, in order:**
1. `$NIXI_PLUGIN_DIRS`, the read-only store paths that the Nix option puts in
   the launcher's environment;
2. `~/.local/share/nixi-companion/plugins/*/`, for plugins installed by hand.

**When:** Nixi scans at start-up, and again when you press **Reload** in
Settings.

New module: `app/plugins.py`, standard library only.

### 2. The kinds, and what each may do

| Kind | What it does | Runs code? | Starts on? |
|---|---|---|---|
| **Quip pack** | Adds lines to the events in today's `app/quips.json` (`Quips`, `server.py:1269`); unknown events are ignored; each line ≤ 120 chars, ≤ 200 lines per pack | no | yes |
| **Notification map** | `{app: <exact app id, lowercase>}` or `{host: <exact host or *.suffix>}` → `mail`, `chat` or `feed`; checked after the built-in `FEED`, `MAIL` and `CHAT` rules (`server.py:1420-1422`); **literal matches only, no regex** | no | yes |
| **Prop** | One SVG accessory at a Nixi-owned anchor (`head`, `left`, `right` or `base`; `front` or `back`), offered in Settings → Look beside the built-in skins | no | yes, but you pick it |
| **Stage** | A program whose output is shown on the **notebook** (`facts`) | **yes** | **no**: you switch it on |

**Agent tools are not a plugin kind in v1.** An MCP server belongs in nixi's
bridge configuration, where trust already applies.

### 3. Props: SVG made safe on the server

**What the server rejects:**
- input over 16 KB, more than 200 elements, or nesting deeper than 8;
- any `<!DOCTYPE`, `<!ENTITY` or `<?` before parsing.

**Parsing:** `xml.etree.ElementTree`.

**What is allowed:**
- elements: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`,
  `polyline`, `polygon`;
- attributes: geometry (`d`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `x1`, `y1`,
  `x2`, `y2`, `width`, `height`, `points`, `viewBox`), `fill`, `stroke`,
  `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `opacity`,
  `fill-opacity`, `stroke-opacity`, `fill-rule`, and a `transform` limited to
  numeric `translate`, `scale` and `rotate`;
- colours: `none`, `#rgb`, `#rrggbb`, or a theme name (`acc`, `text`, `dim`),
  which Nixi maps to its CSS variables.

**What is refused:** anything else, including `style`, `href`, `url(...)`,
`on*` attributes, `<use>`, images, text, gradients, filters, animation and
`<foreignObject>`. One refused item drops the whole prop, with the reason shown
in Settings.

**Size checks:** a path's `d` is at most 4,000 characters, and every number
must lie within ±1000.

**Sending it to the page:** the server sends a node list,
`[{"tag":"path","a":{"d":"…","fill":"#fff"}}]`. The page builds it with
`createElementNS` and `setAttribute` only, inside a `<g>` at the chosen anchor,
scaled to the anchor's box. Plugin IDs never become DOM IDs.

**Fit test:** the existing accessories fit test (`tests/accessories_fit.mjs`)
gains a case per bundled example prop.

### 4. Stage plugins: a program, isolated

**When it runs:**
- **Phrases:** after normalising (lowercase, punctuation dropped), what you
  said matches one of an enabled plugin's `phrases` exactly. The server runs
  it at once, with no agent turn. If two plugins match, Nixi asks which one.
- **The agent:** while any stage plugin is enabled, the spoken-reply note in
  `run_bridge` gets a short list, one line per enabled stage plugin (at most
  8, each under 80 characters). For example: `plugin org.example.transit: bus
  departures from your stop`.
  - The agent may end its reply with
    `<<stage>>{"v":1,"kind":"plugin","id":"org.example.transit"}`.
  - `stages.validate` accepts `kind:"plugin"` only with the `id` of an enabled
    plugin.
  - The server runs that plugin, and the page never sees `kind:"plugin"`.

**How it runs:** `bwrap` is required, and it ships in the package's runtime
dependencies. If it's missing or fails, stage plugins can't be switched on,
and Settings says why.

```text
bwrap --clearenv --unshare-all [--share-net if "network": true] --die-with-parent --new-session
      --ro-bind /nix/store /nix/store --ro-bind <plugin dir> /plugin --chdir /plugin
      --tmpfs /tmp --proc /proc --dev /dev
      [--ro-bind /etc/resolv.conf … --ro-bind /etc/ssl … --ro-bind /etc/static/ssl … if network]
      --setenv PATH /plugin:<store paths> --setenv LANG <lang> --setenv HOME /tmp
      /plugin/run
```

- **What the program can't see:** your home folder, the session bus,
  Wayland, the SSH agent, or any token. The `argv` must point inside the
  plugin folder, and nothing runs through a shell.
- **Input:** on stdin, the JSON object `{"v":1,"query":"<what you said>","locale":"…"}`.
  No conversation history.
- **Output:** stdout must be one JSON object `{"v":1,"kind":"facts","title":…,"points":[…],"source":…}`.
  - It's validated by `stages.validate` (#144), and only `facts` is accepted.
  - stdout is capped at 64 KB and stderr at 8 KB (stderr is logged, never
    shown).
  - The program gets 3 s by default, at most 8 s; then its process group is
    killed.
  - Only one run per plugin at a time.
- **Cache:** validated output is kept in memory per plugin and query for
  `cache_seconds` (0–600, default 60). On a timeout, the last good result is
  shown, labelled with its age.
- **Network is all or nothing, and Settings says so:** "Can reach the
  internet". A plugin with `"network": false` runs with no network at all.
- **Text from a plugin is display data.** It's never pasted into the agent's
  prompt. If you then ask about it, the agent gets only the stage's title.

### 5. Consent and Settings

- **Settings → More → Plugins** lists every plugin found, showing:
  - its name, version and source ("Nix" or "Folder");
  - an on/off switch;
  - a plain line for each capability: "Adds 40 jokes", "Sorts Element as chat",
    "Adds a hat", "Runs a program", "Can reach the internet";
  - and, for a broken plugin, the reason.
- **Data-only plugins** (quips, notifications, props) start on.
- **A stage plugin from a folder** starts off. Switching it on shows a card
  with the same look as the approval card: "Nixi will run `run` from
  `<folder>` when you say 'next bus'. It can reach the internet." It has
  **Allow** and **Cancel**.
  - **Allow** records a SHA-256 of `plugin.json` plus every file in the
    folder, in `~/.local/share/nixi-companion/plugins-state.json`.
  - If any file changes, the plugin switches itself off, and Settings shows
    "Changed — check it again".
- **A stage plugin declared through Nix** counts as consented, because
  declaring it in your configuration is the consent. Its hash is still
  recorded, so a rebuild that changes it shows as "Updated".
- **Nixi never downloads a plugin or an update.**

### 6. The Nix option (nixi-nixarchy `nix/hm-module.nix`)

```nix
services.nixi.companion.plugins = lib.mkOption {
  type = lib.types.listOf (lib.types.either lib.types.package lib.types.path);
  default = [ ];
  description = "Companion plugins: each is a folder (or a package whose $out is one) with a plugin.json.";
};
```

- The module puts the list into the companion launcher's environment as
  `NIXI_PLUGIN_DIRS`, colon-separated.
- `nixoarchy-snowflake` gains a `lib.mkCompanionPlugin { src; }` helper. It
  checks `plugin.json` with the same validator at build time.

### 7. Reference plugins (in `plugins/examples/`, not enabled by default)

| Plugin | Shows |
|---|---|
| `pirate-quips` | The smallest plugin: one quip pack |
| `element-chat` | A notification map: Element and `app.element.io` count as chat |
| `party-hat-plus` | A prop: a sanitised SVG hat at `head` |
| `nix-status` | A stage program **without network**: the current generation, failed user units, store size; read from `/run/current-system` and `systemctl --user --failed`, bound read-only |
| `rss-headlines` | A stage program **with network**: the top 5 headlines from one feed URL in its own `config.json` |

`nix-status` needs read-only binds beyond the plugin folder. v1 allows only
the fixed list `/run/current-system` and `/run/user/<uid>/systemd` (for
`systemctl --user`), declared as `"reads": ["system-status"]`, and Settings
shows "Reads system status". There are no arbitrary paths.

### 8. Slices (each its own PR)

- **A, data only:** the loader and validator, quip packs, notification maps,
  props (sanitiser, page renderer, fit test), Settings → Plugins (switches, no
  consent card yet), the Nix option, and the three data-only examples.
- **B, stage programs:** bwrap execution, phrases, the agent's list, the cache,
  the consent card and hash, `nix-status` and `rss-headlines`.

## Alternatives rejected

- **Stage plugins first** (agy). The most useful kind is also the riskiest.
  Slice A proves the loader, Settings and the Nix option with nothing running.
- **Plugin stages that offer "Run this"** (agy). A feed could then put
  commands on the board. v1 is facts only; commands stay something the agent
  proposes.
- **Plugins reading tokens** (`GH_TOKEN`, secret files; agy). v1 has no
  credentials. GitHub is built into the day desk (#144 slice 4). A per-plugin
  credential can come later, through agenix.
- **`systemd-run --user` as the sandbox.** It adds 80–200 ms per run, and its
  filesystem protections need `PrivateUsers=` in a user unit. bubblewrap was
  verified on p620: `--unshare-all` works without root.
- **Running without a sandbox when bwrap is missing.** Fails closed instead
  (Codex).
- **Regex notification rules** (agy). A plugin regex can hang the server on
  catastrophic backtracking. Literal app IDs and hosts cover the cases.
- **Gradients and clip paths in props** (agy). They need ID rewriting; plain
  shapes first.
- **Plugin MCP servers.** That would be a second permission system. MCP stays
  in nixi's bridge configuration.
- **A marketplace, automatic updates, plugin JS, HTML, CSS or layouts.**
  These are the intent's constraints.

## Risks

- **A plugin program leaks data.** With `--unshare-all`, there's no home
  folder and no tokens. Network plugins can still send the query you spoke and
  anything their bound read-only list contains. The consent card and Settings
  say "Can reach the internet".
- **bwrap differs between machines.** On p620 it's verified. On a host where
  user namespaces are off, stage plugins stay off, and Settings says why.
- **Phrase collisions** with Nixi's own phrases (#144's "close", "go back").
  Nixi's own phrases always win, and the plugin loader rejects a plugin phrase
  that is one of them.
- **Malformed SVG** stresses the renderer. The limits in §3 apply, and props
  are checked by the fit test.
- **Plugin text steering the agent.** It never enters the prompt (§4).
- **Hosts:** p620 only, for the live checks.

## Verification

- **Unit tests:**
  - **Manifest validation:** every rule above, including a bad `api`,
    duplicate IDs, unknown keys and an `argv` outside the folder.
  - **Prop sanitiser:** an allowed hat passes; `<script>`,
    `onload`, `style`, `href`, `url()`, a DOCTYPE, an oversized input, deep
    nesting and an out-of-range number each reject it.
  - **Content:** quip merging, and notification maps (exact, and `*.suffix`
    for hosts).
  - **Stage runs (B):** output that isn't `facts` is refused; a timeout kills
    the run; the output cap holds; the cache works.
  - **Consent hash (B):** a changed file switches the plugin off.
- **Sandbox test (B), skipped without bwrap:** the program can't read
  `$HOME`, has no network when `"network": false`, and sees only the
  declared environment.
- **Page test:** a sanitised prop renders at each anchor inside the window (the
  fit test), and a plugin name with `<b>` shows as text in Settings.
- **Nix:** `nix build` of the examples through `mkCompanionPlugin`. A bad
  `plugin.json` fails the build.
- **Live on p620:**
  - slice A: the three examples installed through the Nix option show up in
    Settings, the hat shows on Nixi, the pirate lines appear, and an Element
    notification gets the chat bubble;
  - slice B: "nixi status" shows the notebook from `nix-status`; "headlines"
    asks for consent once, then shows the feed.
