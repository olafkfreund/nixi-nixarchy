---
status: approved
issue: 8
intent: intent/2026-09-15-8-overlay-on-omarchy-ask.md
---

# Spec: Rebuild nixi as a native Omarchy overlay on the omarchy-ask codebase

Resolves the intent's open questions: **1** replace the old widget on this
branch; **2** keep plugin id `io.github.olafkfreund.nixi`; **3** keep the Node
bridge; **4** keep omarchy-ask as a git remote. **5** and **6** had no
recommendation at intent time and are decided under *Design → Milestone 2*
(FAQ chips folded into search, bar button kept, hotkey `SUPER+H`) — change
them here if you disagree.

Everything below marked *verified* was checked on p620 against
omarchy-ask `a6351b0` and Omarchy 4.0.3 while writing this spec.

## Design

### Starting point: upstream history, not a copy

omarchy-ask is added as the remote `omarchy-ask` and merged into the branch
with `--allow-unrelated-histories`, so a later upstream release can be merged
rather than re-applied by hand. The plugin files (`manifest.json`, `*.qml`,
`bridge/`) land at the repository root, which is what `omarchy plugin add`
clones into the plugin directory. nixi's own programs keep their current
homes (`bin/`, `share/`, `skills/`, `nix/`).

Attribution: upstream's `LICENSE` copyright line (© 2026 Clickety Clacks) is
kept verbatim beside nixi's, and `docs/FORK.md` gains a section recording the
fork point `a6351b0` and what was changed, mirroring its existing record of the
Omarchy fork.

### Milestone 1 — a rebranded overlay that runs on NixOS

**Rebrand.** Visible branding only, applied in place so upstream merges stay
line-comparable:

| upstream | nixi |
|---|---|
| plugin id `clickety-clacks.ask` | `io.github.olafkfreund.nixi` |
| `Omarchy Ask`, `Ask` (UI text, manifest `name`) | `Nixi` |
| settings `~/.config/omarchy/ask.json` | `~/.config/omarchy/nixi.json` |
| env `ASK_*` (`ASK_CWD`, `ASK_ACP_COMMAND`, …) | `NIXI_*` |
| bridge package `omarchy-ask-acp-bridge` | `nixi-acp-bridge` |

Sized on the checkout: ~120 occurrences across ~12 files. Not renamed:
upstream's copyright line; every `qs.Commons`, `qs.Ui`, `Quickshell.*`,
`omarchy-shell`, `OMARCHY_PATH` and `MenuModel` name. The existing
`test_no_runtime_rename` check is extended to guard these.

**NixOS portability — two defects that stop upstream running here at all.**

1. `MenuSearch.qml:18` imports the menu logic from a hard-coded Arch path:
   `import "file:///usr/share/omarchy/shell/plugins/menu/MenuModel.js"`.
   *Verified:* `/usr/share/omarchy` does not exist on p620. A QML `import`
   cannot take a runtime variable, and `OMARCHY_PATH` is a store path that
   changes on every nixarchy update, so the import points at the stable
   profile path `/run/current-system/sw/share/omarchy/shell/plugins/menu/MenuModel.js`.
   *Verified:* that file is byte-identical to the one under `OMARCHY_PATH`.

   The menu **data** must keep coming from `OMARCHY_PATH`, which
   `MenuSearch.qml:23-24` already does. *Verified:* the default menu data
   differs between the two paths, because nixarchy rewrites the Install rows
   (nixarchy#220) — pointing data at the profile path would bring back rows
   that run `pacman`. Logic from the stable path, data from `OMARCHY_PATH`.

2. Shebangs `#!/usr/bin/gjs` (`bridge/preview.js`) and `#!/usr/bin/env node`
   (four bridge scripts) are patched with `patchShebangs` in the package.

**Where the agent adapters come from.** This is the one place the design
refines the intent's wording rather than following it literally, so it is
spelled out.

The upstream lockfile bundles the ACP adapters as npm packages, and with them
`@anthropic-ai/claude-agent-sdk` and its eight platform binaries, all licensed
`SEE LICENSE IN README.md` / `LICENSE.md` — not an open-source identifier
(*verified* from `bridge/package-lock.json`). nixpkgs already classifies the
equivalent as unfree: `nix build nixpkgs#claude-agent-acp` refuses without
`allowUnfree`, because it depends on `claude-code` (*verified*). Building the
bundled `node_modules` into nixi's store output would ship those binaries while
bypassing Nix's license check entirely.

So:

- `bridge/package.json` drops `@agentclientprotocol/claude-agent-acp` and
  `@agentclientprotocol/codex-acp`. The bridge keeps only what it runs itself:
  `@agentclientprotocol/sdk` (Apache-2.0), `mathjs` (MIT), `@ff-labs/fff-node`
  (MIT). The lockfile is regenerated.
- The adapters are resolved at runtime, through the bridge's existing launch
  override (`NIXI_ACP_COMMAND`, `NIXI_CLAUDE_ACP_COMMAND`,
  `NIXI_CODEX_ACP_COMMAND`), from **nixpkgs' `claude-agent-acp` (0.75.1) and
  `codex-acp` (1.10.0)** in the user's own configuration, where `allowUnfree`
  is the user's decision — as the intent requires.
- nixi's own `nix build .#nixi` stays free and needs no `allowUnfree`.

**Package** (`nix/package.nix`): the bridge's `node_modules` built with
`buildNpmPackage` from the regenerated lock; `@ff-labs/fff-node`'s Linux
prebuilt binary patched with `autoPatchelfHook`; the QML files, bridge and
nixi's programs assembled into `$out/share/omarchy/plugins/io.github.olafkfreund.nixi/`.

**Testing milestone 1 on p620** needs no home-manager switch and no `npm ci`:
`nix build .#nixi`, symlink the plugin directory into
`~/.config/omarchy/plugins/`, and summon it with
`omarchy-shell shell toggle io.github.olafkfreund.nixi '{}'`. The old
`nixi.service` keeps running untouched beside it.

### Milestone 2 — nixi's features inside the overlay

**Grounding.** Two layers, both reused from nixi:

- `NIXI_CWD` defaults to `~/.config/nixi`. Upstream launches the agent in
  `ASK_CWD` (`bridge.js:47`) and passes it to `newSession` (`bridge.js:235`),
  so Claude Code loads that directory's `CLAUDE.md`, which nixi already ships
  and which points the agent at the nixi skill and the local manual. This is
  the mechanism `nixi --tui` has used since the fork.
- Before each prompt, the bridge runs a small `bin/nixi-context` CLI —
  nixi-server's existing `local_answer()` search, extracted unchanged — and
  prepends the matching manual excerpt to the prompt text. This keeps nixi's
  latency win: most questions are answered from the excerpt without the agent
  spending tool calls searching.

**Trust: Guide and Mechanic become ACP session modes.** *Verified:*
`claude-agent-acp` 0.75.1 exposes Claude Code's session modes `default`,
`acceptEdits`, `plan`, `bypassPermissions` and `dontAsk`.

| nixi | ACP | guarantee |
|---|---|---|
| **Guide** (default) | mode `plan` | read-only, enforced by the agent, not by prompt wording |
| **Mechanic** | mode `default` + upstream's permission queue | every tool use is shown and needs `Y` |
| upstream YOLO | kept, reachable only from Mechanic | never the default |

This is stronger than nixi today, where Guide is an `--allowedTools` list on a
one-shot `claude -p`. The current mode is shown in the corner where upstream
shows `YOLO`. Codex has no `plan` mode; for Codex, Guide maps to its
read-only sandbox, verified at plan time (see Risks).

**Tour and learning path** are commands typed into the card — `/tour` and
`/learn` — and appear as rows in the card's search, never as permanent
buttons. The step content moves out of `bin/nixi-server` into
`share/tour.json` and `share/learn.json`. The tour's progress detection moves
into a new `Tour.qml` driven by `Quickshell.Hyprland` events; *verified* that
module is already imported by Omarchy's own `plugins/bar/Bar.qml`, so it is
available to plugins in this shell.

**FAQ chips (intent Q5): folded into search.** `share/faq.json` entries become
rows in the card's search results, beside menu rows and apps, so typing
"install" surfaces the FAQ answer. No chips are rendered.

**Bar button (intent Q5): kept.** A new nixarchy user has no way to discover a
hotkey. The manifest declares `"kinds": ["overlay", "bar-widget"]`; the bar
widget is the snowflake icon and does nothing but toggle the overlay. If this
shell does not accept both kinds in one manifest, it ships as a second tiny
plugin instead (decided at plan time).

**Hotkey (intent Q6): `SUPER+H`.** It is nixi's documented binding, it is
already bound on p620 and razer, and `nixi` keeps working as a one-line wrapper
around `omarchy-shell shell toggle`, so the Omarchy menu's Help row
(`"action": "nixi"`) and existing bindings need no change.

**Unchanged programs**: `bin/nixi-update-manual`, `bin/nixi-watch`, the nixi
skill, the Omarchy hooks, and `share/KNOWLEDGE.md`.

**Integration toggles.** The widget's gear menu (watcher / skill / hooks) is
not recreated inside the card; those stay controlled by the Home Manager
options and `install.py` flags that already exist.

### Removed

`share/ui.html`; `share/vendor/marked.min.js` and `purify.min.js`; the HTTP
server in `bin/nixi-server` (its `local_answer()` search survives as
`bin/nixi-context`); `BarWidget.qml` and `nixi-launch`; the `bin/nixi`
launcher's browser and polling logic; and **all voice input** — the
`/voice` and `/listen/*` routes, `pw-record` and whisper code, the
`services.nixi.voice.*` options, the model pins, `install.py --with-voice`,
its tests and README sections.

### Home Manager module and installer

`nix/hm-module.nix` links the package's plugin directory into
`~/.config/omarchy/plugins/io.github.olafkfreund.nixi`, sets `NIXI_*` launch
variables including the adapter commands, and removes `nixi.service` (nothing
listens on a port any more). New option `services.nixi.agents` selects which
adapters to reference; its default references nixpkgs' packages, so
evaluating it requires the user's `allowUnfree` for Claude, exactly as
installing Claude Code already does. The watcher, manual timer, skill and
hooks options are unchanged.

`install.py` (plugin-manager path) drops the HTTP server unit and voice, and
states which adapters it found on `PATH`.

### Migration on p620 and razer

Additive until proven: milestone 1 runs beside the existing install. Only
after milestone 2 passes on a host is the old `nixi.service` stopped and
removed there. The switch on each host is announced on the agent bus first,
because it loads a plugin into the running Omarchy shell.

## Alternatives rejected

- **Restyle the HTML widget to look like omarchy-ask.** Gets the look, keeps
  every failure the intent lists: browser dependency, window rule, token file.
- **Install omarchy-ask unmodified with `ASK_CWD` pointed at nixi.** It does
  not run on NixOS (the `MenuSearch.qml` import), and it has no tour, learning
  path or enforced Guide mode.
- **Rewrite the bridge in Python.** Loses upstream mergeability, and the ACP
  SDK nixi would reimplement is JavaScript.
- **Build the bundled npm adapters into nixi's package.** Ships
  non-open-source binaries past Nix's license check, and would make
  `nix build .#nixi` depend on a licence decision nixi cannot make for users.
- **Depend on nixpkgs' `claude-agent-acp` directly in `nix/package.nix`.**
  Breaks a plain `nix build` and CI without `allowUnfree`. It is referenced
  from the Home Manager module instead, inside the user's own configuration.
- **Load the menu data from the stable profile path as well.** Resurrects the
  `pacman` Install rows that nixarchy#220 rewrote.
- **Grounding through an MCP server** passed in `newSession({ mcpServers })`.
  A cleaner long-term shape, but a new long-running component; the
  `CLAUDE.md` + prompt-excerpt pair reuses tested code. Revisit later.
- **Keep FAQ chips or permanent tour buttons.** They are the crowding the
  intent names.
- **Adopt upstream's `CTRL+SHIFT+SPACE`.** Breaks two hosts' existing bindings
  and the menu Help row for no gain.
- **Hard fork.** Rejected at intent (Q4).

## Risks

- **Omarchy 4.0.3 is not the version upstream verified** (`4.0.0-1`). The
  overlay loader exists in this shell, but `qs.Ui` component or plugin-contract
  drift could stop the card loading. Milestone 1 exists to find this first,
  on p620, before any porting.
- **Loading a plugin into the running shell on p620.** Another agent reported
  a double-supervisor bug that produced two bars after a shell restart.
  Announce on the bus; the test needs no shell restart, only a toggle.
- **Native npm prebuilts.** `@ff-labs/fff-node` and `@yuuang/ffi-rs` ship
  platform binaries; if `autoPatchelfHook` cannot make them load, upstream's
  file search is disabled in milestone 1 rather than blocking the milestone.
- **`plan` mode as Guide must be proven, not assumed.** If Claude Code's plan
  mode still permits some mutating tool, Guide is unsafe. Verification below
  tests an actual write. For Codex, the read-only mapping is unverified.
- **The stable profile path is NixOS-only.** nixi stops running on non-NixOS
  Omarchy. Accepted: nixi is nixarchy-specific, and upstream remains for Arch.
- **Upstream merges** will conflict wherever upstream touches renamed lines,
  and the regenerated lockfile will conflict on every dependency bump.
- **Old and new installs coexisting** on a host until migration: two things
  bound to "nixi". The old one stays on `master` only until this merges.

## Verification

**Milestone 1**

- `nix build .#nixi` succeeds with `allowUnfree` unset.
- `grep -riE 'omarchy ask|clickety-clacks\.ask|ask\.json|ASK_'` over tracked
  files matches only `LICENSE` and `docs/FORK.md`.
- Upstream's bridge tests pass: `node --test bridge/harness-policy.test.js bridge/harness-errors.test.js`.
- On p620: `omarchy-shell shell toggle io.github.olafkfreund.nixi '{}'` shows
  the card; a question produces a **streamed** reply.
- Typing `install` in the card lists nixarchy's Install row, and that row's
  action does not contain `pacman` — proves menu data comes from `OMARCHY_PATH`.
- The shell journal shows no QML import error for `MenuModel.js`.

**Milestone 2**

- "how do I install an app" returns an answer containing `nixarchy apply` and
  not `pacman -S`.
- **Guide:** asking the agent to create `~/nixi-guide-probe` leaves no file.
- **Mechanic:** the same request shows a permission prompt; denying it leaves
  no file; allowing it creates the file.
- `/tour` advances a step when the matching Hyprland event occurs on p620.
- After a session, no transcript exists: `~/.config/omarchy/nixi.json`
  contains only settings keys, and nothing new appears under
  `~/.local/share/nixi` besides the manual copy.
- `tools/test_nixi.py` passes, updated for the removed HTTP and voice code and
  extended with checks for the two NixOS portability fixes, the adapter
  exclusion from the lockfile, and the Guide → `plan` mapping.
- CI's HTTP-server and `nix run` browser jobs are replaced by a package build,
  the bridge tests and the Home Manager evaluation.
