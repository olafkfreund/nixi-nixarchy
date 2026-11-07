---
status: draft
issue: 217
author: olafkfreund
---

# Intent: Companion docs: an onboarding README and a getting-started guide

## Problem

The companion has grown faster than its docs. In `olafkfreund/nixoarchy-snowflake` at 8f2275e:

- `README.md` (109 lines) covers install, the first two minutes, what's off in nixi mode, and help. It credits piper and
  espeak-ng as the voice, and doesn't mention ElevenLabs, which is what the user runs.
- `docs/GUIDE.md` (309 lines) has no section on the message inbox, clicking a message to open its app, choosing a
  character and its voice, the fleet board or ElevenLabs. It covers moods ("Its face and personality"), but not the
  characters in Settings. It says plug-ins are off in nixi mode, which is out of date: Nix-built plugins load through
  `services.nixi.companion.plugins` (#190).
- Both READMEs end with "everything runs on your computer". With ElevenLabs on, the text he speaks goes to ElevenLabs,
  and the agent's provider gets what you ask.
- Nothing walks a new person from "I have NixOS" to "he answered me" with every step checked: which flake inputs, which
  option, the first start, mic choice, the voice, and what to do when one of those fails. Known traps that make a
  correct setup look broken aren't on any checklist:
  - The module adds no login start or key binding (GUIDE, "Starting at login").
  - A trust change in the card needs `nixi-companion restart` (#146).
  - Notifications through him need the first two switches in Settings → Desktop, and the nixarchy shell with its
    notification patch. Without that patch, the shell's own popups stay.

The user asked for "a bulletproof onboarding" in `README.md`, plus a detailed guide that makes it easy to get started.

## Proposed outcome

- **README.md is the onboarding.** Someone new can follow it alone, top to bottom, and end with Nixi on screen, hearing
  them and answering. Each step says what they should see, and what to do when they don't.
- **A detailed guide** covers every feature a user meets, in the order they meet it: talking, messages and notifications,
  characters and reactions, voices (local and ElevenLabs), agents and approvals, the fleet board, plugins, settings, and
  troubleshooting. Each setting it names exists in the code with that name.
- **"Bulletproof" is tested, not claimed.** The steps a VM can run (install, first start, typing to him, settings,
  plugins) are followed in a disposable nixarchy VM. Each one that didn't work as written is fixed before merge. The
  steps it can't run (mic, hearing "hey Nixi", his voice, ElevenLabs, notifications through him) are a short checklist
  the user ticks on p620. The PR records both, step by step, with what failed and the fix.
- **The privacy wording is true.** It says what stays local (speech-to-text, the local voices) and what leaves the
  machine: the text he speaks with ElevenLabs on, and whatever the agent's provider receives.

## Affected users and systems

- `olafkfreund/nixoarchy-snowflake`: `README.md`, `docs/GUIDE.md`, and any new pages under `docs/`.
- Possibly `olafkfreund/nixi-nixarchy`'s `README.md`, the "snowflake companion" part of its install section (open
  question 1).
- New users installing Nixi, and the user, as the reader of the reference parts.
- No code and no host changes. Nothing is deployed.

## Constraints

- **Must:** every command, option, setting and key in the docs is checked against the code at the commit being
  documented. No feature is described that doesn't exist, and nothing planned (#208 to #214) is shown as done.
- **Must:** API keys (ElevenLabs, others) are explained as files the user points to, through agenix, sops or a file
  path. Never as a value pasted into a Nix file or `config.json`.
- **Must:** examples use placeholders, not the user's hosts, tailnet addresses, folders or accounts.
- **Must:** commands a reader runs are in fenced blocks they can copy.
- **Must:** the docs keep the house style: plain words, short sentences, the README's look (centred logo, links row).
- **Must not:** change code, defaults or options to make the docs easier to write. A gap found while writing becomes an
  issue.
- **Must not:** take screenshots with GPU Chrome on p620 (it hung the GPU). Headless Chromium with `--disable-gpu`, or
  the VM, only.

## Open questions

1. **Which READMEs?** Recommended: the companion's `README.md` becomes the full onboarding, and `nixi-nixarchy`'s
   companion section is cut to two lines plus a link to it, so there's one place to keep right.
2. **One guide or two?** Recommended: `docs/GETTING-STARTED.md` (a longer walk-through of the first day, with the
   choices explained) and `docs/GUIDE.md` kept as the reference, brought up to date. The README links both.
3. **Who is the reader?** Recommended: someone on nixarchy first (the Nixi card comes with it, and the companion is one option away), with a short path for any NixOS
   with Home Manager. Not for non-Nix systems, though the `nix run` try-out stays.
4. **How is "bulletproof" proven?** Recommended: as under Proposed outcome, with the VM for what it can run and the
   user's p620 checklist for mic, voice and notifications. A step counts as passed only when what the README says
   you'll see is what was seen.
5. **Screenshots or a short recording?** Recommended: a few still images from headless Chromium, kept small, since the
   UI is still changing (#206).
