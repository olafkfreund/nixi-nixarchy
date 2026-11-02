---
status: approved
issue: 149
author: olafkfreund
follows: intent/2026-11-02-144-answer-stages.md
---

# Intent: Plugins for the Nixi companion

Code: `olafkfreund/nixoarchy-snowflake` (companion) and this repo (the Nix
option). Artifacts here.

## Problem

Everything Nixi can show or do is built into his one page and server. Anyone
who wants him to:

- show something new (train departures, their homelab, an RSS feed);
- wear a new accessory;
- sort a new chat app correctly;
- tell different jokes;

has to change Nixi's own code. There's no safe, supported way for other
users to add features. Doing it by editing the page is the riskiest option:
it runs in the same window as his approval cards, and an unsafe page change
can hang the GPU (it crashed Hyprland twice here).

## Proposed outcome

- **A plugin is a folder** with one `plugin.json`, so people can add features
  to Nixi without touching his code. It can provide any of:
  - a **stage**: a data source shown in one of #144's existing sets;
  - a **prop or skin**: an SVG accessory at a fixed anchor;
  - a **notification map**: which app counts as mail, chat or feed;
  - a **quip pack**;
  - a pointer to an **agent tool** (an MCP server managed by nixi's bridge).
- **Install it either way:**
  - as a Nix package, through one `services.nixi.companion.plugins` option;
  - by dropping the folder into a documented directory.
- **Settings → Plugins** lists each plugin with an on/off switch and a plain
  line saying what it can do. For example: "Adds a hat", or "Runs a program
  and reaches the network to show departures".
- **Plugins that run a program** start off. You switch one on yourself, and
  you're asked again if its program or permissions change.
- **A few reference plugins ship as examples** to copy.

## Affected users and systems

- Nixi companion users, and people who write plugins for them.
- `nixoarchy-snowflake`: the server, the page, the package.
- `nixi-nixarchy`: `nix/hm-module.nix`.
- p620 for live checks.

## Constraints

- **No plugin code runs in Nixi's window.** Plugins supply data and
  declarations; Nixi draws them with his own sets and props. No plugin
  JavaScript, HTML or CSS, no WebGL, and no third-party requests from the
  page.
- **Plugin text and SVG are untrusted.** Text is rendered as text. SVG is
  sanitised to a small allowlist on the server.
- **Running programs is a separate trust step.**
  - A plugin program gets a clean environment, a time limit and an output
    cap.
  - It sees no home folder or credentials unless that is granted and shown.
  - It's isolated where the system allows it, and it fails closed otherwise.
  - Anything that changes the system still goes through nixi's bridge
    (Guide, Mechanic, YOLO).
- **A broken or slow plugin never takes Nixi down**; it shows as broken in
  Settings.
- **Nixi never fetches plugins or updates from the internet.** No
  marketplace.
- Works without any plugins, exactly as today.

## Open questions

1. **First release:**
   - Ship the data-only kinds first (quip packs, notification maps,
     props), then stage programs? That's Codex's order.
   - Or lead with stage programs, the most useful kind? That's agy's order.
2. **May a plugin's stage offer "Run this" commands?** Codex says facts only in
   v1; agy allows commands, run through the bridge.
3. **May a plugin read a token** (for example `GH_TOKEN`) in v1, or should that
   wait for a dedicated per-plugin credential?
