---
status: approved
issue: 217
intent: intent/2026-11-07-217-companion-onboarding.md
---

# Spec: Companion docs: an onboarding README and a getting-started guide

The approved recommendations for the open questions:

- The companion's `README.md` is the one onboarding, and this repo's companion section shrinks to a short paragraph and a link.
- `docs/GETTING-STARTED.md` is new, and `docs/GUIDE.md` stays as the reference.
- The reader is on nixarchy first, with a short path for any NixOS with Home Manager.
- The VM and a p620 checklist are the proof.
- The screenshots are a few stills.

Facts below are from `nixoarchy-snowflake` main at 8f2275e and this repo at `origin/master`, and they are re-checked at
the commit being documented.

## Design

### Three files, three jobs

| File | Job | Length |
|---|---|---|
| `nixoarchy-snowflake/README.md` | Onboarding: from nothing to "he answered me", every step checked | ~200 lines |
| `nixoarchy-snowflake/docs/GETTING-STARTED.md` | The first day: each choice explained, with what to pick and why | ~350 lines |
| `nixoarchy-snowflake/docs/GUIDE.md` | Reference: every feature, setting and command, brought up to date | ~450 lines |

`nixi-nixarchy/README.md`'s "The snowflake companion (optional)" section (`README.md:89-189`) becomes three lines: what
it is, the two-option snippet, and a link to the companion README. Its Settings → Desktop table, `commandDone` and the
notification privacy text move to `GUIDE.md`, so they're kept in one place.

### README.md: the onboarding

Keep the header (logo, tagline, links row). Then:

1. **What it is.** Three lines: a desktop snowflake you talk to, and it runs the agent through nixi under nixi's trust
   rules.
2. **Before you start.** A short checklist:
   - NixOS with Home Manager and flakes;
   - nixi with an agent signed in (on nixarchy it already is);
   - a mic;
   - speakers or headphones.
   Each item has a one-line test command, such as `command -v nixi` for nixi, or the check nixi's README gives.
3. **Onboarding.** Numbered steps. Each step has the same three parts: **Do** (a copyable block), **You should see**,
   and **If not** (the likely cause and fix).
   0. **Not on nixarchy: nixi first.** Add nixi's flake input, import its Home Manager module, set
      `services.nixi.enable = true`, and sign in an agent. The snippet is copied from nixi's README (`README.md:54`
      there) and checked at the same commit. Readers on nixarchy skip this step.
   1. Add the flake input `nixoarchy-snowflake`.
   2. Turn it on: `services.nixi.companion.enable` and `.package`.
   3. Switch: `nixos-rebuild switch` or `nh os switch`. The check is `command -v nixi-companion`.
   4. Start him with `nixi-companion show`. Then start him at login and bind a key. The module does neither, which is
      the trap the intent names. The examples are nixarchy's `o.exec_on_start` and `o.bind` in a lua file, and a plain
      Hyprland `exec-once` and `bind` line.
   5. Type to him first. It needs no mic, so it shows the agent link works before sound is involved.
   6. Pick the mic: right-click, settings, the **Voice** tab, **Microphone**. If he can't hear you, run `nixi-companion doctor`.
      - Speakers on the desk: a short note that an echo-cancelled source helps, linking to GETTING-STARTED.
   7. Say "hey Nixi". On by default (`wake_word`).
   8. His voice. A local voice works out of the box, with `tts` set to `auto`: Kokoro, then piper, then espeak.
      ElevenLabs is optional, and the details are in GETTING-STARTED.
   9. Messages through him. Turn on the first two switches in the **Nixi card's** Settings → Desktop. That's the
      card, not the companion's own settings, which have no Desktop tab. It needs the nixarchy shell's
      notification patch, and without it the shell's popups stay. Clicking a message opens its app.
   10. Trust: Guide or Mechanic, switched in the card. Then `nixi-companion restart` (#146), the trap the intent names.
4. **What stays on your machine, and what doesn't.** It replaces the "everything runs on your computer" line:
   - Local: speech-to-text, the local voices, and notification text (never logged, written or given to the agent).
   - Leaves the machine: what you ask goes to your agent's provider. With ElevenLabs on, the text he speaks goes to
     ElevenLabs.
5. **Next.** Links to GETTING-STARTED and GUIDE.
6. **Need help?** The existing table, extended with one row for each step's most common failure.
7. **Working on it** and the credits, as today.

### GETTING-STARTED.md: the first day, choices explained

Sections, in the order a new user meets them:

- **Speakers or headphones.** Why speakers can make him answer a video, and the echo-cancelled mic as the fix:
  - pick an existing echo-cancelled source in the mic menu;
  - or, once #216 ships, `services.nixi.companion.echoCancel.enable`. Shown only after it is merged, in line with the
    intent's rule that nothing planned is shown as done.
- **Choosing a character, and its voice.** Settings, Look: the character grid and the voice for each character.
- **ElevenLabs.**
  - What it costs, and the daily character cap (1,000 to 500,000).
  - The key is a file. It must be under `/run/agenix`, `/run/agenix.d` or `/run/secrets`, owned by root or you,
    **readable by you** (the companion runs as you), and hold 16 to 128 key characters. Anything else is refused
    (`app/eleven.py:36-50`).
    - The agenix and sops examples set the secret's `owner` to the user, or `mode = "0440"` with the user's group.
    - The code also accepts `$CREDENTIALS_DIRECTORY`, but only a systemd service has one, and the companion isn't a
      service, so the docs leave it out.
  - The default path is `/run/agenix/api-elevenlabs`, and `eleven_key_file` changes it.
  - An agenix example and a sops-nix example, both with placeholder names.
  - How to check it worked: Settings, Voice shows the key as present.
  - What leaves the machine: the text he speaks.
- **Messages and notifications.**
  - The Desktop switches and what each one does (summarised, with the full table in GUIDE).
  - Clicking a message or a bubble opens its app, including web apps.
  - What stays with the shell: critical alerts, codes, fullscreen.
- **Agents and approvals.** Agent alerts from Claude Code, Codex and agy (hooks), approval cards, and saying "yes",
  "no" or "always".
- **More machines: the fleet board.** `services.nixi.companion.peers` and `peerTokenFile`, tailnet addresses only.
- **Plugins.** `services.nixi.companion.plugins` with the example `party-hat-plus`, plus where folder plugins live, and
  that they don't update with a deploy.
- **A long command finished.** `commandDone.enable` and `.seconds`.
- **Your day.** Weather, calendar, nudges, quiet in meetings: a short tour, with the full detail in GUIDE.

### GUIDE.md: the reference, brought up to date

- Fix the "Nixi mode" box: plug-ins do load, when built by Nix.
- New sections: messages and notifications (with the Desktop table moved from nixi-nixarchy), characters and their
  voices, ElevenLabs, fleet board, plugins, and the companion's Nix options.
- A **settings reference** table: each `config.json` key a user may set, with its default and one line. The keys are
  taken from `DEFAULTS` (`app/server.py:119`), not from memory. Internal keys stay out.
- A **commands** table taken from `bin/nixi-companion`'s `case` lists: `show`, `hide`, `toggle`, `listen`, `restart`,
  `doctor`, `log` and the others users run. Internal ones (`server`, `render`, `stress`) are named as internal or left
  out.
- Keep the existing sections, corrected wherever they're wrong at the documented commit.

### A check that keeps names honest

New `tests/test_docs_names.py` in nixoarchy-snowflake:

- Every `config.json` key that the three docs show in backticks as a setting (a fixed pattern, such as a row in the
  settings table) is in `DEFAULTS`.
- Every `nixi-companion <word>` command in the docs is in the launcher's `case` lists.
- Every relative link in the three files points at a file that exists.

**This is an exception to the approved intent**, which says "no code". It's one test file and changes no app code,
default or option, but it is code. **Approving this spec approves that exception.** Without it, the names are checked
by hand only, at the time of writing. It fails when a later rename leaves the docs behind.

The test catches renames, not wrong labels, defaults, options or install order. Those are covered by the **review
checklist** in the PR, which is filled in by hand against the documented commit:
- each UI label and path (tab, button, switch) seen in the running UI;
- each default compared with `DEFAULTS`;
- each Nix option evaluated in a test Home Manager config (`nix eval` of the documented snippet, on the host);
- the install order followed in the runtime test.

### Images

Three stills, taken by the existing headless-Chromium test harness (`tests/_browser.py`, `--disable-gpu`) from a test
server under `tests/nixi_env.py`:

- him on a plain background;
- Settings, Voice;
- a message bubble.

They're saved as PNGs in `docs/media/`, at most about 150 KB each. No GIF, because the UI is still changing (#206).

## Alternatives rejected

- **Everything in one long README.** A first-time reader stops at the first wall of options. The README stays a path,
  and the choices go in GETTING-STARTED.
- **Keeping the companion docs in nixi-nixarchy's README.** That's two places to keep right, and that README is about
  the card.
- **A docs site (mdBook or similar).** It's a build and a deploy for three pages. Markdown on GitHub renders fine.
- **Generating the settings table at build time.** It's code for a table that changes a few times a month. The test
  catches drift instead.
- **A recording (GIF) of onboarding.** It goes out of date with every look change in #206.

## Risks

- **The VM can't prove "he answered me".** No agent is signed in there, and `nix run` has no bridge (companion
  README). Signing a real account in to a throwaway VM isn't worth the risk. So the VM proves install, switch, first
  start, the settings and plugins, and that typing reaches the bridge (and he says no agent is signed in, the way the
  README's "If not" says). The answer itself is proven on p620.
- **The VM may not be able to switch Home Manager** (a flake input and a switch inside a microVM guest). If it can't,
  steps 1 to 3 are checked on the host by building a test Home Manager config with the documented snippet, and the
  PR says so. In that case first start runs with the built package's `nixi-companion` in the VM.
- **Docs written against main go stale on the next merge.** The names test catches renames, but not changed behaviour.
  GETTING-STARTED avoids details GUIDE already holds.
- **Placeholder secrets that look real** could be copied verbatim. They use obvious names (`secrets/elevenlabs.age`,
  `<your key>`).
- **No host is touched.** Nothing is deployed, so there's no host risk.

## Verification

- `cd tests && python3 -B -m unittest test_docs_names` passes on the docs branch. It fails with a key renamed in a scratch
  copy, which shows the test can fail.
- **VM run** (`nixarchy-desktop` microVM, through the ai-mirror skill): the README's steps 0 to 4, step 5 up to the
  bridge, and the plugins section, followed as written. Each step's "You should see" is compared with what was seen.
  Failures and fixes are listed in the PR.
- **p620 checklist for the user**, also in the PR: step 5 with a real answer, steps 6 to 10, ElevenLabs, a message
  click, and the fleet board. Each is ticked or reported.
- The review checklist above, filled in, in the PR.
- Every command in a fenced block is run once, in the VM or on p620, or marked in the PR as not run, with the reason.
- Rendered on GitHub (the PR's file view): the tables, alerts and images show.
