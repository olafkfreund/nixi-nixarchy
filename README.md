<h1 align="center">❄ Nixi</h1>
<p align="center"><em>Your nixarchy guide — a live guided tour, a learning path, and an AI tutor that actually knows your machine.</em></p>

Nixi is a small chat widget that lives in the corner of your desktop. It
answers "how do I…" questions about [nixarchy](https://github.com/olafkfreund/nixarchy)
— the keys, the menu, workspaces, themes, and the part that trips up every
newcomer: **packages are declarative here**.

It is local-first. The quick answers, the tour and the manual search all work
with **no AI and no network**. Connect an agent and the same widget becomes a
tutor grounded in your actual machine.

> Nixi is a fork of [Archy](https://github.com/respira-crece-lidera) by Luke
> Warren Wills, retargeted from Omarchy/Arch to nixarchy/NixOS.

---

## Install

### On NixOS / nixarchy — the flake

Add the input:

```nix
{
  inputs.nixi.url = "github:olafkfreund/nixi-nixarchy";
  inputs.nixi.inputs.nixpkgs.follows = "nixpkgs";
}
```

Then in your **Home Manager** configuration:

```nix
{
  imports = [ inputs.nixi.homeModules.default ];

  services.nixi.enable = true;
}
```

`home-manager switch` (or `nixarchy apply`) and you are done: the snowflake
appears in your top bar, the server starts with your session, and the manual
is fetched in the background.

Try it without installing anything — this runs the widget straight from the
store, using the copy of the assets inside the package:

```
nix run github:olafkfreund/nixi-nixarchy
```

#### Options

| option | default | what it does |
|---|---|---|
| `services.nixi.enable` | `false` | The widget, the server, the bar button |
| `services.nixi.port` | `8642` | Loopback port for the widget server |
| `services.nixi.barWidget.enable` | `true` | Snowflake button in the Omarchy bar |
| `services.nixi.skill.enable` | `true` | Tutor skill into `~/.claude/skills/nixi` |
| `services.nixi.manual.autoUpdate` | `true` | Weekly refresh of the local manuals |
| `services.nixi.manual.onCalendar` | `"weekly"` | When that refresh runs |
| `services.nixi.watcher.enable` | `false` | Notices features you don't use, ≤1 tip/day |
| `services.nixi.omarchyHooks.enable` | `false` | First-boot welcome + refresh after `omarchy update` |
| `services.nixi.menuEntry.enable` | `false` | Adds "Help" to the Omarchy menu (SUPER+SPACE) |
| `services.nixi.menuEntry.extraEntries` | `{}` | Your own menu entries, merged alongside Nixi's |

`menuEntry.enable` is off by default on purpose: switching it on makes Nix the
owner of `~/.config/omarchy/extensions/omarchy-menu.jsonc`. Home Manager will
refuse to clobber a file you wrote by hand, so if you already have one, move
its entries into `menuEntry.extraEntries` first:

```nix
services.nixi.menuEntry = {
  enable = true;
  extraEntries.notes = { icon = "N"; label = "Notes"; action = "obsidian"; };
};
```

### The Omarchy plugin manager

This works on nixarchy too, and needs no rebuild — plugins live in
`~/.config/omarchy/plugins/`, which is ordinary mutable config:

```
omarchy plugin add https://github.com/olafkfreund/nixi-nixarchy.git --enable
```

The snowflake appears in your bar; the first click installs the core (widget,
server service, menu entry) and nothing else. The optional extras are then
each enabled by a separate decision inside the widget.

It is the quickest way in and the right one if you already manage your other
bar widgets this way. The trade is that it is imperative: it writes into
`~/.local/bin` and `~/.config`, so it is not captured by your flake and will
not reproduce on another machine. Use the Home Manager module above if you
want that.

`omarchy plugin update` / `omarchy plugin remove io.github.olafkfreund.nixi`
manage it afterwards.

### Anywhere else — the imperative installer

For a non-Nix machine (or to try it from a checkout without touching your
flake):

```
git clone https://github.com/olafkfreund/nixi-nixarchy.git
cd nixi-nixarchy && ./install.sh
```

`./install.sh --all` adds every optional integration; `--with-watcher`,
`--with-skill` and `--with-hooks` enable them one at a time. Every placement is
atomic and journalled, so a failure restores exactly what was there before.

The two paths do not fight: if Nix owns the install, the bar button and the
installer both detect it and stand down rather than writing over the store.

---

## Using it

| | |
|---|---|
| **Open it** | Click the ❄ in the bar, or run `nixi`. Bind a key if you like: `o.bind("SUPER + H", "Nixi", "nixi")` in `~/.config/hypr/bindings.lua` |
| **Live tour** | 🚀 in the widget. Eleven steps, and it *watches Hyprland events* — it knows when you actually pressed the key, so it moves at your pace |
| **Learning path** | 🎓 walks 16 topics and skips the ones the watcher has seen you use |
| **Ask anything** | Type. Paths in answers are clickable and open in your editor |
| **Terminal instead** | `nixi --tui` |

### What it knows about NixOS

The tutor is grounded in a locally fetched, hash-verified copy of **both**
manuals, merged the way nixarchy's own manual describes it: of Omarchy's 51
pages, 38 are word-for-word true on NixOS, and the ones that are not are
rewritten. Nixi fetches the nixarchy manual first and lets it win every
collision, then backfills the rest from Omarchy. So it gives you
`nixarchy apply`, not `pacman -S`.

It leads with the things NixOS gives you that Arch cannot: generations and
rollback when an update goes wrong, and `nixarchy dev init` for per-project
toolchains.

---

## Trust: what Nixi may change

Two levels, and only two, so that neither claims a boundary it cannot enforce.
Set it with ⚙ in the widget.

- **Guide** *(default)* — explains and instructs. The agent is never handed a
  write-capable tool. Nothing on your machine changes.
- **Mechanic** *(opt-in)* — your own agent with its normal working powers, on
  a per-click basis. It backs up every file it edits, never escalates
  privileges, and reports what it changed plus the one-line undo. Described
  honestly as unconfined, because it is.

---

## Privacy and security

- **Local only.** The server binds `127.0.0.1` and sends no telemetry, ever.
- **Loopback is shared**, so being local is not enough: every state-touching
  request needs an unguessable per-session token, the peer's uid is checked
  against yours via `/proc/net/tcp`, Host/Origin are allowlisted against DNS
  rebinding, and no CORS header is ever sent.
- **Private state is descriptor-bound.** The token, trust level and learned
  facts live in `~/.local/share/nixi`, opened through a validated directory
  descriptor with `O_NOFOLLOW`; writes go to an `O_EXCL` temp and are renamed
  over a target that must not be a symlink.
- **Subprocesses are supervised.** Each agent call runs in its own transient
  systemd scope, killed by name on timeout, overflow or shutdown.
- **The network is one code path.** Only `nixi-update-manual` talks to the
  internet, only to two pinned GitHub repositories, and every page is verified
  against its git blob hash at a pinned commit before it is used.
- **Python standard library only.** The only vendored code is `marked` and
  `DOMPurify` for rendering Markdown safely in the widget.

---

## Layout

```
bin/nixi                 launcher (toggles the widget)
bin/nixi-server          the local server: UI, offline search, agent relay
bin/nixi-update-manual   fetches + hash-verifies both manuals
bin/nixi-watch           optional coaching watcher
nix/package.nix          the derivation
nix/hm-module.nix        the Home Manager module
share/                   ui.html, KNOWLEDGE.md, faq.json, vendored js
skills/nixi/SKILL.md     the tutor method, for your agent
install.py               imperative installer (atomic, journalled, rollback-safe)
```

State lives in `~/.local/share/nixi` (mutable — the fetched manual, learned
facts, session token) and is deliberately kept out of `~/.config/nixi` so that
a Nix rebuild or a dotfile redeploy can never wipe it.

---

## Uninstall

Nix: remove `services.nixi` and rebuild. The mutable state dir is yours —
`rm -rf ~/.local/share/nixi` if you want it gone too.

Imperative: `./install.sh --without-watcher --without-skill --without-hooks`,
then remove `~/.config/nixi`, `~/.local/share/nixi` and the `nixi*` files in
`~/.local/bin` and `~/.config/systemd/user`.

---

## License

MIT. Original Archy © Luke Warren Wills; nixarchy fork © Olaf K. Freund.
Use it, fork it, improve it.
