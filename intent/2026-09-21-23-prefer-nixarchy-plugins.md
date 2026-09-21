---
status: draft
issue: 23
author: olafkfreund
---

# Intent: Nixi sends people to nixarchy's own tools first

## Problem

nixarchy ships shell plugins that are the intended way to do the jobs a
newcomer asks about most. nixarchy's manual (`docs/manual/plugins.md`) says
each exists to replace "a floating terminal" with "a chord and a list":

| Job | nixarchy's tool | Open it (from the manual) |
| --- | --- | --- |
| Install an app, a service, a package; set an option | Package manager (nixarchy-pkg) | Install ▸ Packages · Super+Alt+N |
| A per-project toolchain | Dev environments (nixarchy-devenv) | Apps ▸ Dev environments · Super+Alt+E |
| A disposable or permanent VM | MicroVMs (nixarchy-microvm) | Trigger ▸ Sandbox · Super+Alt+V |
| Containers | Podman (nixarchy-podman) | Apps ▸ Podman · Super+Alt+O |
| Software NixOS will not run | Distrobox (nixarchy-distrobox) | Trigger ▸ Boxes · Super+Alt+D |
| Agent sessions, CI | Herdr, GitHub Actions, GitLab pipelines | Super+Alt+H / A / P |

Nixi does not know most of this. Of those tools, `microvm`, `podman` and
`distrobox` appear nowhere in `share/KNOWLEDGE.md`, `share/faq.json`,
`share/learn.json`, `share/CLAUDE.md` or `skills/nixi/SKILL.md`. The package
manager and devenv appear only as the terminal commands (`nixarchy pkg add`,
`nixarchy dev init`). The skill's method teaches `apps.nix` plus
`nixarchy apply` as *the* install answer, so that is what the agent says.

Seen on razer on 2026-09-21: asked to install btop, Nixi answered with
`~/.config/nixarchy/apps.nix` and `nixarchy apply`, and never mentioned the
package manager panel. The answer was correct, but it pointed away from the
tool nixarchy built for exactly that job.

The local manual Nixi searches does contain `plugins.md`, so the facts are
reachable. Nothing tells the agent to prefer them, though, and the offline
surfaces (FAQ, tour, learning path) cannot search at all.

## Proposed outcome

When someone asks Nixi how to do one of those jobs, the first answer is
nixarchy's own tool: where it lives in the menu, its key, and what it does,
with the terminal command offered second, for people who want it. Concretely:

- Asking "how do I install X", "I need a Python environment for this
  project", "can I try something in a VM", "how do I run a container", or
  "this app only ships for Ubuntu" gets the matching panel first.
- The answer is right for *this* machine. It checks that the plugin is
  installed and enabled, and whether its key is bound, before telling
  someone to press it. The keys are seeded only on new installs. On razer
  only Super+Alt+V, A and P are bound; the package manager (N), devenv (E),
  Podman (O) and Distrobox (D) keys from the manual do nothing.
- The offline FAQ and the learning path cover the same tools, so someone
  without an agent learns them too.
- In Mechanic, when Nixi does the job itself, it uses the same sanctioned
  path the panel writes to (`nixarchy pkg add`, `nixarchy app enable`,
  `nixarchy dev init`, `nixarchy vm`), not hand edits.

## Affected users and systems

- Everyone using Nixi on nixarchy: answers change.
- `share/KNOWLEDGE.md`, `share/CLAUDE.md`, `skills/nixi/SKILL.md`,
  `share/faq.json`, `share/learn.json`, and possibly `share/tour.json`.
- `tools/test_nixi.py` and the bridge tests, if they pin FAQ or learn counts.
- Nixi on plain Omarchy/Arch, or on NixOS without nixarchy, where these
  plugins do not exist.

## Constraints

- Must never recommend a plugin that is not there. Verify live
  (`omarchy-shell shell listPlugins`, `omarchy menu keybindings --print`)
  rather than assuming the table above.
- Must not duplicate nixarchy's manual. Nixi points at it and at the plugin's
  own site; the manual stays the source of truth for details.
- The terminal commands stay correct and available. The panels are preferred,
  not the only way.
- Guide still changes nothing: this changes what Nixi recommends, not what it
  may do.
- Keep answers 2–6 sentences, as the skill requires.

## Open questions

1. **Which plugins are in scope?** All of them in `plugins.md`, or the five
   that replace a newcomer's Arch habit (package manager, devenv, MicroVMs,
   Podman, Distrobox)? Herdr and the CI panels are developer tools rather
   than beginner questions.
2. **Tour and learning path:** add a learning-path topic per tool (16 becomes
   about 20), fold them into the existing "Installing software" and
   "Per-project toolchains" topics, or both? Should the tour gain a step?
3. **Where the truth lives:** hard-code the table in `KNOWLEDGE.md`, or have
   Nixi read `plugins.md` from the local manual at answer time, so a new
   plugin is picked up without a Nixi release?
4. **The showcase (#22):** should the story and the recording also show Nixi
   recommending the package manager panel, once this lands?
