---
status: draft
issue: 31
intent: intent/2026-09-21-31-grounding-vs-panels.md
---

# Spec: The card's manual excerpt must not override "prefer nixarchy's own tools"

## Decisions carried from the intent review

- Fix **both** the wording in `bridge/grounding.js` and the ranking in
  `bin/nixi-context`.
- The added context **tells the agent to check keys** with
  `omarchy menu keybindings --print` before stating one.
- Tests: **CI** checks the prompt the agent receives and the excerpt
  `nixi-context` picks; **razer** checks what Claude actually answers,
  through the real card.

## What the ranking does today

This was measured with the real `nixi-context` code, the repo's
`KNOWLEDGE.md` and the fetched manual (70 pages, the same set razer has). It
shows the top-scoring section for each #23 question, and where
KNOWLEDGE.md's "nixarchy's own tools" section ranks:

| question | wins today | tools section |
| --- | --- | --- |
| how do I install btop? | "Dual boot install" (5.06) | 87th (0.51) |
| how do I install an app? | "I picked an app in Install and it never appeared" (8.61) | 75th (1.03) |
| I need a Python environment for one project | "Per-project environments" (9.71) | 145th (0.68) |
| can I try something in a throwaway VM? | "Using it # windows vm" (5.19) | 28th (1.03) |
| how do I run a container? | "Or: add it to NixOS you already run" (4.08) | 129th (0.34) |
| this app only ships a .deb | "I picked an app in Install…" (5.36) | 33rd (1.54) |

Word overlap cannot find the tools section: it is a table whose rows share
few words with the questions. Four of the six winners are unrelated to the
question (dual boot, Windows VM, getting started, and an install
troubleshooter for a .deb). Only the Python one is a good excerpt, and even
it describes the terminal command rather than the panel.

## Design

### 1. `bin/nixi-context`: a tools route ahead of the manual

A small table in the script, `TOOL_JOBS`, maps each of the five plugin ids
to trigger words, matched against the question's tokens after the existing
`_tokens()` stemming:

| id | trigger tokens (any) |
| --- | --- |
| `nixarchy.pkg` | install, uninstall, remove, package, apt, pacman, yay, flatpak |
| `nixarchy.devenv` | environment, toolchain, venv, virtualenv, devenv, python, node, nodejs, go, rust, java, ruby, sdk, project |
| `nixarchy.microvm` | vm, virtual, sandbox, throwaway, disposable, microvm |
| `nixarchy.podman` | container, docker, podman, compose |
| `nixarchy.distrobox` | deb, rpm, aur, ubuntu, debian, fedora, arch, distro, distribution, box, distrobox, appimage |

The trigger words live in code, next to the ranking they steer. The facts
stay in KNOWLEDGE.md, which is still the single source of truth:
`nixi-context` reads its "nixarchy's own tools" section, finds the table row
whose plugin-id cell matches, and quotes that row and the rules paragraph
beneath the table.

Precedence, where a question can match more than one job:
- `nixarchy.distrobox` wins over `nixarchy.pkg`, because ".deb", "Ubuntu" and
  "AUR" are what make an install a Distrobox job.
- `nixarchy.devenv` wins over `nixarchy.pkg` for "project" and language
  words.
- Otherwise the first match in the table order wins, and at most two rows
  are quoted.

`local_answer()` output becomes, in this order:
1. `From the notes — nixarchy's own tools (prefer these; check before
   recommending):` the matched row(s), rendered as `job · id · open it ·
   seeded key · terminal · manual`, followed by the rules paragraph cut to
   its first two rules. This part is at most 600 characters.
2. The manual section, as today, but only if its score clears the existing
   3.8 threshold **and** it is not one of the unrelated winners above. That
   last test is not a special case: it is the existing threshold, raised to
   5.5 when a tools row is present, so a weak manual match does not dilute a
   strong tools answer. The measured scores above decide which excerpts
   survive:
   - dropped: dual boot (5.06), Windows VM (5.19), .deb troubleshooter
     (5.36), getting started (4.08);
   - kept: install-an-app troubleshooter (8.61), per-project environments
     (9.71). Both are relevant.
3. The live keybindings grep, as today.

A question that triggers no job gets exactly today's output.

### 2. `bridge/grounding.js`: background, not script

The wrapper text changes from

> (Local search context — answer directly from this when it suffices,
> verify live only if it doesn't: …)

to

> (Local context for this question — background from the manual and Nixi's
> notes, not the whole answer. Follow your method: when a nixarchy tool below
> fits, lead with it after checking it is on; state a key only after
> checking it with `omarchy menu keybindings --print`. …)

`CONTEXT_LIMIT` rises from 1200 to 1600, so the tools part (≤600) and a
manual excerpt (≤700) both fit. Timeouts, the fallback when `nixi-context`
fails, and the question-first order are unchanged.

## Alternatives rejected

- **Wording only**: the excerpt would still be "Dual boot install" for btop.
  Softer framing around the wrong excerpt is still the wrong excerpt.
- **Ranking only**: the old wording would still say "answer directly from
  this", which is fine once the right excerpt wins but leaves the key rule
  unstated.
- **Boosting KNOWLEDGE.md's score globally**: every question would drift
  towards notes over the manual, including ones the manual answers well.
- **Trigger words in KNOWLEDGE.md**: they are ranking tuning, not facts, and
  the facts file is also read by the agent directly.
- **An embedding or LLM re-ranker**: a network call or a model on every
  question, for a five-row problem.

## Risks

- **False triggers.** An earlier draft had "app" and "software" as
  package-manager triggers. Measured, "how do I close an app" would then get
  a package-manager row, and its right excerpt ("Apps & windows", 4.94) would
  be dropped by the 5.5 threshold; "open a terminal app" likewise. So the
  package manager triggers only on install and remove words, never on "app".
  "aur" moved to Distrobox, which is where an AUR-only program goes, and
  "image" was left out of Podman's triggers ("open an image"). The test set
  pins non-install "app" questions to today's output.
- **The 5.5 threshold drops a good manual excerpt** scoring between 3.8 and
  5.5 when a tools row is present. It is measured: none of the six questions
  loses a relevant excerpt. The CI table (below) pins it.
- **The table layout in KNOWLEDGE.md changes** and the row parser breaks.
  Then the tools part is empty and the output falls back to today's. A test
  fails if any of the five ids stops being found.
- **Longer prompts**: +400 characters at most, on the questions that trigger.

## Verification

- **`tools/test_nixi.py`**, new `test_tools_route()`, using the repo's
  `KNOWLEDGE.md` and a fixture manual holding the six winning sections above
  (copied into the test's temp dir):
  - each of the six questions yields the right plugin id first (btop and
    install-an-app give pkg; Python gives devenv; VM gives microvm;
    container gives podman; .deb gives distrobox);
  - dual boot, Windows VM, getting started and the .deb troubleshooter are
    **not** included; the install troubleshooter and per-project
    environments **are**;
  - "how do I close an app" (today: "Apps & windows", 4.94), "open a terminal
    app" (5.84), "what is the scratchpad" (4.50) and "change the theme" (5.55)
    give exactly today's output, with no tools row;
  - "how do I remove an app" does trigger the package manager (removing is
    its job), and today's winner there, "Web Apps" (5.32), is dropped, which
    is intended;
  - the existing `test_local_search` still passes (install gives an answer
    containing `nixarchy apply`; nonsense gives None).

  It is seen to fail before the change.
- **`bridge/grounding.test.js`**: the prompt sent to the agent contains
  "not the whole answer", "lead with it after checking it is on" and
  `omarchy menu keybindings --print`, and no longer contains "answer directly
  from this". The existing order and fallback tests still pass.
- `node --test bridge/*.test.js`, `nix flake check`, and `omarchy plugin
  validate`.
- **razer, through the card** (the #19 method: a store copy, the seven-link
  swap with `/tmp/swap26.sh`, restored afterwards), in Guide, with the same
  five #23 questions. Each answer must lead with the right panel and match
  razer's state:
  - package manager: SUPER+SPACE ▸ Install ▸ Packages, no Super+Alt+N;
  - devenv: not installed, how to get it;
  - MicroVMs: Super+Alt+V;
  - Podman: off, how to turn it on;
  - Distrobox: Trigger ▸ Boxes, no Super+Alt+D.

  No answer may state a key that razer does not bind. Screenshots go in the
  PR, and are also the new scene 2 for #26.
