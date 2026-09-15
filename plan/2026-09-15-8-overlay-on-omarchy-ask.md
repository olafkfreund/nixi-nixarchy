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
   → verify: `git grep -nIiE 'omarchy ask|clickety-clacks\.ask|ask\.json|\bASK_'`
   matches only `LICENSE` and `docs/FORK.md`;
   `node --test bridge/harness-policy.test.js bridge/harness-errors.test.js` passes.

4. **Menu logic import.** `MenuSearch.qml:18` → the profile path.
   → verify: `git grep -n '/usr/share/omarchy' -- '*.qml'` is empty, and the
   data path still reads `OMARCHY_PATH`.

5. **Drop bundled adapters.** Remove the two adapter packages from
   `bridge/package.json`; regenerate `bridge/package-lock.json`; change the
   default launch in `bridge.js` to the bare command on `PATH`.
   → verify: the lock contains no `@anthropic-ai/` and no `@openai/` package;
   bridge tests pass; a new bridge test asserts the default command is
   `claude-agent-acp` / `codex-acp`, not a `node_modules` path.

6. **Package.** Rewrite `nix/package.nix`: `buildNpmPackage` bridge,
   `autoPatchelfHook`, `patchShebangs` (with `gjs`), optional
   `claudeAcp`/`codexAcp` wrapper, plugin directory in `$out`; keep
   `nixi-update-manual` and `nixi-watch`.
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

### Milestone 2 — nixi's features inside the overlay

8. **`bin/nixi-context`.** Extract `local_answer()`, `_keybinds()` and their
   helpers from `bin/nixi-server` into a stdlib CLI that prints the excerpt.
   → verify: `nixi-context "how do I install an app"` prints text containing
   `nixarchy apply`; `test_local_search` runs against it.

9. **Grounding in the bridge.** `NIXI_CWD` default `~/.config/nixi`; run
   `nixi-context` before each prompt; prepend its output.
   → verify: a bridge test with a stub `nixi-context` asserts the prompt sent
   over ACP contains the excerpt; on p620, "how do I install an app" answers
   with `nixarchy apply`.

10. **Trust modes.** `trust` in `nixi.json` (default Guide); a pure
    `trust-policy.js` returning `{ modeId, permission }` per agent and trust,
    mirroring `harness-policy.js`; `setSessionMode` after `newSession`;
    `requestPermission` cancels in Guide; YOLO rejected unless trust is
    Mechanic; `/guide`, `/mechanic` commands; corner label.
    → verify: `trust-policy.test.js` covers every row of the trust table and
    unknown values → Guide; on p620 with Claude **and** Codex: Guide asked to
    create `~/nixi-guide-probe` leaves no file and shows no prompt; Mechanic
    shows a prompt, deny → no file, allow → file (then removed).

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

13. **Search rows.** FAQ entries, `Tour`, `Learn` added as rows beside menu
    rows and apps in `MenuSearch.qml`.
    → verify on p620: typing `install` shows the FAQ answer row and nixarchy's
    Install row; typing `tour` shows the tour row.

14. **Bar button.** Manifest `kinds: ["overlay", "bar-widget"]`, a minimal
    `BarWidget.qml` snowflake that toggles the overlay.
    → verify on p620 with the test id: the icon appears in the bar and toggles
    the card. If it does not appear, apply the fallback second plugin and
    update this plan in the same commit.

15. **`bin/nixi`** becomes the one-line toggle.
    → verify: `SUPER+H` and the Omarchy menu Help row both open the card
    (with the test id during testing).

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
git grep -nIiE 'omarchy ask|clickety-clacks\.ask|ask\.json|\bASK_'   # only LICENSE, docs/FORK.md
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
