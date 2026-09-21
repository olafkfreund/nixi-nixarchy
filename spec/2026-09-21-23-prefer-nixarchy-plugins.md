---
status: approved
issue: 23
intent: intent/2026-09-21-23-prefer-nixarchy-plugins.md
---

# Spec: Nixi sends people to nixarchy's own tools first

## Decisions carried from the intent review

- **Scope: the five plugins** that replace an Arch habit: the package manager
  (`nixarchy.pkg`), Dev environments (`nixarchy.devenv`), MicroVMs
  (`nixarchy.microvm`), Podman (`nixarchy.podman`) and Distrobox
  (`nixarchy.distrobox`). Herdr and the CI panels stay out.
- **Learning path: fold into the existing topics.** No new topic and no new
  tour step. The path stays at 16 topics and the tour at 11 steps.
- Open question 3 (where the truth lives) is **proposed below** as a hybrid:
  a short fixed table in Nixi, with live checks and the manual for the rest.
- Open question 4 (the showcase) is **proposed below** as a follow-up, outside
  this task.

## What the machine can tell us (checked on razer, 2026-09-21)

nixarchy already ships the command to ask with. `nixarchy-plugin` is
`pkgs/nixarchy-plugin.nix` in nixarchy, and it is what nixarchy's own menu
rows and key binds call:

- `nixarchy-plugin --enabled <id>` exits 0 when the plugin is on. It reads
  `~/.config/omarchy/shell.json` with the shell registry's own rule, so it
  needs no IPC and works in Guide.
- `nixarchy-plugin <id>` opens the panel. When the plugin is not installed or
  is off, it raises a notification naming the fix instead of silently doing
  nothing.
- "Installed" means `~/.config/omarchy/plugins/<id>/` exists.

On razer that gives all three states, so the design has to handle all three:

| plugin | installed | enabled | key (Super+Alt+…) bound |
| --- | --- | --- | --- |
| `nixarchy.pkg` | yes | yes | N: **no** |
| `nixarchy.devenv` | **no** | no | E: no |
| `nixarchy.microvm` | yes | yes | V: yes |
| `nixarchy.podman` | yes | **no** | O: no |
| `nixarchy.distrobox` | yes | yes | D: **no** |

The keys are seeded into `bindings.lua` only on new installs, so a missing
key is normal, not a fault. The menu path (Install ▸ Packages, Apps ▸ Dev
environments, Trigger ▸ Sandbox, Apps ▸ Podman, Trigger ▸ Boxes) and
`nixarchy-plugin <id>` work whether or not the key is bound.

## Design

### 1. One fact table, in `share/KNOWLEDGE.md`

A new section, **"nixarchy's own tools — prefer these"**, with one row per
plugin: the job in the user's words, the plugin id, its menu path, its seeded
key, the terminal equivalent, and the manual page. Beneath the table go three
rules:

1. Check before recommending: run `nixarchy-plugin --enabled <id>`, and
   `test -d ~/.config/omarchy/plugins/<id>` to tell "off" from "not
   installed". Then check `omarchy menu keybindings --print` for the key.
2. Say it in that order: the panel (menu path, then the key only if it is
   bound), what it does in one line, then the command for people who prefer
   a terminal.
3. If the plugin is off: say where to turn it on (Setup ▸ Plugins, or
   `omarchy plugin enable <id>`). If it is not installed: say what turns it
   on (Podman follows the podman service or Boxes; devenv follows the devenv
   service), and give the terminal command as the answer for now.

The table is small and stable, so it is written down. The details are not:
for everything else it points at the local manual's `plugins.md`,
`boxes.md`, `sandboxes.md` and `per-project-environments.md`, which
`nixi-context` already searches and which update weekly
(`nixi-update-manual`). A sixth plugin is then found through the manual
without a Nixi release, and becomes *preferred* once it is added to the table.

`KNOWLEDGE.md` already carries the "Verified nixarchy facts" header. The new
section says it was verified on razer on 2026-09-21, like the rest.

### 2. The tutor method, `skills/nixi/SKILL.md`

- **"What nixarchy is"**: the package bullet changes from "the Install menu
  queues into `apps.nix` and `nixarchy apply` makes it real" to "the package
  manager panel (Install ▸ Packages) queues into `apps.nix` and applies with
  one key; `nixarchy apply` is the same thing in a terminal". The
  queue-then-apply lesson stays, because it is still what surprises people.
- **A new method step**, between "Ground truth" and "Learn": *prefer
  nixarchy's own tools*. For installing, per-project toolchains, VMs,
  containers, and software NixOS will not run, lead with the plugin from the
  KNOWLEDGE table, after the live check, following the three rules above.
- **Mechanic** (method step 4): for these jobs, act through the same
  sanctioned commands the panels write through (`nixarchy pkg add`,
  `nixarchy app enable`, `nixarchy dev init`, `nixarchy vm`,
  `distrobox`/`podman`), never by hand-editing `apps.nix`. Offering to *open*
  the panel (`nixarchy-plugin <id>`) counts as an action, so it is
  Mechanic-only and needs the user's yes. Guide names the menu path and key.
- **Frontmatter description**: add "VMs, containers, Distrobox boxes" to the
  list of things the skill answers, so it is selected for those questions.

### 3. `share/CLAUDE.md` (the fallback when no skill loads)

One sentence is added to the short version: "For installing, per-project
environments, VMs, containers and boxes, prefer nixarchy's own panels (see
KNOWLEDGE.md) after checking `nixarchy-plugin --enabled <id>`."

### 4. The offline surfaces

**FAQ (`share/faq.json`).** These answers are static, so they cannot check
live. They say "if you don't see it, it may be off: Setup ▸ Plugins".

- *Install an app*: leads with **Install ▸ Packages** (the package manager
  panel), then the Install menu and `nixarchy search`/`nixarchy apply` as
  now.
- *A toolchain just for one project*: leads with **Apps ▸ Dev environments**,
  and keeps `nixarchy dev init <preset>`.
- **Three new entries** in the existing categories (Apps and System, not a
  new category):
  - *Try something in a throwaway VM* (MicroVMs, `nixarchy vm`)
  - *Run a container* (Podman panel; note that `docker` is still rootless
    Docker)
  - *Software that only ships for Ubuntu or Arch* (Distrobox, Boxes)

  This takes the FAQ from 22 entries to 25. Search shows at most three FAQ
  rows per query (`MenuSearch.qml`), so more entries do not crowd the card.

**Learning path (`share/learn.json`).** The ids, titles and count stay the
same. Only two `question` strings change, because they are what the agent is
asked:

- `install`: "How do I install and remove apps on nixarchy with the package
  manager panel, why does nothing change until I apply, and what do I use
  for software NixOS will not run?" This covers the package manager and
  Distrobox.
- `devenv`: "How do I give one project its own toolchain, and where do
  containers and throwaway VMs fit?" This covers devenv, Podman and MicroVMs.

No title changes, so progress already saved in `learning.json` (keyed by
id) is unaffected.

### 5. Tests, `tools/test_nixi.py`

One new check, `test_prefers_nixarchy_plugins`:

- `KNOWLEDGE.md` names all five ids and `nixarchy-plugin --enabled`.
- `SKILL.md` has the "prefer nixarchy's own tools" step and mentions
  `nixarchy-plugin`.
- `faq.json` has the three new questions, and *Install an app* mentions the
  package manager panel before `nixarchy apply`.
- The `install` and `devenv` questions in `learn.json` mention packages,
  Distrobox, containers and VMs.
- The existing `_recommends_arch` guard still passes on the FAQ.

## Out of scope: the showcase (open question 4)

The #22 recording and README show Nixi answering "how do I install an app?"
with `apps.nix`, which is correct but will no longer be how it answers. The
proposal is a follow-up issue after this merges: re-record scene 2 on razer,
swap `02-answer.png` and the matching seconds of the MP4 and GIF, and change
one caption. Doing it here would mean recording against unreleased
behaviour, and it would tie a documentation change to this PR's review.

## Alternatives rejected

- **New learning-path topics or a tour step**: decided against in the intent
  review.
- **Read `plugins.md` at answer time only, with no table**: every answer
  would depend on search ranking, and the offline FAQ could not use it at
  all.
- **A table only, with no live check**: it would send people to keys and
  panels that do not exist on their machine. On razer, four of the five keys
  and two of the five plugins would have been wrong.
- **Nixi opens the panel itself, in Guide**: that is an action, and Guide
  promises none. It stays Mechanic-only, behind a yes.
- **Herdr and the CI panels**: out of scope, per the intent review.

## Risks

- **Plain Omarchy, or NixOS without nixarchy.** There `nixarchy-plugin` is
  missing. Rule 1 treats "command not found" as "not on nixarchy": the
  answer falls back to what it is today, with no panel mentioned.
- **Plugin ids or menu paths change upstream.** The table goes stale. The
  live check catches a changed id (the answer falls back to the command);
  a changed menu path is caught only by the weekly manual. The table cites
  `plugins.md` so the drift is easy to spot.
- **Answers get longer.** The skill's 2–6 sentence rule still holds. The
  panel-then-command order replaces text; it does not add to it.
- **The skill is shared** with `~/.claude/skills/nixi` outside the card.
  That is intended: a Claude session outside Nixi should give the same
  advice.

## Verification

- `python3 tools/test_nixi.py` passes, including the new check;
  `node --test bridge/*.test.js` is 41/41 (the tour-model test reads
  `learn.json`); `nix flake check` passes; `git diff --check` is clean.
- **Behaviour, on razer, without rebuilding it.** In a scratch directory
  holding the branch's `CLAUDE.md`, `KNOWLEDGE.md` and skill, run
  `claude -p` in plan mode (Guide's mode) with five questions:
  1. "how do I install btop?"
  2. "I need a Python environment for one project"
  3. "can I try something in a throwaway VM?"
  4. "how do I run a container?"
  5. "this app only ships a .deb"

  Each answer must lead with the right panel and match razer's real state:
  - the package manager: menu path, and no Super+Alt+N (it is not bound);
  - devenv: not installed, so how to get it, plus `nixarchy dev init`;
  - MicroVMs: Super+Alt+V;
  - Podman: off, so how to turn it on;
  - Distrobox: Trigger ▸ Boxes, and no Super+Alt+D.

  Each must end with the terminal command. The transcripts go in the PR.
- The same five questions against `master`'s files, as a before/after. On
  `master`, no answer names a panel.
