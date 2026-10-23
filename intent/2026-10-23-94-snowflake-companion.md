---
status: approved
issue: 94
author: olafkfreund
---

# Intent: An optional snowflake companion that obeys nixi's rules

## Problem

Nixi is a card you summon with a hotkey. It never shows on screen by itself and it
has no voice, because voice input was removed (`services.nixi.voice` is a removed
option in `nix/hm-module.nix`). Some users want a friendlier presence: a small
character on the desktop that they can talk to and watch work.

The fork `olafkfreund/nixoarchy-snowflake` already is that character. It is Void, a
voice-first orb for Claude Code (GTK3 + WebKit2GTK layer-shell overlay, local
speech-to-text and text-to-speech, moods, a melt-into-the-screen-edge notch). It
cannot be offered to nixi users as it is:

- **It goes around nixi's safety rules.** Void runs `claude -p` itself, with its own
  permission modes (`app/server.py` `build_cmd`: trust mode passes
  `--permission-mode bypassPermissions`). Its default "ask" mode approves edits
  inside the working folder without asking (`edit_needs_card`), and that folder
  defaults to the home directory. None of nixi's protections apply to it: Guide's
  read-only promise, the secret-read blocks in `bridge/trust-policy.js`, or the
  backups and undo in `bridge/changes.js`. A newcomer who sees a nixi companion would
  reasonably expect nixi's rules to cover it.
- **It changes the machine outside Nix.** It updates itself from upstream GitHub
  (`git pull` + `install.sh`, or `pkexec` a distro package manager), writes
  `exec-once` into `~/.config/hypr/hyprland.conf`, edits `~/.claude/settings.json`,
  and builds a `uv` virtualenv with packages downloaded when you install it.
- **It doesn't run on NixOS.** The launcher wants `~/.local/share/void/venv` and probes
  `/usr/bin/python3` for GTK bindings.
- **It looks like an orb, not a snowflake.** The fork is meant to give nixarchy its own
  character.

## Proposed outcome

- A user who sets `services.nixi.companion.enable = true` (and points
  `companion.package` at the fork's package) gets a `void` command. It shows a
  **snowflake** on the desktop. It has every one of Void's animations (moods, eyes,
  squish, glow, melt-to-notch and back) and works by voice or by typing.
- Everything the snowflake asks the agent goes **through nixi's bridge**. It follows the
  same trust level as the card (`trust` in `~/.config/omarchy/nixi.json`):
  - In Guide it changes nothing.
  - In Mechanic its approvals go through nixi's permission rules and can be undone.
  - Secret paths stay blocked.
- With the companion enabled, nothing updates itself, edits Hyprland or Claude config,
  or downloads packages at install time.
- With it disabled (the default), nixi's closure and behaviour are unchanged.

## Affected users and systems

- nixi: `nix/hm-module.nix` (new `services.nixi.companion` options), README/docs.
  `bridge/bridge.js` is reused as it is; changing it is not a goal.
- The fork `nixoarchy-snowflake`: `app/static/index.html` (snowflake),
  `app/server.py` (bridge mode, removed features), `bin/void`, new `flake.nix` and
  Nix package. Its issues are disabled, so this issue tracks that work too.
- Users of the nixi Home Manager module who opt in. Nobody else.

## Constraints

- Must not add a second path to the agent. Inside nixi, the companion only reaches the
  agent through the bridge (one conversation, one bridge, one ACP session:
  `docs/architecture.md` invariant 1).
- The bridge command must be fixed when the package is built. The environment must not
  be able to replace it (#76, #77).
- Must not bring back `services.nixi.voice`. The companion is a separate, opt-in app.
- Must not store a transcript (nixi stores none; `docs/architecture.md`, "Durable state
  and privacy").
- nixi must not gain a flake input or a dependency for users who leave it off.
- Speech stays on the machine. Downloading voice models is allowed, but only into the
  user's XDG cache, never into the store.
- Keep the fork mergeable with upstream: non-Nix installs keep Void's own behaviour.

## Open questions

1. **What is lost in bridge mode, and is that acceptable?**
   - The bridge sends only tool titles, not their output, so Void's little terminal
     shows steps only.
   - Screenshot attach and `void see` are off.
   - The model picker, cost meter and Claude plugin toggle are gone.
   - There is no conversation history.
2. **Which agent?** The companion uses `NIXI_AGENT`/`NIXI_MODEL` from the same settings
   as the card (proposed), or has its own choice.
3. **Startup:** launched only from a hotkey or the menu (proposed), or also a systemd
   user unit that starts it with the session.
4. **Accessories:** cat/bear/devil ears overlap the snowflake's upper arms. Accept that
   at first (proposed), re-anchor them, or hide those skins.

Resolved at approval (2026-10-23): the approver accepted the proposed answer to
each question: 1 acceptable, 2 same settings as the card, 3 hotkey/menu only,
4 accept the overlap at first.
