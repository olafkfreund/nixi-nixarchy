---
status: draft
issue: 23
spec: spec/2026-09-21-23-prefer-nixarchy-plugins.md
---

# Plan: Nixi sends people to nixarchy's own tools first

## Approved decisions (from the intent and spec)

- **Five plugins, and no others:**
  - `nixarchy.pkg`: Install ▸ Packages · Super+Alt+N
  - `nixarchy.devenv`: Apps ▸ Dev environments · Super+Alt+E
  - `nixarchy.microvm`: Trigger ▸ Sandbox · Super+Alt+V
  - `nixarchy.podman`: Apps ▸ Podman · Super+Alt+O
  - `nixarchy.distrobox`: Trigger ▸ Boxes · Super+Alt+D

  Herdr and the CI panels stay out.
- **Always check live before recommending a plugin:**
  - on: `nixarchy-plugin --enabled <id>`
  - installed: `test -d ~/.config/omarchy/plugins/<id>`
  - key bound: `omarchy menu keybindings --print`
  - no `nixarchy-plugin` at all means this is not nixarchy, so answer as
    today and name no panel.
- **Answer order:** the panel (menu path, then the key only if bound), one
  line on what it does, then the terminal command. If the plugin is off: Setup
  ▸ Plugins or `omarchy plugin enable <id>`. If it is not installed: what turns
  it on, and the command as the answer for now.
- **Guide** names the panel. **Mechanic** acts through `nixarchy pkg add`,
  `nixarchy app enable`, `nixarchy dev init`, `nixarchy vm`,
  `distrobox`/`podman`, never by hand-editing `apps.nix`. Opening a panel
  (`nixarchy-plugin <id>`) is Mechanic-only, after a yes.
- **Truth:** a fixed table in `KNOWLEDGE.md` for the five, and the local
  manual (`plugins.md`, `boxes.md`, `sandboxes.md`,
  `per-project-environments.md`) for the details.
- **Learning path:** stays 16 topics with the same ids and titles; only the
  `install` and `devenv` questions change. The tour is unchanged.
- **FAQ:** 22 entries become 25, in the existing categories.
- **Out of scope:** re-recording the showcase (a follow-up issue after merge),
  and #19–#21.

## Steps

1. **`share/KNOWLEDGE.md`**: a new section **"## nixarchy's own tools —
   prefer these (verified on razer 2026-09-21)"**, placed after "NixOS —
   where nixarchy differs from Omarchy". It holds:
   - a table with columns *the job* · *plugin id* · *open it* (menu path) ·
     *seeded key* · *terminal* · *manual page*, one row per plugin:
     - package manager: `nixarchy search`, `nixarchy pkg add`,
       `nixarchy app enable`, `nixarchy apply` · `plugins.md`
     - devenv: `nixarchy dev init`, `nixarchy dev list` ·
       `per-project-environments.md`
     - MicroVMs: `nixarchy vm` · `sandboxes.md`
     - Podman: `podman` (and the note that `docker` stays rootless Docker) ·
       `plugins.md`
     - Distrobox: `distrobox` · `boxes.md`
   - the three rules (check, order, off/not-installed), with the exact
     commands;
   - one line on why keys may be missing: they are seeded only on new
     installs, and razer lacks N, E, O and D.

   Also update the "Apps & windows" bullet "the Install menu queues into
   `apps.nix`" to name the package manager panel first.
   → verify: `grep -c 'nixarchy\.\(pkg\|devenv\|microvm\|podman\|distrobox\)'`
   finds all five ids; the file reads cleanly.

2. **`skills/nixi/SKILL.md`**:
   - Frontmatter `description`: add "VMs, containers, Distrobox boxes" to the
     list of what it answers.
   - "What nixarchy is": the package bullet leads with the package manager
     panel (Install ▸ Packages), keeps queue-then-apply, and gives
     `nixarchy apply` as the terminal form.
   - A new **Method step 2, "Prefer nixarchy's own tools"**. The old
     steps 2–5 are renumbered 3–6, and the in-text references ("see 2") are
     fixed. It carries the check and the order, points to the KNOWLEDGE
     table, and covers the not-nixarchy fallback.
   - The Mechanic paragraph (now step 5) adds the sanctioned commands, "never
     hand-edit `apps.nix`", and that opening a panel is an action that needs
     a yes.
   → verify: `grep -n "nixarchy-plugin" skills/nixi/SKILL.md` finds at least
   2 lines; step numbering and cross-references are consistent (read the
   file).

3. **`share/CLAUDE.md`**: one sentence in the short version, as the spec
   words it.
   → verify: `grep -c "nixarchy-plugin --enabled" share/CLAUDE.md` is 1.

4. **`share/faq.json`**:
   - "Install an app": leads with Install ▸ Packages (the package manager
     panel: search, tick, apply with one key), then the Install menu and
     `nixarchy search` / `nixarchy apply`. It adds "if you don't see it, it
     may be off: Setup ▸ Plugins".
   - "A toolchain just for one project": leads with Apps ▸ Dev environments,
     then `nixarchy dev init <preset>`.
   - New "Apps" entry: **"Software that only ships for Ubuntu or Arch"**:
     Distrobox via Trigger ▸ Boxes, with a box as a whole other distribution
     inside nixarchy. No literal `pacman -S`/`yay -S`: the existing
     `_recommends_arch` guard rejects them, and that is intended.
   - New "Apps" entry: **"Run a container"**: the Podman panel (Apps ▸
     Podman), `podman` in a terminal, and that `docker` is rootless Docker.
   - New "System" entry: **"Try something in a throwaway VM"**: MicroVMs
     (Trigger ▸ Sandbox), `nixarchy vm`, and that the VM is disposable.
   - Each new entry goes next to its category's existing entries, so the
     file stays grouped.
   → verify: valid JSON, 25 entries, every entry exactly
   `{cat, q, a}`.

5. **`share/learn.json`**: replace the `question` of `install` and `devenv`
   with the spec's wording. Ids, titles and order are unchanged.
   → verify: 16 topics, ids unchanged (a `diff` of the ids list before and
   after is empty).

6. **`tools/test_nixi.py`**: add `test_prefers_nixarchy_plugins()` asserting
   the spec's five points, and register it in the `__main__` tuple.
   → verify: it fails when run against step 5's tree with KNOWLEDGE.md's
   section removed (a quick negative check, then restore), and passes on
   the full tree.

7. **Repo checks:** `python3 tools/test_nixi.py`,
   `node --test bridge/*.test.js` (41/41), `nix flake check`,
   `git diff --check`, and `omarchy plugin validate` on a clean copy.
   → verify: all pass.

8. **Behaviour on razer, before and after, without rebuilding razer.** For
   each tree (`origin/master`, then this branch), copy `share/CLAUDE.md`,
   `share/KNOWLEDGE.md` and `skills/nixi/SKILL.md` to
   `/tmp/nixi23-<tree>/` on razer. From that directory run, per question:
   `claude -p --permission-mode plan --disable-slash-commands --append-system-prompt "$(cat SKILL.md KNOWLEDGE.md)" "<question>"`.
   `--disable-slash-commands` keeps razer's installed nixi skill (the
   `master` version) from loading. `plan` is Guide's mode. The questions:
   1. "how do I install btop?"
   2. "I need a Python environment for one project"
   3. "can I try something in a throwaway VM?"
   4. "how do I run a container?"
   5. "this app only ships a .deb"

   → verify, on the branch, that each answer:
   - leads with the right panel;
   - matches razer's state: package manager with no Super+Alt+N; devenv not
     installed, how to get it, plus `nixarchy dev init`; MicroVMs with
     Super+Alt+V; Podman off, how to turn it on; Distrobox via Trigger ▸
     Boxes with no Super+Alt+D;
   - gives the terminal command.

   On `master`, no answer should name a panel. Save all ten transcripts. If
   the branch answers miss, revise the wording in steps 1–2, update this
   plan in the same commit, and re-run. Stop after two failed rounds and ask.
   Remove `/tmp/nixi23-*` on razer afterwards.

9. **Commit and PR.** One commit, `feat: Nixi sends people to nixarchy's own
   tools first (#23)`, on `feat/23-prefer-nixarchy-plugins`. The PR follows
   `.github/pull_request_template.md`, links the intent, spec and plan, and
   includes the before/after transcripts (collapsed). It also opens the
   follow-up issue: "Re-record showcase scene 2 now that Nixi leads with the
   package manager".
   → verify: CI green on the PR.

## Tests

| check | expected |
| --- | --- |
| `python3 tools/test_nixi.py` | all checks passed, including `test_prefers_nixarchy_plugins` |
| negative run of that test | fails when the KNOWLEDGE section is removed |
| `node --test bridge/*.test.js` | 41/41 |
| `nix flake check` | passes |
| `omarchy plugin validate <clean copy>` | passes |
| razer behaviour, branch | 5/5 answers lead with the right panel and match razer's state |
| razer behaviour, master | 0/5 name a panel (the baseline) |

## Rollback

Revert the one commit. All the changes are text the agent reads (knowledge,
skill, prompt, FAQ, learning questions) plus one test, so nothing on a user's
machine needs undoing: the next rebuild or plugin update ships the old text.
Saved learning progress is keyed by topic id, and no id changes.
