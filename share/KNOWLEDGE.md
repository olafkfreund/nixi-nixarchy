# Verified nixarchy facts (live-checked on nixarchy / Omarchy 4.0.1)

nixarchy is Omarchy vendored for NixOS: it runs Omarchy's real tree — the same
commands, menus, themes, keybindings and shell — and replaces only what
assumed Arch. So the desktop facts below are Omarchy's and are true here; the
NixOS section is where the two differ. When in doubt, the manual page for a
topic says which of the two it is.

## The basics
- **SUPER (Windows key) is the master key.** Almost everything hangs off it.
- **SUPER+SPACE** — the Omarchy menu/launcher: apps, Install (Package /
  Web App / Service), Style/themes, Capture, Setup, Update, Power.
  (No AUR entry here — there is no AUR on NixOS.)
- **SUPER+K** — overlay of ALL current keybindings, including the user's own
  customizations. The ground truth for "what key does X".
- **SUPER+W** closes a window (many apps have no titlebar — this is how).
- Default terminal is **foot** (`xdg-terminal-exec` opens it).
- **SUPER+C / SUPER+V / SUPER+X** — universal copy/paste/cut, the SAME keys
  everywhere including the terminal; **SUPER+CTRL+V** opens clipboard history.
- **SUPER+RETURN** terminal · **SUPER+SHIFT+RETURN** browser ·
  **SUPER+ALT+RETURN** tmux · **SUPER+CTRL+RETURN** Herdr (all verified live).

## Workspaces
- **SUPER+1…9** go to a workspace; **SUPER+SHIFT+1…9** move the focused
  window there. Independent desks — keep contexts separate.
- **SUPER+arrows** move focus between panes; **SUPER+SHIFT+arrows** swap.
- **SUPER+F** maximizes within the layout; **SUPER+CTRL+F** true fullscreen
  (exact behavior can be user-customized — verify with SUPER+K).
- **SUPER+S** toggles the scratchpad: a hidden overlay workspace. Send a
  window there with **SUPER+ALT+S**; it drops over anything, hides again on
  the same key, and keeps running while hidden.

## Apps & windows
- Many "apps" are wrapped websites (`omarchy-launch-webapp`) with their own
  window, icon, and launcher entry. Install more: SUPER+SPACE → Install →
  Web App. This needs no rebuild.
- Real packages are DECLARATIVE here — see the NixOS section. There is no
  AUR and no working `pacman`/`yay`: the Install menu queues into
  `~/.config/nixarchy/apps.nix` and `nixarchy apply` makes it real.
- Floating windows move with SUPER+drag.

## Screenshots & capture
- **PRINT** = screenshot with editor (saves to `OMARCHY_SCREENSHOT_DIR`,
  else ~/Pictures). **SUPER+CTRL+PRINT** = OCR text-grab from screen.

## System
- **Updates**: SUPER+SPACE → Update, or `omarchy update` (`nixarchy update`
  is the same script). On NixOS this updates flake inputs and rebuilds
  atomically — it fully succeeds or changes nothing. User overrides in
  `~/.config/hypr/` and `~/.config/omarchy/` survive updates.
- **Themes**: SUPER+SPACE → Style — one theme restyles everything.
- The bar/launcher/notifications are ONE process (omarchy-shell, Quickshell);
  bar layout in `~/.config/omarchy/shell.json`; user shell plugins go in
  `~/.config/omarchy/plugins/`; menu extensions in
  `~/.config/omarchy/extensions/omarchy-menu.jsonc`; lifecycle hooks in
  `~/.config/omarchy/hooks/*.d/` (post-boot, post-update, theme-set…).
- Hyprland config is **Lua**: `~/.config/hypr/hyprland.lua` loads Omarchy
  defaults then the user's `bindings.lua`/`input.lua`/`monitors.lua`/
  `looknfeel.lua`/`autostart.lua` (helpers: `o.bind`, `o.window`,
  `hl.config`, `hl.unbind`).

## NixOS — where nixarchy differs from Omarchy
- **Nothing is installed imperatively.** `pacman`/`yay` are shimmed and refuse.
  Install → Package EDITS `~/.config/nixarchy/apps.nix` and stops; the change
  becomes real only on `nixarchy apply` (which rebuilds). This surprises every
  newcomer — lead with it when an install "didn't work".
- `nixarchy` commands this port ADDS (everything else is Omarchy's own and
  reaches it unchanged, under either name):
  `nixarchy search [q]` (packages + NixOS options + apps in one picker),
  `nixarchy pkg add <attr>`, `nixarchy app enable|disable|remove <id>`,
  `nixarchy apply`, `nixarchy dev init <preset>`, `nixarchy doctor`.
- **Generations & rollback**: every rebuild keeps the previous system. The
  boot menu lists them; `sudo nixos-rebuild switch --rollback` steps back
  without rebooting. This is the answer to "the update broke X".
- **Per-project toolchains**, not global ones: `nixarchy dev init <preset>`
  writes a `devenv.nix` so the toolchain activates on `cd` into that folder.
- A rebuild does **not** disturb the running session; a new kernel/driver
  needs a reboot.
- `~/.config/nixarchy/{apps,services,advanced}.nix` is the user's declarative
  surface; `~/.config/hypr/` and `~/.config/omarchy/` remain plain mutable
  config exactly as on Arch.

## For scripts (advanced, verified the hard way)
- In Omarchy 4 both `hyprctl` AND the raw Hyprland IPC socket are wrapped in
  the Lua layer: classic dispatch syntax fails. Working form on the socket:
  `dispatch hl.dsp.workspace.toggle_special("name")` (everything after the
  first space is inlined as Lua; hl.dispatch wants hl.dsp.* dispatcher
  objects, not strings). Queries (`j/clients`, `j/monitors`) pass through
  unchanged. Targeted per-window dispatches aren't reachable this way —
  prefer window rules + toggle_special, or `omarchy-launch-or-focus` + an
  active-window dispatcher.

## Unverified on this build (check SUPER+K before asserting)
Clipboard history key · pop-out/pin key · quick panels (audio/display/
network/bluetooth/power) · window-group keys · split-direction key.
