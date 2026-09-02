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
- **🔧 "Do it for me" — only if you say so.** By default Archy is a
  **Guide**: it explains and instructs, and is never given a tool that can
  change anything on your machine. Flip the ⚙ menu to **Mechanic** and your
  own agent gets its normal working powers on its strongest model — it still
  asks before each fix, backs up every file first, verifies the change, and
  reports the one-line undo. Two levels only, so neither claims a boundary
  it can't enforce.
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
- **Descriptor-bound state.** Every directory the helper touches is
  reached by walking each path component from `$HOME` with
  `O_NOFOLLOW|O_DIRECTORY`, validating every step (yours, never
  world-writable, group-writable only if the group is provably yours
  alone); the leaf descriptor is retained for all relative operations.
  State files are opened `O_NOFOLLOW|O_NONBLOCK`, `fstat`-validated
  (regular, yours, 0600, bounded) before a byte is read, and written through
  an `O_EXCL` random 0600 temp with file + directory `fsync` and a rename
  that never replaces a symlink. Served content is read bounded and
  regular-file-checked.
- **Supervised subprocesses.** Every agent and helper command runs inside
  its own transient systemd user scope — a cgroup with a unique,
  never-reused name — and cleanup kills the scope *by name*, so no numeric
  PID or process group is ever signalled after it could have been reused.
  Output is capped at the producer (2 MB) and **overflow kills the scope
  immediately**, as do timeouts, errors, and server shutdown; nothing is
  silently truncated. Desktop launches that must outlive a request (your
  editor, a notification) are detached with no pipes and no inherited
  descriptors.
- **No level claims what it can't enforce.** Guide (default) never
  receives a write-capable tool; tutoring runs Codex in `--sandbox
  read-only` and Claude with read-only tools, and learned facts are appended
  by the helper, not the agent. Mechanic is the user's explicit opt-in to
  their own agent's normal powers.
- **Installer.** All placements are descriptor-bound, atomic, journaled and
  rolled back on any failure — files *and* service state (enable/active is
  snapshotted and restored, every `systemctl` result checked); symlink
  targets are refused; the setup log is written through the same
  primitive. Each persistent integration is a separate consent.
- **Manual updater.** Pins one upstream commit, downloads one tarball at
  that immutable SHA, verifies every page's git blob hash against the pinned
  tree, and publishes descriptor-relative: random staging directory inside
  the validated state dir, `O_EXCL` writes, `renameat` swap against the
  retained parent, old tree removed by descriptor.

## Design notes

- Two small systemd **user** services: the widget server (Python stdlib,
  bound to 127.0.0.1) and the Hyprland-event watcher behind the tour and
  the coaching. No privilege escalation, no telemetry, nothing runs as root.
- Trust is a two-state file in the private state dir, set only from the
  widget's ⚙ menu: **Guide** (default) never hands the agent a write-capable
  tool; **Mechanic** is the user's explicit, honestly-unconfined choice —
  backup-before-edit, verify-after, undo reported, never any privilege
  escalation, consent per click. Ordinary tutoring is read-only by
  construction (Codex `--sandbox read-only`; Claude with read tools only),
  and what Archy learns is written by the helper, never by the agent.
- Machine-specific notes can go in `~/.config/omarchy-help/LOCAL.md` — the
  tutor reads it if present (useful for fleet/dotfile setups).
- Knowledge lives in plain Markdown — PRs that correct or extend
  KNOWLEDGE.md are the whole point.

## Credits

I built Archy for myself, learning Omarchy the way it deserves to be
learned — hands-on, keyboard-first, AI when it helps — and it grows the same
way: every rough edge I hit in daily use becomes the next improvement.

Created by **Luke Warren Wills** — [@lukemallorca](https://instagram.com/lukemallorca) on Instagram. Open source under the MIT license: use it, fork it, improve it.
