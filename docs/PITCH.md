# Draft: Show and tell — Archy, a live guided tour + AI tutor for new Omarchy users

*(post as Luke, basecamp/omarchy Discussions; embed the demo video at top)*

---

**Archy teaches new users Omarchy the way Omarchy teaches everything else:
hands-on, keyboard-first, AI when it helps.**

[DEMO VIDEO/GIF HERE]

New users get a corner chat widget with an 11-step **live tour**: "Press
SUPER+RETURN"… and Archy *sees the window open* (Hyprland event socket), ticks
the step, moves on. Set up your default agent, open terminal and browser,
watch tiling happen, kill the mouse with SUPER+arrows, workspaces, float —
ending with "close me with SUPER+W; summon me back with your helper key."
Every step verified by the compositor, nothing simulated.

After the tour: a **learning path** (14 stops, novice → advanced) that skips
features it can observe you already using, and typed questions go to **your
default agent** — grounded in your real keybindings and a bundled copy of the
manual, so answers match *your* machine.

It's built entirely from Omarchy's own parts, on the crash-watcher template:
`omarchy-default-agent` (works with Claude Code, Codex…), the skills system,
a menu extension, a `post-boot.d` welcome hook, systemd user services,
`omarchy:summary` headers. Theme-matched from `colors.toml`. No daemon
weirdness, no telemetry, ~1k lines total, MIT.

Install: `Install → AUR → archy-omarchy` (or `git clone … && ./install.sh`).

If any of this fits Omarchy's direction, I'd love for it (or any part of it)
to be taken upstream — happy to adapt it to whatever shape fits.

---

*(tone check before posting: confident, short, zero begging — the demo does
the selling)*
