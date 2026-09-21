---
status: draft
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
3. **`bridge/grounding.test.js`**: a test that the prompt contains "not the
   whole answer", "lead with it after checking it is on" and `omarchy menu
   keybindings --print`, and does not contain "answer directly from this".
   → verify: it fails before step 4.
4. **`bridge/grounding.js`**: the new wrapper text and `CONTEXT_LIMIT = 1600`.
   Update the "Same wording nixi-server used" comment to say why it changed
   (#31).
   → verify: the step 3 test passes; all bridge tests pass (50 + 1).
5. **Repo checks**: `python3 tools/test_nixi.py`, `node --test
   bridge/*.test.js`, `nix flake check`, `git diff --check`, and `omarchy
   plugin validate` on a clean copy. Also check that the fixture directory
   stays out of the package: `nix/package.nix` installs from `bin/`, `share/`
   and named files, never from `tools/`.
   → verify: all pass; `find result/ -name 'manual-grounding'` is empty.
6. **Measure the real ranking again** with the real 70-page manual (the
   spec's table), before and after, for the six questions and the five
   controls.
   → verify: the tools id comes first for the six; the controls are
   unchanged; recorded under this step.
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
