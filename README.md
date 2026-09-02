# Archy — the Omarchy guide

![Archy](preview.png)

The guide that should come with [Omarchy](https://omarchy.org) — one
keypress away.
Archy grows with you — from your first boot to bending the OS to your will:

- **🚀 A live guided first tour.** Not a slideshow — Archy watches the
  compositor and verifies every step as you *actually do it*: open windows,
  close them keyboard-only, tile, float, switch workspaces, drive the menu.
  Eleven steps, about two minutes, and it starts by helping you connect
  your AI agent — the Omarchy way.
- **🎓 A learning path.** Fourteen stops from beginner to advanced,
  usage-aware: it skips what you already do daily.
- **👀 Gentle coaching.** "I noticed you haven't used workspaces — want to
  see how?" Evidence-based nudges, at most one a day, only for features you
  genuinely aren't using. Never a tip for a tip's sake.
- **💬 Answers to everything — about *your* machine.** The chat answers
  through your own configured Omarchy agent, grounded in the locally
  fetched official manual, your real live keybindings, and your machine's
  facts (terminal, browser, monitors). Omarchy-first answers: it says
  **SUPER+C**, not Ctrl+C. Real Markdown, and every file path it mentions
  is clickable — one click opens it in your editor.
- **🔧 "Do it for me."** Not ready to edit config files yourself? One button
  under the answer and Archy applies the fix — every file backed up first,
  the change verified, and the one-line undo reported back. Your click is
  the consent; nothing changes without it. Two trust levels in the ⚙ menu:
  **Fixer** (default) sticks to user-level config with a scoped command
  allowlist on a fast model; **Mechanic** gives your own agent its normal
  working powers on its strongest model — for when you want real changes
  done properly. Both still ask per fix, back up first, and never escalate privileges.
- **📚 It learns.** Verified facts and your corrections are appended to
  `LEARNED.md`, so it gets better on your machine over time.

No agent connected yet? The tour, learning path, coaching, and a curated
set of getting-started answers all work with no AI at all — and the first
thing Archy teaches is how to connect one.

## Install (Omarchy plugin — recommended)

    omarchy plugin add https://github.com/respira-crece-lidera/archy-omarchy.git --enable

The 👾 invader appears in your bar (place it with `omarchy bar put`).
**First click** installs the **core** — and only the core: per-user config
in `~/.config/omarchy-help/`, the widget server as a user service, and a
Help entry merged (non-destructively, atomically, with a backup) into your
Omarchy menu. Nothing touches system files, nothing runs as root, no
existing configuration is overwritten, and symlinked (dotfile-managed) files
are never written through — the installer refuses and rolls back instead.

Every **persistent extra is a separate, explicit choice** made inside the
widget (a card on first open; later in the ⚙ menu), each with its own
description and its own Enable/On switch:

- **Coaching watcher** — the usage-aware tip service (one tip a day, max)
- **Agent skill** — Archy's tutor method in `~/.claude/skills`
- **Boot & update hooks** — first-boot welcome, manual refresh after
  `omarchy-update`, weekly refresh timer

Manual installs: `./install.sh` (core) plus `--with-watcher`,
`--with-skill`, `--with-hooks`, or `--all`; every `--with-` has a
`--without-` twin. Updates only refresh what you already enabled.

## Remove

    omarchy plugin remove io.github.respira-crece-lidera.archy
    systemctl --user disable --now omarchy-help omarchy-help-watch
    rm -rf ~/.config/omarchy-help ~/.local/share/omarchy-help \
       ~/.local/bin/omarchy-help* ~/.config/systemd/user/omarchy-help*
    # plus the "help" entry in ~/.config/omarchy/extensions/omarchy-menu.jsonc

## Dependencies

- `python` (stdlib only) and `curl` — required
- An AI agent for the chat and 🔧 tiers: whatever `omarchy default agent` is
  set to (Claude Code and Codex supported headless; the tour, learning path,
  starter chips, and coaching work with **no agent at all**)
- License: MIT. Markdown rendering (marked + DOMPurify) is vendored — no
  CDN, everything serves from 127.0.0.1.

## Install (manual / non-plugin)

    git clone https://github.com/respira-crece-lidera/archy-omarchy.git
    cd archy-omarchy && ./install.sh

Then run `omarchy-help`, find **Help** in the Omarchy menu (SUPER+SPACE), or
bind a key (the installer prints the one-liner). Removal is the same as the
plugin's minus the `omarchy plugin remove` line.

## Your AI, your account, your data

- **Archy has no backend and no API key of its own.** AI answers run through
  the agent *you* already set up on Omarchy (Claude Code or Codex), on your
  own subscription or credits. Archy is tuned to be cheap about it: chat
  answers use the fastest model tier (e.g. Haiku / low reasoning effort),
  and the tour, learning path, coaching, and starter answers cost nothing
  at all — they never call an AI.
- **We collect nothing.** No telemetry, no analytics, no accounts, no phoning
  home. Everything Archy knows about you — your questions, its LEARNED.md,
  your tour progress — lives in plain files on your machine and goes nowhere.
  The only network traffic is your own agent's API calls and the optional
  manual refresh from GitHub's public repo.

## Security model

The helper binds to 127.0.0.1 — and treats even that as hostile, because
"localhost" includes every website your browser has open.

- **Capability token.** Every request that reads or changes server state
  requires an unguessable per-session token (minted at start, injected into
  the widget page, handed to local CLI callers through a 0600 file). Only
  the page itself, `/health`, and the vendored scripts are token-free.
  Host and Origin are allowlisted (no DNS rebinding), bodies are JSON-only
  with a hard cap, chunked encoding is refused, no CORS headers are sent.
- **Descriptor-bound state.** Private state (token, trust level, learning
  progress) lives in a directory that must be yours and not group/world
  writable, opened once and retained; files are opened relative to it with
  `O_NOFOLLOW|O_NONBLOCK`, validated by `fstat` (regular, yours, 0600,
  bounded) before a byte is read, and written through an `O_EXCL` random
  0600 temp with file + directory `fsync` and a rename that never replaces
  a symlink. Served content is read bounded and regular-file-checked.
- **Supervised subprocesses.** Every agent and helper command runs in its
  own process group under a single supervisor: output is capped at the
  producer (2 MB) and **overflow kills the whole group immediately**, as
  do timeouts, errors, and server shutdown; nothing is silently truncated.
  Desktop launches that must outlive a request (your editor, a
  notification) are detached with no pipes and no inherited descriptors.
- **Sandboxes are never weakened.** Codex always runs with
  `--sandbox workspace-write` (Fixer's workspace is `~/.config`, matching its
  stated scope; Mechanic's is `$HOME` by explicit choice). Claude's Fixer
  allowlist is a fixed set of Omarchy config commands.
- **Installer.** All placements are descriptor-bound, atomic, journaled and
  rolled back on any failure; symlink targets are refused. Each persistent
  integration is a separate consent.
- **Manual updater.** Pins one upstream commit, downloads one tarball at
  that immutable SHA, verifies every page's git blob hash against the pinned
  tree, and swaps the complete verified set in atomically.

## Design notes

- Two small systemd **user** services: the widget server (Python stdlib,
  bound to 127.0.0.1) and the Hyprland-event watcher behind the tour and
  the coaching. No privilege escalation, no telemetry, nothing runs as root.
- The 🔧 mode is deliberately scoped by trust level (a plain-text file at
  `~/.config/omarchy-help/trust`, set from the widget's ⚙ menu): Fixer =
  explicit command allowlist + user-level config only; Mechanic = broad
  tools on your agent's strongest model. Both: backup-before-edit,
  verify-after, undo reported, never any privilege escalation, consent per click.
- Machine-specific notes can go in `~/.config/omarchy-help/LOCAL.md` — the
  tutor reads it if present (useful for fleet/dotfile setups).
- Knowledge lives in plain Markdown — PRs that correct or extend
  KNOWLEDGE.md are the whole point.

## Credits

I built Archy for myself, learning Omarchy the way it deserves to be
learned — hands-on, keyboard-first, AI when it helps — and it grows the same
way: every rough edge I hit in daily use becomes the next improvement.

Created by **Luke Warren Wills** — [@lukemallorca](https://instagram.com/lukemallorca) on Instagram. Open source under the MIT license: use it, fork it, improve it.
