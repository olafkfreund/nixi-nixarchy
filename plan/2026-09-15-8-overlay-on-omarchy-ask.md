---
status: approved
issue: 8
spec: spec/2026-09-15-8-overlay-on-omarchy-ask.md
---

# Plan: Rebuild nixi as a native Omarchy overlay on the omarchy-ask codebase

## Decisions

Everything below is approved in the spec unless marked **plan-time**, which
means it was checked on p620 while writing this plan and refines how a spec
decision is carried out without changing the decision.

**Source.** omarchy-ask `a6351b0` (MIT, © 2026 Clickety Clacks) merged in as
git remote `omarchy-ask` with `--allow-unrelated-histories`. Plugin files at
the repo root; nixi's programs stay in `bin/`, `share/`, `skills/`, `nix/`.
Upstream's copyright line kept verbatim; fork point recorded in
`docs/FORK.md`.

**Rebrand** (visible branding only, in place):
`clickety-clacks.ask` → `io.github.olafkfreund.nixi`; `Omarchy Ask`/`Ask` →
`Nixi`; `~/.config/omarchy/ask.json` → `~/.config/omarchy/nixi.json`;
`ASK_*` → `NIXI_*`; `omarchy-ask-acp-bridge` → `nixi-acp-bridge`.
Never renamed: the copyright line, `qs.Commons`, `qs.Ui`, `Quickshell.*`,
`omarchy-shell`, `OMARCHY_PATH`, `MenuModel`.

**NixOS portability.**
- `MenuSearch.qml:18` imports `MenuModel.js` from
  `/run/current-system/sw/share/omarchy/shell/plugins/menu/MenuModel.js`
  (byte-identical to the one under `OMARCHY_PATH`). Menu **data** keeps coming
  from `OMARCHY_PATH` (`MenuSearch.qml:23-24`), because nixarchy's data differs
  and the profile path's would bring back `pacman` Install rows.
- Shebangs (`#!/usr/bin/gjs` in `bridge/preview.js`, `#!/usr/bin/env node` in
  four bridge scripts) patched with `patchShebangs`.

**Adapters.** `bridge/package.json` drops
`@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp`;
the lock is regenerated so `@anthropic-ai/claude-agent-sdk` and `@openai/codex`
binaries are gone. Adapters come from nixpkgs' `claude-agent-acp` 0.75.1 and
`codex-acp` 1.10.0 at runtime. `nix build .#nixi` needs no `allowUnfree`.
**Plan-time:** the bridge's default launch today is the bundled path
`node_modules/<name>/…` (`bridge.js:26-31`); that default becomes the bare
command `claude-agent-acp` / `codex-acp` resolved from `PATH`, with the
`NIXI_ACP_COMMAND` / `NIXI_CLAUDE_ACP_COMMAND` / `NIXI_CODEX_ACP_COMMAND`
overrides unchanged.

**Package.** `buildNpmPackage` for the bridge's `node_modules` from the new
lock; `autoPatchelfHook` for the `@ff-labs/fff-node` and `@yuuang/ffi-rs`
Linux prebuilts (if they cannot be made to load, file search is disabled for
milestone 1 rather than blocking it); output at
`$out/share/omarchy/plugins/io.github.olafkfreund.nixi/`.
**Plan-time:** the package takes optional `claudeAcp` / `codexAcp` arguments;
when given, a wrapped bridge launcher sets the adapter commands to their store
paths with `--set-default`. The Home Manager module passes the user's nixpkgs
packages in, so their unfree decision stays in their config.

**Trust.**
Guide is the default. **Plan-time — refines the spec's "enforced by the
agent" claim:** asked over ACP, the adapters describe their modes as follows.
Neither is a hard read-only guarantee by itself.

| agent | modes offered (verified by `session/new`) |
|---|---|
| claude-agent-acp | `default` "Always ask before making changes" · `acceptEdits` · `plan` "Create a plan before making changes" · `auto` · `bypassPermissions` |
| codex-acp | `read-only` "Always ask to edit external files and use the internet" · `agent` · `agent-full-access` |

So Guide's guarantee is **the bridge cancelling every permission request**,
with the mode as a second layer:

| nixi | Claude mode | Codex mode | bridge `requestPermission` |
|---|---|---|---|
| **Guide** (default) | `plan` | `read-only` | always `cancelled`, never shown |
| **Mechanic** | `default` | `read-only` | queued in the card, needs `Y` |
| **YOLO** | `default` | `read-only` | upstream's `allow_once` auto-select; only reachable from Mechanic |

Switched with `connection.setSessionMode({ sessionId, modeId })` (present in
`@agentclientprotocol/sdk`) after `newSession`. Stored as `trust` in
`nixi.json`; unknown or missing values resolve to Guide. Typed commands
`/guide` and `/mechanic` switch it; the corner label shows `GUIDE`,
`MECHANIC` or `YOLO`.

**Grounding.** `NIXI_CWD` defaults to `~/.config/nixi`, so the agent loads
nixi's `CLAUDE.md`. Before each prompt the bridge runs `bin/nixi-context
"<question>"` — nixi-server's `local_answer()` and `_keybinds()` extracted
unchanged — and prepends its output as a context block.

**Tour and learning path.** Commands `/tour` and `/learn`, plus search rows;
no permanent buttons. Content moves to `share/tour.json` and
`share/learn.json`. Progress detection in a new `Tour.qml` using
`Quickshell.Hyprland` events.
**Plan-time — the Python matchers are lambdas, so the JSON needs a matcher
format.** Every existing matcher (`bin/nixi-server:621-698`) fits:

```json
{ "text": "…", "count": 1, "match": { "event": "openwindow", "classAny": ["foot","alacritty","kitty","ghostty","com.mitchellh.ghostty"] } }
{ "text": "…", "count": 4, "match": { "event": "activewindow" } }
{ "text": "…", "count": 1, "match": { "check": "defaultAgent" } }
```

**Plan-time — one step cannot be carried over.** The tour's last step waits
for `openwindow` containing `127.0.0.1`, which is the browser widget. The
overlay has no such window, so that step would never complete. It becomes
`{ "match": { "self": "opened" } }`, satisfied by `Tour.qml` when the card is
summoned.

**FAQ** entries (`share/faq.json`) become search rows; no chips.

**Bar button kept; hotkey `SUPER+H`.** **Plan-time:** one manifest with
`"kinds": ["overlay", "bar-widget"]` and entry points `overlay` and
`barWidget` — the exact shape of first-party `omarchy.menu`
(`["menu", "bar-widget"]`). `shell.qml:771` treats first-party plugins'
bar-widget registry differently, so a third-party plugin in this shape must be
verified; fallback is a second tiny plugin `io.github.olafkfreund.nixi-button`.
`bin/nixi` becomes `exec omarchy-shell shell toggle io.github.olafkfreund.nixi '{}'`.

**Unchanged:** `bin/nixi-update-manual`, `bin/nixi-watch`, the nixi skill,
Omarchy hooks, `share/KNOWLEDGE.md`. Integration toggles stay in Home Manager
options and `install.py` flags, not in the card.

**Removed:** `share/ui.html`, `share/vendor/`, the HTTP server
(`bin/nixi-server`, after extraction), `BarWidget.qml`, `nixi-launch`, the
`bin/nixi` browser/polling logic, `nixi.service`, and all voice input
(routes, `pw-record`/whisper code, `services.nixi.voice.*`, model pins,
`install.py --with-voice`, its tests and README text).

**Testing on p620, plan-time.** The spec says to symlink the build into
`~/.config/omarchy/plugins/`. That exact path is taken:
`~/.config/omarchy/plugins/io.github.olafkfreund.nixi/` is **owned by Home
Manager** on p620 as of 2026-09-15 (symlinks into `home-manager-files`).
Writing there would collide with Home Manager and replace the running nixi.
So milestone testing uses a **test id, `io.github.olafkfreund.nixi-next`**,
set only in the test symlink's manifest copy; the real id is used from the
migration step onward. nixarchy already installs plugins as whole-directory
store symlinks (`marcford.gmessages`, `olafkfreund.ai-mirror`), so the pattern
is proven on this shell.

**Migration.** Additive until milestone 2 passes on a host. p620 migrates
through the Home Manager module (it is HM-managed now); razer through
`install.py` unless re-checked otherwise. Each host's switch is announced on
the agent bus first.

## Steps

Each step ends in a commit. A step does not start until the previous one's
check passes.

### Milestone 1 — rebranded overlay running on p620

1. **Merge upstream.** `git remote add omarchy-ask https://github.com/clickety-clacks/omarchy-ask`;
   `git merge --allow-unrelated-histories a6351b0`. Resolve add/add conflicts:
   `LICENSE` keeps both copyright blocks; `manifest.json`, `*.qml`, `bridge/`,
   `docs/architecture.md`, `docs/testing.md`, `assets/` take upstream;
   `README.md`, `CONTRIBUTING.md`, `.gitignore`, `.github/workflows/ci.yml`
   keep nixi's (rewritten in steps 20–21); upstream's
   `.github/workflows/release.yml` and `releases/` are deleted.
   → verify: `git merge-base --is-ancestor a6351b0 HEAD`; no conflict markers
   (`git grep -nE '^(<{7}|>{7})'` empty).

2. **Attribution.** `LICENSE` carries both notices; `docs/FORK.md` gains an
   "omarchy-ask fork" section: fork point, what was renamed, what was changed.
   → verify: `grep -c 'Clickety Clacks' LICENSE` = 1 and `docs/FORK.md` names `a6351b0`.

3. **Rebrand** per the table, as a scripted rename followed by a reviewed diff.
   → verify: `git grep -nIE '[Oo]marchy [Aa]sk|clickety-clacks\.ask|ask\.json|\bASK_'`
   matches only `LICENSE` and `docs/FORK.md` (case-sensitive for `ASK_`: with
   `-i` it also matches nixi's own lowercase `ask_agent()`-style Python
   functions, which are not branding and are deleted in step 16);
   `node --test bridge/harness-policy.test.js bridge/harness-errors.test.js` passes.

4. **Hard-coded paths.** `MenuSearch.qml:18` → the profile path. **Added
   during implementation:** the QML also hard-codes the bridge location as
   `~/.config/omarchy/plugins/<id>/bridge/*.js` in seven places
   (`Conversation.qml` ×3, `MenuSearch.qml` ×4). That breaks the step 7 test
   id — a plugin at `…/nixi-next/` would look for its bridge in Home Manager's
   `…/nixi/` directory — and any store install. Each becomes
   `root.bridgeScript(name)`, resolved with `Qt.resolvedUrl` next to the QML
   file, the convention `Ask.qml:238` already uses for `HarnessSelector.qml`.
   `MenuSearch.qml:23`'s `/usr/share/omarchy` data fallback is removed rather
   than repointed: the profile copy is the upstream data with `pacman` rows,
   and the shell itself has no fallback.
   → verify: `git grep -n '/usr/share/omarchy' -- '*.qml'` and
   `git grep -n 'plugins/io\.github\.olafkfreund\.nixi/bridge' -- '*.qml'` are
   empty; the data path still reads `OMARCHY_PATH`; `qmllint` reports no syntax
   errors in any QML file (confirmed to catch one on a deliberately broken copy).

5. **Drop bundled adapters.** Remove the two adapter packages from
   `bridge/package.json`; regenerate `bridge/package-lock.json`; change the
   default launch in `bridge.js` to the bare command on `PATH`.
   → verify: the lock contains no `@anthropic-ai/` and no `@openai/` package;
   bridge tests pass; a new bridge test asserts the default command is
   `claude-agent-acp` / `codex-acp`, not a `node_modules` path.

6. **Package.** Extend `nix/package.nix`: `buildNpmPackage` bridge,
   `autoPatchelfHook`, `patchShebangs` (with `gjs`), optional
   `claudeAcp`/`codexAcp` wrapper, plugin directory in `$out`; keep
   `nixi-update-manual` and `nixi-watch`. **Changed during implementation:**
   - *Additive, not a rewrite.* The Home Manager module still reads the old
     layout (`ui.html`, `vendor/`, `plugin/BarWidget.qml`, `nixi-server`); a
     rewrite would leave it unable to evaluate until step 17. The old contents
     stay until step 16 removes them.
   - *Programs launched by name are pinned in the built copy.* The plugin runs
     `node`, `gjs`, `fd` and `gdbus` by bare name, which resolve from the
     Omarchy shell's `PATH`. On p620 `gjs` is not installed and `node`/`fd`
     are only in one user's profile. Each is substituted with its store path
     (`--replace-fail`); the repository copy stays upstream-comparable.
     `xdg-open` is left to the desktop.
   - *No symlinks.* `omarchy plugin validate` rejects any symlink inside a
     plugin folder; npm's `node_modules/.bin` is removed (CLI entry points the
     bridge never runs).
   - *Runtime node is `nodejs-slim`*, and dependency shebangs that
     `buildNpmPackage` pointed at full `nodejs` are repointed, so `npm` and
     `corepack` stay out of the closure. The closure is 545 MB, most of it
     `python3` (already there), `gjs` and `node`.
   → verify: `nix build .#nixi` with `allowUnfree` unset;
   `omarchy plugin validate $result/share/omarchy/plugins/io.github.olafkfreund.nixi` passes;
   `node -e "require('$bridge/node_modules/@ff-labs/fff-node')"` loads (or file
   search is disabled and noted); `nix path-info -r` shows no
   `claude-agent-sdk` or `codex` store path.

7. **Run it on p620.** Announce on the agent bus. Copy the plugin directory
   to the scratchpad, set the test id `io.github.olafkfreund.nixi-next` in the
   copy's manifest, symlink it into `~/.config/omarchy/plugins/`,
   `omarchy plugin enable io.github.olafkfreund.nixi-next`, then
   `omarchy-shell shell toggle io.github.olafkfreund.nixi-next '{}'`, with
   `NIXI_CLAUDE_ACP_COMMAND` pointing at nixpkgs' `claude-agent-acp`.
   → verify, all on p620: the card appears; a question streams a reply;
   typing `install` lists nixarchy's Install row and its action has no
   `pacman`; `journalctl --user` shows no `MenuModel.js` import error; the
   existing `io.github.olafkfreund.nixi` plugin and its bar icon are untouched.

**⏸ Milestone 1 gate:** report the result to the user before starting step 8.

**Step 7 results (p620, 2026-09-15)** — recorded at the gate, before step 8.

Verified without a person at the keyboard:
- The card renders natively in the live shell: a `nixi` layer surface on
  DP-1, 0.7 s after `omarchy-shell shell toggle`, with **no QML errors**
  (no `MenuModel.js` import failure, no `qs.Ui` incompatibility on 4.0.3).
- The bridge starts from the pinned `nodejs-slim` (step 6) and from the test
  plugin's own `…/nixi-next/bridge/` directory (step 4's `Qt.resolvedUrl` fix).
- The bridge streams: driven headless through the same `nixi-node` wrapper
  and the shell's real `PATH`, a reply arrived as 48 chunks over 2.9 s.
- The bridge exits when the card closes; no process is left behind.
- The menu data the card reads is nixarchy's (`OMARCHY_PATH`: 246
  nixarchy/`apps.nix` references vs 10 in the profile copy). This checks the
  file, not a typed search in the card.
- The Home Manager-managed `io.github.olafkfreund.nixi` and `nixi.service`
  were untouched; three bars on three monitors, no doubled bar.

Found:
- **`omarchy-shell shell rescanPlugins` re-instantiates every plugin**, not
  just new ones. On p620 it produced ~40 "Handler was registered but will not
  be used" warnings over 5 s, IPC timed out meanwhile, and `omarchy plugin
  list` briefly returned nothing. The shell recovered by itself (verified:
  30 s idle with no log activity, then `listPlugins` answered in 0.1 s).
  `omarchy plugin enable` itself caused no reload. Any future test install
  should expect this, and step 22 should prefer the shell's normal start-up
  discovery over a rescan.
- `claude-agent-acp` is not on the Omarchy shell's `PATH` on p620 (read from
  the shell process's environment), so an unpinned install shows the
  "adapter is not on the system PATH" message. The test used the package's
  `claudeAcp` argument, which is how step 17's module supplies it.
- The flake's pinned nixpkgs provides `claude-agent-acp` **0.70.0**, not the
  0.75.1 read from the system registry at spec time.
- When summoned from a terminal with nobody interacting, the card closes by
  itself after ~1.9 s, through upstream's outside-dismiss path. Expected for
  an ephemeral launcher; unconfirmed until a person summons it with a key.
- Two `bridge.js` processes start on summon and one exits within 2 s. Upstream
  says one conversation owns one bridge; the second is unexplained and
  short-lived. To identify before step 10, which changes session start-up.

Not yet verified, needs a person at the keyboard: the card stays open when
summoned by key; a question typed into the card streams visibly; typing
`install` shows nixarchy's Install row.

### Milestone 2 — nixi's features inside the overlay

8. **`bin/nixi-context`.** Extract `local_answer()`, `_keybinds()` and their
   helpers from `bin/nixi-server` into a stdlib CLI that prints the excerpt.
   → verify: `nixi-context "how do I install an app"` prints text containing
   `nixarchy apply`; `test_local_search` runs against it.
   **Found during implementation, not covered by this plan:** nixi-server also
   runs the *learned-fact broker* (`absorb_learned()`): the agent ends a reply
   with `LEARNED:` lines, the server strips them from what the user sees and
   appends them privately to `~/.local/share/nixi/LEARNED.md`, which
   `nixi-context` then searches. Step 16 deletes nixi-server, so without a
   decision this feature disappears silently and raw `LEARNED:` lines start
   appearing in the card. It must be either moved into the bridge's reply
   handling or dropped on purpose, decided before step 16.

9. **Grounding in the bridge.** `NIXI_CWD` default `~/.config/nixi`; run
   `nixi-context` before each prompt; prepend its output.
   → verify: a bridge test with a stub `nixi-context` asserts the prompt sent
   over ACP contains the excerpt; on p620, "how do I install an app" answers
   with `nixarchy apply`.
   **Result (p620):** the real agent, through the packaged bridge with the
   Omarchy shell's own `PATH`, answered "how do I install an app" with
   `nixarchy apply` and the `apps.nix` queue, and no `pacman`/`yay`.
   **Input for step 10, found here:** in its new working directory the agent
   follows nixi's `CLAUDE.md` and verifies live, so even that ordinary question
   produced a permission request — for a *pipeline*,
   `omarchy menu keybindings --print 2>/dev/null | grep … | head`. Nothing
   answered it headless, which is why the first run hung. Guide cancelling every
   request (step 10) is therefore not an edge case but the common path, and the
   agent then says it could not verify. Allow-listing "read-only" commands is
   rejected: the request is a shell pipeline, so string matching cannot tell a
   harmless one from `…; rm -rf ~`. Live keybindings already reach the agent
   through `nixi-context` when a question mentions keys; that is the route to
   widen if Guide's answers need more live facts.

10. **Trust modes.** `trust` in `nixi.json` (default Guide); a pure
    `trust-policy.js` returning `{ modeId, permission }` per agent and trust,
    mirroring `harness-policy.js`; `setSessionMode` after `newSession`;
    `requestPermission` cancels in Guide; YOLO rejected unless trust is
    Mechanic; `/guide`, `/mechanic` commands; corner label.
    → verify: `trust-policy.test.js` covers every row of the trust table and
    unknown values → Guide; on p620 with Claude **and** Codex: Guide asked to
    create `~/nixi-guide-probe` leaves no file and shows no prompt; Mechanic
    shows a prompt, deny → no file, allow → file (then removed).
    **Result (p620, real agents through the packaged bridge):**

    | agent | Guide | Mechanic, deny | Mechanic, allow |
    |---|---|---|---|
    | Claude | 0 prompts, no file | 1 prompt, no file | 1 prompt, file |
    | Codex | 0 prompts, no file | 1 prompt, no file | 1 prompt, file |

    Claude's blocked Guide request was plan mode's own "Ready to code?" — the
    two layers working together. Codex has no `plan`, so its Guide result is
    the bridge's cancellation alone. Bridge tests 21/21; each of the four
    guarantees (Guide cancels, YOLO unreachable from Guide, default is Guide,
    policy says cancel) was removed in turn and failed the suite.
    Card: clicking the corner label keeps upstream's YOLO toggle inside
    Mechanic only; in Guide it explains how to leave, so leaving Guide is
    always a typed `/mechanic`.

    **Step 7's open item, resolved before this step as the plan required:** the
    two `bridge.js` processes on summon were an artefact of `rescanPlugins`
    loading the plugin twice. In a fresh shell one toggle starts exactly one
    bridge (verified; the process is named `MainThread`, which is why an
    earlier `comm == node` filter saw none), so upstream's one-conversation,
    one-bridge invariant holds. The ~1.9 s self-dismiss was not seen in the
    fresh shell either: the card stayed open until toggled closed.

11. **Tour and learning data.** `share/tour.json` and `share/learn.json`
    generated from `TOUR` and `CURRICULUM`, with the matcher format above and
    the last step as `self: opened`.
    → verify: a `test_nixi.py` check validates both files' schema and that every
    `TOUR` step has a JSON counterpart; none contains `127.0.0.1`.

12. **`Tour.qml`.** Hyprland event matching, step counts, `self: opened`,
    `defaultAgent` check; `/tour` and `/learn` commands; learning progress in
    `~/.local/share/nixi/learning.json` (progress only, no transcript).
    → verify on p620: `/tour` shows step 1; opening a terminal advances the
    terminal step; summoning the card completes the last step.
    **Status: the logic is tested, the interaction is not.** TourModel.js is
    unit tested under node against the real share/tour.json (8 tests, three
    mutations checked), and the card loads in the live shell with Tour.qml
    instantiated and no QML errors. Typing `/tour`, the pin, advancing on real
    events and `/learn` need a person at the keyboard; deferred to the
    milestone 2 human test with steps 13-15.
    **Design point, revised in step 15:** `/tour` does NOT pin its card. It
    first did (the old widget was a pinned window), but tested on p620 a pinned
    card is an ordinary toplevel that Hyprland tiles to fill the workspace
    (1261x1390) -- the user rejected it as far too big. Pinning was also
    unnecessary: the unpinned card closes only on an outside click, and tour
    state lives in the Ask.qml manager, so the card may close while you follow
    a step and reopening it shows where you are. A card the user pins with
    Ctrl+P still receives steps (`tourCard`).
    **Two gaps found here, both about nixi-server's removal in step 16:**
    - `observed` in learning.json is read by nixi-server and written by nothing,
      so "the learning path skips what the watcher has seen you use" has never
      worked. The `observe` field is carried into learn.json and honoured by
      TourModel, but nothing populates it yet.
    - `bin/nixi-watch` POSTs to the server's `/minimize` when the screensaver
      starts, to hide the old widget. Step 16 deletes that endpoint. The
      overlay closes on focus loss by itself, so the call should simply be
      removed rather than reimplemented.

13. **Search rows.** FAQ entries, `Tour`, `Learn` added as rows beside menu
    rows and apps in `MenuSearch.qml`.
    → verify on p620: typing `install` shows the FAQ answer row and nixarchy's
    Install row; typing `tour` shows the tour row.

14. **Bar button: the fallback was needed.** One manifest with both kinds does
    NOT work for a third-party plugin on Omarchy 4.0.3. Measured on p620: with
    `kinds: ["overlay","bar-widget"]`, `omarchy plugin enable` reported success
    but the plugin stayed `enabled=false` and never entered the bar layout.
    `shell.qml`'s `isBarWidgetPanelPlugin()` returns false for any plugin that
    also declares `panel`/`overlay`/`menu`, and `omarchy.menu` only gets away
    with it because first-party manifests take a different registry path
    (`pluginBarWidgetRegistryFor`, `__isFirstParty`).

    So the button ships as a second small plugin, `io.github.olafkfreund.nixi-button`
    (`kinds: ["bar-widget"]`), reusing nixi's existing snowflake `BarWidget.qml`
    — moved to `button/` and repointed from launching the browser to
    `omarchy-shell shell toggle`. It derives the overlay's id by stripping
    `-button` from its own, so a test copy toggles itself rather than the
    installed Nixi. **Consequence for step 16:** `BarWidget.qml` is repurposed,
    not removed; `nixi-launch` still goes.
    → verified on p620: the button plugin is `enabled=true` and appears in the
    bar layout, which the two-kind manifest never did. The icon rendering and
    the click are deferred to the milestone 2 human test.

15. **`bin/nixi`** becomes the one-line toggle.
    → verify: `SUPER+H` and the Omarchy menu Help row both open the card
    (with the test id during testing).
    **Result on p620:** `nixi --tour` summons the card with the tour payload.
    Three tour bugs found by looking at the card, all fixed here:
    - Pinning at creation made the card vanish, then pinning at all made it a
      full tiled window. The pin is removed (see step 12's design point).
    - Each step was shown twice: `start()`/`opened()` showed the step after
      `advanceTo()` had already shown it. `advanceTo()` now only reports
      whether the step moved; each entry point shows it once.
    - Line breaks collapsed: the card renders CommonMark, where a lone `\n` is
      a space and a plain line after a bullet joins it ("try it Bonus: ...").
      tour.json uses blank lines; test_nixi.py rejects a lone newline not
      followed by a list item (checked against the old data: fails).
    `test_port_is_configurable` no longer lists `bin/nixi`, which has no port.
    Checked on screen: compact overlay, "Tour 2/11" once, "Bonus:" on its own
    paragraph. `SUPER+H` and the Help row still need a person at the keyboard.
    **Follow-up, same step: the card opens empty.** The user wants no text
    before they ask anything. Opening the card no longer re-shows the running
    tour step; `/tour` (or `nixi --tour`) resumes it where it is, and a step
    that completes on summon still reports. The ACP-adapter error on open was
    the test install, not the code: plain `nix build .#nixi` has no adapter by
    design, because nixpkgs' `claude-agent-acp` depends on the unfree
    `claude-code` (pinning it by default was tried and fails without
    `allowUnfree`). Built as step 17's module will build it
    (`claudeAcp = pkgs.claude-agent-acp`, `codexAcp = pkgs.codex-acp`), the
    bridge reaches `ready`. **Test-install gotcha:** the shell kept the cached
    `Conversation.qml`, which embeds the previous build's `nixi-node` store path,
    across rsync + `rescanPlugins`; only `omarchy-restart-shell` loaded the new
    one. After replacing a build, restart the shell, not just rescan.

16. **Remove the old widget and voice.** Delete everything under *Removed*.
    → verify: `git grep -nIE '/voice|/listen/|pw-record|whisper|NIXI_WHISPER|ui\.html|8642|X-Nixi-Token'`
    matches nothing outside `docs/FORK.md` and `intent/`, `spec/`, `plan/`.

17. **Home Manager module.** Link `$pkg/share/omarchy/plugins/io.github.olafkfreund.nixi`
    as a whole-directory symlink; new option `services.nixi.agents`
    (default: Claude and Codex from nixpkgs) passed into the package's
    adapter arguments; remove `nixi.service` and `services.nixi.voice.*` and
    `port`; keep watcher, manual timer, skill, hooks, menu entry.
    → verify: a Home Manager activation built from a test flake with
    `allowUnfree = true` has the plugin link and a bridge wrapper naming the
    adapter store paths; the same module with `services.nixi.agents = []`
    builds without `allowUnfree`.

18. **`install.py`.** Drop the server unit and voice; `npm ci` in `bridge/`
    when `npm` is present (the plugin-manager path cannot use Nix); report
    which adapters and whether file search are available.
    → verify: `install.py --no-systemd --all` into a throwaway `HOME` places
    the plugin and reports adapters; `--status` has no `voice` key.

19. **Tests.** `tools/test_nixi.py`: remove HTTP-server and voice checks; add
    the rebrand guard (step 3), the portability checks (steps 4–5, including
    "lock has no bundled adapter"), the tour-data schema (step 11), and extend
    `test_no_runtime_rename`. Bridge tests run with `node --test`.
    → verify: `python3 tools/test_nixi.py` and `node --test bridge/*.test.js`
    pass; each new check fails when its bug is reintroduced.

20. **CI.** Replace the server smoke test and the `nix run` browser job with:
    `nix build .#nixi` (no unfree), `node --test` on the bridge, Home Manager
    evaluation (test flake allows unfree), the offline installer run with
    `npm ci` skipped, and lint (ruff, shellcheck, actionlint, plus
    `omarchy plugin validate` where available).
    → verify: `actionlint` clean; all jobs green on the PR.

21. **Docs.** Rewrite `README.md`, `CONTRIBUTING.md`, `SECURITY.md` for the
    overlay; keep upstream's `docs/architecture.md` rebranded with a nixi
    section for grounding, trust and tour.
    → verify: `git grep -nE 'ui\.html|8642|token|voice|browser'` in the docs
    only where describing history.

22. **Migrate p620, then razer.** Announce on the bus. Remove the test id
    plugin. p620: rebuild with the updated `services.nixi` module. razer:
    re-check its install method, then migrate the same way.
    → verify, per host: every milestone 2 check from the spec passes with the
    real id; `nixi.service` is gone and `ss -ltn` shows nothing on 8642;
    `SUPER+H` and the Help row open the card; no transcript file exists.

23. **PR** linking `intent/`, `spec/` and `plan/` files; review compares the
    diff against this plan.

## Tests

```bash
python3 tools/test_nixi.py                      # all checks pass
node --test bridge/*.test.js                    # upstream + trust-policy + launch tests
nix build .#nixi                                # with allowUnfree unset
omarchy plugin validate result/share/omarchy/plugins/io.github.olafkfreund.nixi
git grep -nIE '[Oo]marchy [Aa]sk|clickety-clacks\.ask|ask\.json|\bASK_'   # only LICENSE, docs/FORK.md
nix path-info -r ./result | grep -E 'claude-agent-sdk|codex'         # empty
```

Runtime, on p620 (milestones 1 and 2) and razer (migration):

- card appears on toggle; replies stream
- `install` search row comes from nixarchy data, no `pacman`
- "how do I install an app" → `nixarchy apply`
- Guide write-probe leaves no file, for Claude and Codex
- Mechanic write-probe prompts; deny → no file
- `/tour` advances on a real terminal open and completes on summoning the card
- bar icon toggles the card; `SUPER+H` and the Help row open it
- no transcript on disk after a session

## Rollback

- **Before migration (steps 1–21):** nothing on any host depends on the
  branch. On p620 the test plugin is removed with
  `omarchy plugin disable io.github.olafkfreund.nixi-next` and deleting its
  symlink; the Home Manager-managed nixi is never touched.
- **After migration on a host (step 22):** p620 — revert the `services.nixi`
  module input to the previous nixi revision and rebuild, which restores the
  old plugin files and `nixi.service`. razer — check out `master` in the
  plugin directory and run `install.py --refresh`.
- **Repository:** the branch is unmerged until step 23; abandoning it leaves
  `master` unchanged. After merge, `git revert` the merge commit.
