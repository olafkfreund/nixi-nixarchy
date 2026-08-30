# Archy — the Omarchy guide

A beginner-friendly tutor for [Omarchy](https://omarchy.org), one keypress
away. Ask it anything — "how do workspaces work?", "how do I install an
app?", "what does SUPER+S do?" — and it answers in plain language, grounded
in YOUR machine, not a stale manual.

**Two tiers:** simple questions are answered instantly and offline from a
bundled copy of the official manual (plus your live keybindings) — no LLM
call, no cost, works without any AI signed in. The AI tier kicks in only for
deeper questions, or when you tap "deeper answer".

Under the hood it's a [Claude Code](https://claude.com/claude-code) session
(Omarchy ships Claude Code) preloaded with:

- **KNOWLEDGE.md** — verified Omarchy 4 facts (keys, workspaces, scratchpad,
  webapps, themes, updates, config layout)
- **Live grounding** — before asserting a keybinding it checks
  `omarchy menu keybindings --print`, so it knows *your* customizations too
- **LEARNED.md** — it appends what it verifies and what you correct, so it
  gets better on your machine over time

## Install (Omarchy plugin — recommended)

    omarchy plugin add https://github.com/respira-crece-lidera/archy-omarchy.git --enable

The 👾 invader appears in your bar (place it with `omarchy bar put`).
**First click** runs Archy's one-time setup — with that click you consent to:
per-user config in `~/.config/omarchy-help/`, two user services
(`omarchy-help`, `omarchy-help-watch`), a Help entry merged (non-destructively)
into your Omarchy menu, and a one-shot welcome hook. Nothing touches system
files, nothing runs as root, no existing configuration is overwritten.

## Remove

    omarchy plugin remove io.github.respira-crece-lidera.archy
    systemctl --user disable --now omarchy-help omarchy-help-watch
    rm -rf ~/.config/omarchy-help ~/.local/share/omarchy-help \
       ~/.local/bin/omarchy-help* ~/.config/systemd/user/omarchy-help*
    # plus the "help" entry in ~/.config/omarchy/extensions/omarchy-menu.jsonc

## Dependencies

- `python` (stdlib only) and `curl` — required
- An AI agent for the chat tier: whatever `omarchy default agent` is set to
  (Claude Code and Codex supported headless; the tour, starter chips, and
  coaching work with **no agent at all**)
- License: MIT. No telemetry; all traffic stays on 127.0.0.1 except your
  agent's own API calls and the optional manual refresh from GitHub.

## Install (manual / non-plugin)

    git clone <this repo> && cd omarchy-helper && ./install.sh

Then run `omarchy-help`, find **Help** in the Omarchy menu (SUPER+SPACE), or
bind a key (the installer prints the one-liner). Requires Claude Code signed
in with your account.

## Uninstall

    rm -rf ~/.config/omarchy-help ~/.local/bin/omarchy-help
    # plus the "help" entry in ~/.config/omarchy/extensions/omarchy-menu.jsonc

## Design notes

- No daemon, no sudo, no telemetry: three text files and a shell script.
- Machine-specific notes can go in `~/.config/omarchy-help/LOCAL.md` — the
  tutor reads it if present (useful for fleet/dotfile setups).
- Knowledge lives in plain Markdown — PRs that correct or extend
  KNOWLEDGE.md are the whole point.

## Credits

Created by **Luke Warren Wills** — [@lukemallorca](https://instagram.com/lukemallorca) on Instagram. Open source under the MIT license: use it, fork it, improve it.
