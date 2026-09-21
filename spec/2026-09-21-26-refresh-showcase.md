---
status: draft
issue: 26
intent: intent/2026-09-21-26-refresh-showcase.md
---

# Spec: Refresh the showcase once the fixes ship

## Decisions carried from the intent review, and proposed here

- **Scope** (open question 1, not answered): the **full refresh** as the
  approved intent describes it: scene 2, the three limitation notes, and a
  new FAQ scene. Proposed because the notes become false the moment #19–#21
  merge, and re-recording twice costs more than once.
- **Pin bump and rebuild** (open question 2, not answered): split in two,
  below. The nixarchy pin bump is part of this task, because it is how the
  fixes reach users. Rebuilding razer is **not**: the recording uses a
  temporary, reversible swap instead, and razer's real update stays with you.

## What stands between the fixes and razer

razer gets Nixi through two pins:

| repo | pins | at |
| --- | --- | --- |
| `olafkfreund/nixarchy` `flake.lock` | `nixi` | `6b5878a` (#17) |
| `olafkfreund/nixos_config` `flake.lock` (razer's `/etc/nixos`) | `nixarchy` | `b25d510` |

A real update of razer means a nixarchy PR, a nixos_config PR, and a system
switch on a machine you use. The recording needs none of that.

## Design

**1. Order.** Nothing here starts until #19, #20 and #21 are merged into
nixi's `master`.

**2. The nixarchy pin bump** (a lock bump, so no separate artifacts in
nixarchy). This is a PR in `/mnt/data/Source-home/GitHub/nixarchy`, from
`origin/main`:
- `nix flake update nixi` (the `nixi` node only), onto the nixi `master`
  commit carrying #19–#21, #23 and #24;
- the pin comment in `flake.nix` (the paragraph that begins "6b5878a is
  nixi-nixarchy#17") is rewritten for the new commit, saying what it brings,
  the way every earlier bump there did;
- merged when nixarchy's CI is green.

razer's `nixos_config` bump and rebuild are **left to you**, listed at the
end of the PR as the next step.

**3. The recording, on razer, without rebuilding it.** This is the swap from
#19's spec, widened to every Nixi file the card and its agent read:
- build nixi `master` on p620, and `nix copy --to ssh://razer` (this adds to
  the store and replaces nothing);
- note the current targets of the seven Home Manager symlinks: the plugin
  directory `~/.config/omarchy/plugins/io.github.olafkfreund.nixi`,
  `~/.config/nixi/{AGENTS,CLAUDE,KNOWLEDGE,SKILL}.md` and `faq.json`, and
  `~/.claude/skills/nixi/SKILL.md`;
- point them at the new build, restart the shell, record, point them back,
  restart the shell, and check all seven with `readlink`;
- desktop control is asked for through ai-mirror, as on 2026-09-21.

Home Manager puts all seven back on razer's next switch in any case.

**4. What is recorded**, exactly as in #22: the same crop (`900x620+510+170`),
Guide unless noted, and the same size budget.

| scene | change |
| --- | --- |
| 2 | "how do I install an app?" is answered with the package manager panel first |
| 5 | `/mechanic`; a write prompt shows the **whole** command (#21) and is answered with **Y** (#20) |
| new: "Written answers" | type `install`, choose **Install an app**; the FAQ answer appears (#19) |

Scenes 1, 3, 4, 6, 7 and the built-ins are kept as they are. They were true
then and still are.

**5. What is published** (one nixi PR, one nixarchy PR):
- nixi `docs/media`: `02-answer.png`, `05-mechanic-asks.png` and a new
  `11-faq.png` replaced or added; `nixi-demo.mp4` and `nixi-demo.gif`
  re-cut, using the same segment method as #22 with new timestamps;
- `README.md` and `docs/index.html`: scene 2's and scene 5's captions; the
  three limitation notes removed (keeping #27's read-only note); the FAQ
  scene added under "No AI needed";
- nixarchy `docs/img/features/nixi.gif`: the same bytes as the new GIF.

## Alternatives rejected

- **Rebuilding razer for the recording**: it changes a machine you use, for
  a demo, and needs a nixos_config PR as well. The swap shows the same
  released code and leaves nothing behind.
- **Scene 2 only**: it would publish three notes that are false by then.
- **Recording before the pin bump**: fine technically, since the swap does
  not need it. But the intent requires released behaviour, and "released"
  means reachable by nixarchy users, which is the bump.

## Risks

- **The swap is missed on the way back.** Mitigated by the `readlink` check
  of all seven links, and ultimately by Home Manager's next switch.
- **Private data.** The same crop, and every still and every 2 s of video
  reviewed before commit. The terminal with your calendar and mail is not
  opened.
- **nixarchy's CI on the bump** may fail on something unrelated to nixi, as
  nixarchy's `flake.nix` comments show can happen. Then this task stops and
  reports rather than working around it.

## Verification

- nixarchy PR: the `nixi` lock node is at the chosen commit, CI is green,
  and the `flake.nix` comment names the commit.
- Recording: the contact sheets are reviewed, showing only the card.
- Sizes: GIF < 5 MB, MP4 < 8 MB, stills < 250 KB.
- The published pages: the three notes are gone (`grep` for #19, #20 and #21
  in `README.md` and `docs/index.html` finds nothing); every media path
  resolves; after merge, the site and nixarchy's `manual/ai` serve the new
  GIF.
- razer: all seven symlinks are back on their Home Manager targets.
