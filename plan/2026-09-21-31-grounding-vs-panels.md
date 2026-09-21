---
status: approved
issue: 31
spec: spec/2026-09-21-31-grounding-vs-panels.md
---

# Plan: The card's manual excerpt must not override "prefer nixarchy's own tools"

## Approved decisions

- **`bin/nixi-context`**, a tools route ahead of the manual:
  - `TOOL_JOBS` maps each plugin id to its trigger words:
    - `nixarchy.pkg`: install, uninstall, remove, package, apt, pacman, yay,
      flatpak (never "app" or "software");
    - `nixarchy.devenv`: environment, toolchain, venv, virtualenv, devenv,
      python, node, nodejs, go, rust, java, ruby, sdk, project;
    - `nixarchy.microvm`: vm, vms, virtual, sandbox, throwaway, disposable,
      microvm;
    - `nixarchy.podman`: container, docker, podman, compose (never "image");
    - `nixarchy.distrobox`: deb, rpm, aur, ubuntu, debian, fedora, arch,
      distro, distribution, box, boxes, distrobox, appimage.
  - Precedence: distrobox > devenv > pkg > the rest in table order; at most
    two rows.
  - The row text is read from KNOWLEDGE.md's "nixarchy's own tools" table,
    plus its first two rules. That part is at most 600 characters.
  - When a tools row is present, a manual excerpt needs a score of 5.5
    instead of 3.8. The keybindings grep is kept.
  - A question that triggers no job gets exactly today's output.
- **`bridge/grounding.js`**:
  - the wrapper becomes: "(Local context for this question — background
    from the manual and Nixi's notes, not the whole answer. Follow your
    method: when a nixarchy tool below fits, lead with it after checking it
    is on; state a key only after checking it with `omarchy menu keybindings
    --print`.\n…)";
  - `CONTEXT_LIMIT` goes from 1200 to 1600.
- **Tests:** CI (`test_tools_route`, a grounding test) and razer through the
  card (the five #23 questions, using the reversible seven-link swap).

## Steps

1. **`tools/test_nixi.py`**: `test_tools_route()`, registered in
   `__main__`. It builds a temp `NIXI_DATA/manual/` holding fixture pages
   with the six winning sections
   (`tools/fixtures/manual-grounding/*.md`, committed; see the note below on
   where each comes from). `NIXI_DIR` holds the
   repo's `KNOWLEDGE.md`. It asserts:
   - btop / install-an-app → `nixarchy.pkg`; Python → `nixarchy.devenv`;
     VM → `nixarchy.microvm`; container → `nixarchy.podman`; .deb →
     `nixarchy.distrobox`;
   - the dual-boot, Windows-VM, getting-started and (for .deb) install
     troubleshooter excerpts are absent;
   - the install troubleshooter (for install-an-app) and per-project
     environments (for Python) are present;
   - for "how do I close an app", "open a terminal app", "what is the
     scratchpad" and "change the theme", `local_answer()` equals what the
     unchanged scoring returns (computed in the test from a copy of the old
     function, kept as `_legacy_local_answer` in the test file);
   - "how do I remove an app" gives `nixarchy.pkg`.

   → verify: it fails before step 2 (no ids in the output).

   The fixture holds only the pages that have to win or lose, so the test is
   hermetic. Four of them (`dual-boot-install`, `getting-started`,
   `troubleshooting`, `per-project-environments`) are copied from nixarchy's
   `docs/manual/`, which is MIT, with the source path and commit named in a
   comment line at the top. `windows-vm` comes from `omacom/omarchy-site`,
   which has no license, so it is **not** copied. The fixture is a short
   stand-in written for the test, with the same "Using it" heading and VM
   vocabulary, tuned to score within 0.5 of the real section's 5.19 (checked
   in the test). The real text is still covered by step 6's measurement
   against the fetched manual.
2. **`bin/nixi-context`**:
   - add `TOOL_JOBS` (the trigger words run through `_tokens()` at import,
     so "boxes" and "boxe" meet);
   - add `_tool_rows(q)`: the question's token set plus the hyphen-split
     parts of each token ("ubuntu-only" → "ubuntu"), matched against the
     triggers, precedence applied, at most two ids;
   - add `_tools_section()`, which parses KNOWLEDGE.md's table rows by
     plugin-id cell (the same file `_sections()` already reads, from
     `NIXI_DIR`) and the first two numbered rules;
   - in `local_answer()`, build the tools part first, then the manual part
     with a threshold of 5.5 if a tools part exists and 3.8 if not, then the
     keybindings part. The return is `None` only if all three are empty.

   → verify: step 1's test passes; the existing `test_local_search` still
   passes.

   *Deviation (implementation):* the tools part is capped at **900**
   characters, not 600. At 600, rule 1 was cut mid-sentence and rule 2 ("menu
   path, key only if bound, then terminal") never appeared. Rows plus both
   rules measure 727–804 characters. Cells are kept as written (backticks
   included): stripping only their edges left mismatched backticks inside the
   terminal column. The threshold logic keeps today's behaviour exactly when
   no tool matches, including the case where a keybinding question carries a
   manual excerpt below 3.8.
3. **`bridge/grounding.test.js`**: a test that the prompt contains "not the
   whole answer", "lead with it after checking it is on" and `omarchy menu
   keybindings --print`, and does not contain "answer directly from this".
   → verify: it fails before step 4.
4. **`bridge/grounding.js`**: the new wrapper text and `CONTEXT_LIMIT = 1600`.
   Update the "Same wording nixi-server used" comment to say why it changed
   (#31).
   → verify: the step 3 test passes; all bridge tests pass (50 + 1).

   *Deviation (implementation):* `CONTEXT_LIMIT` is **1800**, not 1600, to
   fit the 900-character tools part and a 700-character manual excerpt. The
   longest measured output (install-an-app) is 1,323 characters.
5. **Repo checks**: `python3 tools/test_nixi.py`, `node --test
   bridge/*.test.js`, `nix flake check`, `git diff --check`, and `omarchy
   plugin validate` on a clean copy. Also check that the fixture directory
   stays out of the package: `nix/package.nix` installs from `bin/`, `share/`
   and named files, never from `tools/`.
   → verify: all pass; `find result/ -name 'manual-grounding'` is empty.

   *Deviation (implementation):* `nix flake check`'s selfcheck failed at
   first. The repo's branding checks (`test_no_runtime_rename`,
   `test_rebrand_is_complete`) scan every tracked file, and the whole copied
   nixarchy pages mention `omarchy-help` and "Omarchy ask". Each fixture is now
   only the one section the test needs (scoring is per section, so the scores
   are unchanged); none of those strings remain, and no check is loosened.
6. **Measure the real ranking again** with the real 70-page manual (the
   spec's table), before and after, for the six questions and the five
   controls.
   → verify: the tools id comes first for the six; the controls are
   unchanged; recorded under this step.

   *Result (implementation), against the real 70-page manual:*

   | question | output vs before | leads with | manual excerpt kept |
   | --- | --- | --- | --- |
   | install btop | changed | `nixarchy.pkg` | none (dual boot dropped) |
   | install an app | changed | `nixarchy.pkg` | install troubleshooter |
   | Python env for one project | changed | `nixarchy.devenv` | Per-project environments |
   | throwaway VM | changed | `nixarchy.microvm` | none (Windows VM dropped) |
   | run a container | changed | `nixarchy.podman` | none (getting started dropped) |
   | app only ships a .deb | changed | `nixarchy.distrobox` | none (troubleshooter dropped) |
   | remove an app | changed | `nixarchy.pkg` | none (Web Apps dropped) |
   | close an app / terminal app / scratchpad / theme | **identical** | — | as before |
7. **razer, through the card**:
   1. Build with razer's adapters (`build-with-adapters.sh`) and `nix copy`
      it to razer.
   2. Point `/tmp/swap26.sh` at the new build and run `swap26.sh in`.
   3. Ask for control, and wait for your yes.
   4. In **Guide**, ask the five #23 questions, one card session each
      (Escape and reopen between them), and screenshot each full answer.
   5. Run `swap26.sh out` and check all seven links are restored; release
      control.

   → verify, for each answer:
   - it leads with the right panel;
   - it matches razer's state: package manager at Install ▸ Packages with no
     Super+Alt+N; devenv not installed; MicroVMs with Super+Alt+V; Podman
     off; Distrobox at Trigger ▸ Boxes with no Super+Alt+D;
   - it states no key that razer does not bind.

   Any miss: stop, record it here, and change the wording or triggers in
   the same commit. Stop after two failed rounds and ask.

   *Result (implementation), razer 2026-09-21, the real card in Guide, a
   fresh session per question:*

   | question | leads with | keys stated |
   | --- | --- | --- |
   | install btop | btop already installed (true); for others Install ▸ Packages; checked it is on | "Super+Alt+N … I couldn't find that key", so it says use the menu |
   | Python env | Dev environments not installed; `nixarchy-service-enable devenv`, then `nixarchy dev init python` | Super+Alt+E named as not working yet |
   | throwaway VM | Trigger ▸ Sandbox, the MicroVMs panel | Super+Alt+V, checked as bound (true) |
   | container | Apps ▸ Podman ("on for you") | Super+Alt+O: "your keybindings don't show it", so it says use the menu |
   | .deb | Trigger ▸ Boxes, "turned on here" | "no keyboard shortcut right now" |
   | install an app (#31's own case) | Install ▸ Packages | "Super+Alt+N isn't bound on this machine" |

   6/6 lead with the right panel, and no unbound key is offered as working.
   Podman now reads as *on*: `nixarchy-plugin --enabled nixarchy.podman`
   returned 0 on razer (shell.json changed at 23:04, since the #23 run), so
   the answer matches the machine.
8. **Commit and PR**: `fix: the card's manual excerpt no longer overrides
   nixarchy's own tools (#31)`, with the template, the artifacts, the
   measurement table and the razer screenshots.
   → verify: CI green; review threads resolved.

## Tests

| check | expected |
| --- | --- |
| `test_tools_route`, before step 2 | fails |
| `python3 tools/test_nixi.py` | all checks passed |
| grounding wording test, before step 4 | fails |
| `node --test bridge/*.test.js` | 51/51 |
| `nix flake check`, plugin validate | pass; fixtures not in the package |
| real-manual ranking | tools id first for 6/6; controls unchanged |
| razer, through the card | 5/5 lead with the right panel; no unbound key stated |

## Rollback

Revert the commit. Grounding goes back to the old wording and ranking, and
nothing on a user's machine persists. The razer links are restored in step 7.
