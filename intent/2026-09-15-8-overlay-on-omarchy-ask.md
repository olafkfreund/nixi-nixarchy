---
status: draft
issue: 8
author: olafkfreund
---

# Intent: Rebuild nixi as a native Omarchy overlay on the omarchy-ask codebase

## Problem

nixi's interface does not feel like part of Omarchy, and the architecture
underneath it keeps producing bugs that have nothing to do with helping anyone.

The widget is an HTML page in a Chromium `--app` window. To make that behave
like a desktop panel, nixi runs a loopback HTTP server and defends it (session
token, peer-uid check, Host/Origin allowlist, CSP), launches a browser, polls
for the window to appear, and injects a Hyprland window rule to pin it. Each
of those layers has already failed on a real machine:

- the window rule never applied, because of a Lua escape (`\.` in a quoted
  string), leaving the widget tiled instead of pinned;
- test servers on spare ports overwrote the live server's token file, breaking
  every CLI caller with a bare 403;
- voice input depended on which browser opened the widget, and on nixpkgs'
  Chromium the browser speech API is a silent no-op.

The screen itself is crowded: header, avatar, subtitle, gear, minimise,
greeting, tour and learning buttons, a progress counter, FAQ chips, an avatar
per message, source badges, action buttons, and an input box — all at once.

[clickety-clacks/omarchy-ask](https://github.com/clickety-clacks/omarchy-ask)
solves the same shape of problem natively. It is a QML `overlay` plugin that
the Omarchy shell owns and toggles; it talks to the agent over ACP through a
stdio bridge, with streamed replies and permission requests shown in the UI;
it takes its look from the shell's theme; and its whole interface is one card
that shows nothing until it is relevant. It has none of nixi's
nixarchy-specific value, though: no grounding in the nixarchy manual, no
guided tour, no learning path.

Voice input is also carrying weight nobody uses, while Omarchy already ships
dictation (Voxtype, `omarchy voxtype`, installed on p620).

## Proposed outcome

nixi is omarchy-ask, rebranded, with nixi's features inside it. Delivered in
two observable milestones so it can be tried before the porting work:

**1. A rebranded overlay runs on p620.** `omarchy-shell shell toggle` on the
nixi plugin id summons a native nixi card, a question gets a streamed answer
from the default agent, and nothing calls itself "Ask" anymore.

**2. nixi's features work inside it.** On top of milestone 1:

- answers are grounded in the local nixarchy + Omarchy manual copy and nixi's
  knowledge, so "how do I install an app" says `nixarchy apply`, not `pacman`;
- the guided tour and the learning path are reachable from the card without
  permanent buttons;
- Guide / Mechanic trust levels are expressed through ACP's permission queue
  (Guide never changes the machine; Mechanic asks before each change);
- the manual updater, coaching watcher, agent skill and Omarchy hooks keep
  working;
- nixi installs declaratively from the flake on NixOS, with the ACP adapters
  from nixpkgs rather than `npm ci`.

Voice input is removed entirely — code, options, models and docs.

## Affected users and systems

- **This repository**: most of it. The HTML widget (`share/ui.html`, vendored
  `marked` and `DOMPurify`), the HTTP surface of `bin/nixi-server`, the
  `bin/nixi` launcher, and all voice code are expected to go.
- **p620 and razer**: both run nixi today via `omarchy plugin add`. Their
  installs, units, `SUPER+H` binding and Omarchy menu Help row will need
  migrating.
- **The Home Manager module and flake** (`nix/hm-module.nix`, `nix/package.nix`,
  `flake.nix`), and CI (`.github/workflows/ci.yml`), whose jobs test the HTTP
  server and the browser widget.
- **Other agents on the bus** who have installed or tested nixi, and whose
  instructions from yesterday (`install.py --with-voice`) become obsolete.

## Constraints

- **Attribution.** omarchy-ask is MIT, © 2026 Clickety Clacks. Its copyright
  and license notice must be kept, and the fork point (`a6351b0`) recorded —
  the same way `docs/FORK.md` records the original Omarchy fork.
- **Do not rename Omarchy's runtime integration points.** Anything the shell,
  `omarchy-shell`, `qs.Commons` or `qs.Ui` names stays exactly as it is; only
  nixi's own branding changes. The existing regression check for this applies.
- **Must work on NixOS and on Omarchy 4.0.3.** omarchy-ask is verified on
  `4.0.0-1`; our shell's `shell.qml` does load `overlay` plugins, but
  compatibility is unproven until it runs.
- **Declarative install.** No `npm ci` or network fetches at runtime for the
  NixOS path; `claude-agent-acp` (0.75.1) and `codex-acp` (1.10.0) are in
  nixpkgs.
- **Guide must stay safe by default.** The trust model may change shape but
  must not weaken: the default cannot modify the machine.
- **No transcript persistence regression.** omarchy-ask stores no transcript;
  nixi must not start writing one.
- **Nothing is removed from p620/razer until the replacement runs there.**

## Open questions

1. **Replace or run side by side?** Recommend replacing nixi's current widget
   on this branch outright, keeping the old one only on `master` until the new
   one is merged — rather than shipping both.
2. **Plugin id.** Keep `io.github.olafkfreund.nixi` so `omarchy plugin`
   upgrades in place (the kind changes from `bar-widget` to `overlay`), or take
   a new id? Recommend keeping it.
3. **Bridge language.** omarchy-ask's bridge is Node; nixi's code is stdlib
   Python. Recommend keeping Node, so upstream fixes can still be pulled —
   the ACP adapters need Node anyway.
4. **Stay mergeable with upstream, or hard fork?** Recommend keeping
   omarchy-ask as a git remote and changing its files in place, so upstream
   releases can be merged rather than re-applied by hand.
5. **Features that may not survive the move.** The FAQ chips overlap with
   omarchy-ask's live menu search, and a permanent bar button may be redundant
   once the overlay has a hotkey. Keep, fold in, or drop?
6. **Hotkey.** Keep nixi's `SUPER+H`, or adopt upstream's `CTRL+SHIFT+SPACE`?
