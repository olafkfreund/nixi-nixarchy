# Omarchy Helper

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

## Install

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
