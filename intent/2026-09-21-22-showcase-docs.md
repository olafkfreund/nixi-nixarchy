---
status: approved
issue: 22
author: olafkfreund
---

# Intent: Show what Nixi is and how it works

## Problem

Nixi is hard to picture before you have run it. The README describes the card,
the search rows, the tour, the learning path and the two trust levels entirely
in text, and it has no image of any of them. The only picture in the repo is
`preview.png`, the plugin-manager thumbnail. Three places a newcomer might look
all fall short:

| Where | Today |
| --- | --- |
| `README.md` | Text and tables only. The title still says "❄ Nixi", although #14 replaced the snowflake with sparkles everywhere else. "Open it" says "The ❄ in the bar" |
| GitHub Pages for this repo | Does not exist (`gh api repos/olafkfreund/nixi-nixarchy/pages` returns 404) |
| nixarchy's site, olafkfreund.github.io/nixarchy (`docs/` on `main`) | Nixi appears only in `docs/manual/ai.md`, as the panel `SUPER + H` opens, in a section about ACP adapters. Nothing shows what it looks like or what Guide and Mechanic mean |

The most important idea, that Guide cannot change anything and Mechanic
changes things only after you say yes, is also the hardest to believe from
prose alone.

## Proposed outcome

A newcomer can see what Nixi is and how to use it without installing it:

- **README.md** opens with a short recording of the card in use and a user
  story that follows one person through a first session: ask a question, get a
  grounded answer, ask about their own machine, switch to `/mechanic`, approve
  a change, undo it. Each step has a screenshot. The stale snowflake is fixed.
- **A GitHub Pages site for this repo** walks through the same story with
  larger images and the recording, and links to the README for install and
  options.
- **nixarchy's site** gets a Nixi page (or section) with the same
  screenshots, linked from the manual's AI page and from the page `SUPER + H`
  is mentioned on, pointing to the nixi site for depth.

Every image comes from the real test run on razer on 2026-09-21 (nixi 0.10.0,
Claude, NixOS 26.11), not from mock-ups. The claims under the images are the
ones the run verified, for example that the generation and disk numbers Nixi
reported matched `readlink /nix/var/nix/profiles/system` and `df`.

## Affected users and systems

- Readers of the README on GitHub, and of both Pages sites.
- `README.md`, a new `docs/` Pages source (or `gh-pages` branch) and image and
  video assets in this repo.
- The nixarchy repo: `docs/` (Jekyll, `_config.yml`, `_layouts`), which is a
  separate repo with its own review gates and its own artifact files.
- Repo settings: turning Pages on for nixi-nixarchy is a settings change on
  GitHub.

## Constraints

- **No private data in any published image.** The test run captured a
  terminal showing razer's calendar, unread email subjects and tasks, which
  must not be published. Screenshots are cropped to the card, and every one
  is reviewed before it is committed.
- Show the product as it is. Three bugs found in testing are visible in the
  flow: FAQ rows do nothing (#19), the Y/N keys type into the composer (#20),
  and permission prompts truncate what is being approved (#21). The docs must
  not claim those work. Either the images avoid those paths or the text says
  "click Allow", not "press Y".
- Keep the repo light. The raw recording is 75 MB and 10 minutes long. What
  gets committed should be a few MB at most.
- nixarchy's `docs/` is also being edited right now by another session
  (branch `docs/831-readme-site-parity` in `/mnt/data/Source-home/nixarchy`).
  The nixarchy change must not collide with it.
- Nothing in nixi's behaviour changes. This is documentation only; fixes for
  #19–#21 are separate tasks.

## Open questions

1. **Pages source for nixi:** a `docs/` folder on `master`, as nixarchy uses,
   or a `gh-pages` branch? `docs/` already holds engineering documents
   (`architecture.md`, `release.md`, `testing.md`, …) that would then be
   published unless they are excluded.
2. **Recording format:** a looping GIF works everywhere, including the README
   on GitHub, but is large and blurry for text. An MP4 is sharp and small but
   only plays in the README if uploaded through GitHub's UI. A proposal:
   a short GIF in the README, the MP4 on the Pages sites.
3. **Should the docs wait for #19–#21?** Fixing the FAQ row first would let the
   story include the offline FAQ, which is one of Nixi's selling points.
4. **nixarchy scope:** a new `docs/manual/nixi.md` page, or a section added to
   `docs/manual/ai.md`? And should it wait until the parity work on
   `docs/831-readme-site-parity` has merged?
