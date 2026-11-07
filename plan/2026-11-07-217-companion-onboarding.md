---
status: draft
issue: 217
spec: spec/2026-11-07-217-companion-onboarding.md
coders:
  1: codex   # small, tricky: a test that parses three docs and the launcher, and must be able to fail
  2: coder   # the README onboarding: careful prose checked against code
  3: coder   # GETTING-STARTED, same writer as step 2 so the voice and facts match
  4: agy     # GUIDE.md: large, mostly mechanical (settings table from DEFAULTS, commands from the launcher, moved table)
  5: coder   # nixi-nixarchy README: cut the companion section to a link
reviewers:
  - codex    # checks the docs' facts against the code
  - agy      # a second read for gaps a new user would hit; its citations are verified before use
---

# Plan: Companion docs: an onboarding README and a getting-started guide

## Decisions carried over from the approved spec

- **Three files.**
  - `README.md` is the onboarding, about 200 lines.
  - `docs/GETTING-STARTED.md` is new: the first day, with each choice explained, about 350 lines.
  - `docs/GUIDE.md` is the reference, about 450 lines.
  - nixi-nixarchy's companion section (`README.md:89-189`) becomes three lines and a link. Its Desktop table,
    `commandDone` and notification-privacy text move to GUIDE.
- **README onboarding.** Steps 0 to 10, each with **Do** (a fenced block), **You should see**, and **If not**:
  - 0 is nixi first, off nixarchy;
  - 1 is the flake input;
  - 2 is enable plus package;
  - 3 is the switch, checked with `command -v nixi-companion`;
  - 4 is the first start, start at login and a key (the module does neither);
  - 5 is typing to him;
  - 6 is the mic: settings, **Voice** tab, **Microphone**, and `nixi-companion doctor`;
  - 7 is "hey Nixi" (`wake_word`);
  - 8 is his voice: `tts` `auto` is Kokoro, then piper, then espeak, and ElevenLabs is optional;
  - 9 is messages through him: the **Nixi card's** Settings → Desktop, first two switches, needing the shell's
    notification patch;
  - 10 is trust, then `nixi-companion restart` (#146).

  Then "What stays on your machine, and what doesn't", Next, Need help, Working on it, and the credits.
- **Privacy wording.**
  - Local: speech-to-text, the local voices, notification text.
  - Leaves the machine: what you ask goes to the agent's provider, and the text he speaks goes to ElevenLabs when
    it's on.
- **ElevenLabs key.**
  - A file under `/run/agenix`, `/run/agenix.d` or `/run/secrets`, owned by root or the user, readable by the user,
    16 to 128 characters of `[A-Za-z0-9_-]`.
  - The default is `/run/agenix/api-elevenlabs`, and `eleven_key_file` changes it.
  - The examples set the secret's `owner`, or `mode = "0440"` with the group.
  - `$CREDENTIALS_DIRECTORY` isn't documented.
- **Nothing planned is shown as done.**
  - The echo canceller option (#216) is documented only if #216 step 5 is merged before this PR. Otherwise the docs
    say "an echo-cancelled source, if you have one".
  - #208 to #214 aren't mentioned as features.
- **The names test**, the approved exception: `tests/test_docs_names.py`. Settings named in the settings table are in
  `DEFAULTS`, `nixi-companion <word>` commands are in the launcher's `case` lists, and relative links exist.
- **The review checklist in the PR covers what the test can't.** Each UI label is seen in the UI, each default is
  checked against `DEFAULTS`, each Nix snippet is evaluated, and the install order is followed.
- **Images.** Three PNGs of about 150 KB or less in `docs/media/`, taken with headless Chromium `--disable-gpu`
  through `tests/_browser.py`: him, Settings → Voice, a message bubble. No GIF.
- **Proof.**
  - The VM (`nixarchy-desktop`) runs steps 0 to 4, step 5 up to the bridge, and plugins.
  - p620, by the user: step 5 with an answer, steps 6 to 10, ElevenLabs, a message click, the fleet board.
  - If the VM can't switch Home Manager, steps 1 to 3 are checked by building a test Home Manager config on the
    host, and the PR says so.

## Where the work happens

- Steps 1 to 4: `olafkfreund/nixoarchy-snowflake`, worktree `/mnt/code/Source-home/GitHub/nixi-217-docs` on
  `docs/217-onboarding` from `origin/main`.
- Step 5 and these artifacts: `olafkfreund/nixi-nixarchy`, worktree `/mnt/code/Source-home/GitHub/nixi-217`, branch
  `docs/217-companion-onboarding`.

Traps for every step:

- **Every fact is checked in the code at the documented commit**, never from memory or old docs. The sources:
  - settings: `app/server.py` `DEFAULTS` (`:119`);
  - commands: `bin/nixi-companion`'s `case` lists (`:118-147`);
  - Nix options: nixi-nixarchy `nix/hm-module.nix` (`:118-217`);
  - UI labels: `app/static/index.html` (the tabs are Look, Voice, Brain, Plugins and More);
  - ElevenLabs: `app/eleven.py:36-60`.
- No real hosts, tailnet addresses, user names, folders or accounts. Use placeholders such as `<your-user>`,
  `100.x.y.z` and `secrets/elevenlabs.age`.
- Copyable commands go in fenced blocks with a language tag.
- The house style: plain words, short sentences, the README's centred logo and links row, GitHub alerts where they
  help.
- No change to app code, defaults or options. A gap found while writing becomes a note in the step's report, and I
  open an issue for it.

## Steps

1. **`tests/test_docs_names.py`** (codex). It reads `README.md`, `docs/GETTING-STARTED.md` and `docs/GUIDE.md`, and
   skips a file that doesn't exist yet. It checks three things:
   - (a) In the GUIDE settings-reference table, the first column's backticked key is in `DEFAULTS`. Import the dict
     the way other tests import server, under `tests/nixi_env.py`.
   - (b) Every `nixi-companion <word>` in a fenced block or in backticks has `<word>` in the launcher's `case`
     patterns. Parse `bin/nixi-companion`.
   - (c) Every relative markdown link target exists.

   Check: the test passes on main's current docs. With a scratch copy (a temp file, never the real docs) holding a
   wrong key, an unknown command and a broken link, each of the three checks fails.

   ```bash
   cd tests && python3 -B -m unittest test_docs_names
   ```

2. **`README.md`** (coder): rewritten to the structure above. Keep the header and the "Working on it" section as they
   are.
   - Step 4's start-at-login examples: nixarchy's lua (`o.exec_on_start("nixi-companion show")` and `o.bind(...)`, in a
     file loaded from `bindings.lua`), and plain Hyprland (`exec-once = nixi-companion show`, `bind = ...`).
   - Each "If not" names the likely cause and the fix in one or two lines.

   Check: run step 1's test, and every link resolves.

   ```bash
   cd tests && python3 -B -m unittest test_docs_names
   ```

3. **`docs/GETTING-STARTED.md`** (coder, the same agent as step 2). The sections are in the spec's order: speakers or
   headphones, character and voice, ElevenLabs, messages and notifications, agents and approvals, the fleet board,
   plugins, a long command finished, your day.
   - The ElevenLabs part has an agenix example and a sops-nix example, both with placeholders.
   - The fleet board has `peers` and `peerTokenFile`, with tailnet addresses only.
   - Plugins has `services.nixi.companion.plugins` with `party-hat-plus`, and that folder plugins don't update with a
     deploy.

   Check: step 1's test.

4. **`docs/GUIDE.md`** (agy).
   - Fix the "Nixi mode" box: plug-ins load when built by Nix (`services.nixi.companion.plugins`).
   - Add the sections: messages and notifications, with the Desktop table moved verbatim from nixi-nixarchy
     "On the desktop" table (`README.md:124-142`) and checked; characters and their voices; ElevenLabs; the fleet board; plugins; the
     companion's Nix options (every option under `services.nixi.companion` in `hm-module.nix`, with its default); and
     `commandDone`.
   - A settings reference table, with columns key, default and what it does. Only user-facing keys from `DEFAULTS`,
     and the default copied from the code.
   - A commands table from the launcher. Internal ones (`server`, `render`, `stress`, `theme-changed`) are listed as
     internal.
   - Existing sections are corrected where they're wrong.

   Check: step 1's test, and a diff read by me against `DEFAULTS` and the launcher.

   Traps: agy's quotes are often invented, so every value it writes is checked against the source line before commit.

5. **nixi-nixarchy `README.md:89-189`** (coder): replace it with three lines: what the companion is, the two-option
   snippet (input, plus `enable` and `package`), and "Set-up, settings and troubleshooting: the companion's README".
   Keep the `commandDone` Nix option visible as one line and a link.

   Check: `grep -n "nixoarchy-snowflake" README.md` shows the link. Nothing else in the file changes (`git diff
   --stat`).

6. **Images, proof, PRs.** These stay with me.
   - Take the three stills with headless Chromium `--disable-gpu`, from a `tests/nixi_env.py` server.
   - Run the VM through the ai-mirror skill, recording each step's result.
   - Fill in the review checklist and the user's p620 checklist in the PR.
   - Reviews: `codex review --base origin/main`, agy on the diff, and a fresh `code-reviewer` (opus) with only this
     plan and the diff.
   - Two PRs, each with `@codex review`. CI green, then merge.
   - Nothing is deployed: docs only.

## Tests

```bash
cd tests && python3 -B -m unittest test_docs_names
```

Expected: it passes on the branch, and fails on the scratch copy for each broken case. The full suite isn't needed,
because no app code changes, but `test_docs_names` runs in CI with the rest.

## Rollback

Revert the docs PRs. Nothing else depends on them.
