# What this fork changes

Nixi is [Archy](https://github.com/respira-crece-lidera) by Luke Warren Wills,
retargeted from Omarchy/Arch to [nixarchy](https://github.com/olafkfreund/nixarchy)/NixOS.
The tour, the learning path, the trust model and the security engineering are
his; this document is only the delta.

## The rule the port follows

nixarchy runs Omarchy's real tree — the same commands, menus, themes,
keybindings and shell — and replaces only what assumed Arch. Its own CLI says
so:

> Everything else is Omarchy's own, and reaches it unchanged. Both names work.
> They are the same scripts as on Arch, which is why they keep Omarchy's name.

So **runtime integration points were not renamed**. `omarchy menu`,
`omarchy-launch-webapp`, `omarchy-notification-send`, `~/.config/omarchy/`,
`~/.local/state/omarchy/` are all still exactly that. Only the product's own
branding moved.

## Branding

| was | is |
|---|---|
| Archy | Nixi |
| `omarchy-help`, `omarchy-help-server`, … | `nixi`, `nixi-server`, … |
| `~/.config/omarchy-help`, `~/.local/share/omarchy-help` | `~/.config/nixi`, `~/.local/share/nixi` |
| `OMARCHY_HELP_*` | `NIXI_*` |
| `X-Archy-Token` | `X-Nixi-Token` |
| `io.github.respira-crece-lidera.archy` | `io.github.olafkfreund.nixi` |
| arcade pixel-invader icon | ❄ snowflake (pixel grid in the bar, vector in the chat) |

## Substance

- **The manual is now two pinned sources.** nixarchy's `docs/manual` is fetched
  first and wins every filename collision; `omacom/omarchy-site` backfills the
  rest. That mirrors what nixarchy's own manual index states: of Omarchy's 51
  pages, 38 are true verbatim on NixOS and the rest are rewritten. Both are
  still verified against their git blob hashes at a pinned commit.
- **The bundled content teaches NixOS.** The FAQ, `KNOWLEDGE.md`, the system
  prompt and the curriculum no longer mention `pacman` or the AUR. They explain
  the thing that surprises every newcomer instead: the Install menu *queues*
  into `~/.config/nixarchy/apps.nix` and `nixarchy apply` is what applies it.
- **Two curriculum stops added**: generations/rollback, and per-project
  toolchains via `nixarchy dev init`.
- **The machine-facts probe was broken here.** It read
  `~/.local/share/omarchy/version`, which does not exist on NixOS (the tree is
  a store path), so the version fact was silently empty. It now resolves the
  version from whichever `omarchy` is on `PATH`, and reports the NixOS release
  too.
- **The skill** is rewritten as a nixarchy tutor that hands off to the
  `nixarchy` and `nixos` skills for anything that writes to disk.

## Packaging

New: `flake.nix`, `nix/package.nix`, `nix/hm-module.nix`. The declarative
install is the documented path; `install.py` is kept for non-Nix machines.

The two never fight. Nix owns only static assets, which it links out of the
store; everything Nixi writes at runtime stays a plain mutable directory in
`~/.local/share/nixi`. The bar-button bootstrap detects a store-backed UI and
skips the imperative installer entirely, and `install.py` already refuses to
write through a symlink.

## Bug fixed along the way

`_source_root()` called `_dir_trusted()`, which never existed — a leftover from
an earlier rename to `_dir_ok`. It is a runtime `NameError`, so it compiled
fine and failed only when reached, and neither caller caught it. The effect was
that `GET /setup` and `POST /setup` both raised, so the in-widget per-feature
consent panel had never worked. One word.
