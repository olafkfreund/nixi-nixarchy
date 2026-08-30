# Verified Omarchy 4 facts (live-checked on Omarchy 4.0.1, 2026-08)

## The basics
- **SUPER (Windows key) is the master key.** Almost everything hangs off it.
- **SUPER+SPACE** — the Omarchy menu/launcher: apps, Install (Package / AUR /
  Web App / Service), Style/themes, Capture, Setup, Update, Power.
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
  Web App. Real packages: Install → Package (official) or AUR (community —
  unvetted, like npm).
- Floating windows move with SUPER+drag.

## Screenshots & capture
- **PRINT** = screenshot with editor (saves to `OMARCHY_SCREENSHOT_DIR`,
  else ~/Pictures). **SUPER+CTRL+PRINT** = OCR text-grab from screen.

## System
- **Updates**: SUPER+SPACE → Update. Omarchy 4 ships as pacman packages from
  the Omarchy repo (NOT a git checkout). User overrides in `~/.config/hypr/`
  and `~/.config/omarchy/` survive updates.
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
