---
status: approved
issue: 22
intent: intent/2026-09-21-22-showcase-docs.md
---

# Spec: Show what Nixi is and how it works

## Decisions carried from the intent review

- Pages source is **`docs/` on `master`**, with the engineering documents
  already in `docs/` excluded from the site.
- **GIF in the README**, MP4 on the Pages sites.
- **Do not wait for #19–#21.** The docs describe the product as it is today.
- nixarchy scope (open question 4, not yet answered): proposed below as a
  **section in `docs/manual/ai.md`**, not a new page.

## Design

### Source material

Everything comes from the razer run of 2026-09-21 (nixi 0.10.0, Claude,
NixOS 26.11), kept in `~/Videos/nixi-demo-2026-09-21/`: 57 PNGs and the
10-minute, 75 MB screen recording `nixi-showcase.mp4` (1920x1080, 30 fps).

Every published frame is cropped to the card (`900x620+510+170` covers the
card at every size it reached, including the permission dialog). That crop
leaves out the bar and most of the wallpaper. More importantly, it can never
include the terminal from `26-tour-step.png` and `27-tour3.png`, which shows
razer's calendar, unread email subjects and tasks. Those two files, and any
frame recorded while that terminal was open, are not used at all. The
showcase recording started after it was closed.

### The user story (one story, three surfaces)

*Sam has just installed nixarchy and knows Arch, not NixOS.* Each scene is one
still with one or two sentences under it, and the recording shows them in
order:

| # | Scene | Still | What it proves |
| --- | --- | --- | --- |
| 1 | Open Nixi; typing searches before asking | `s02-search` | Menu entries, files and repos match as you type |
| 2 | "how do I install an app?" | `s03-answer` | The answer is nixarchy's (`apps.nix`, then `nixarchy apply`), not `pacman` |
| 3 | "what generation am I on, how full is my disk, when did I last update?" | `s05-sysinfo-full` | Guide reads the live machine; the numbers matched `readlink` and `df` |
| 4 | Guide asked to change something | `06-guide-refuses` | Guide explains and changes nothing |
| 5 | `/mechanic`, then "put btop on SUPER+ALT+T" | `s12-loop4` (the approval prompt) and `s14-done` | Every step asks first; the change is verified live |
| 6 | "undo it" | `s17-undone` | Mechanic restores its own backup and checks it |
| 7 | Built-ins that need no AI | `25-tour`, `29-learn-answer`, `30-calc` | `/tour`, `/learn` and the calculator |

The text states the current limitations plainly, where they show: "click
**Allow**" (#20), "a long command can be cut short in the prompt, so read the
agent's message above it" (#21), and no FAQ-row scene (#19), each linked to its
issue. Scene 5 also mentions that Mechanic asks before read-only lookups
too, because a reader will see several prompts in the recording.

### nixi repo

- **`README.md`**
  - Title `❄ Nixi` becomes `✨ Nixi`, and "The ❄ in the bar" becomes "The ✨
    in the bar". The bar glyph is Nerd Font U+F0674, which GitHub cannot
    render, so the emoji stands in for it.
  - `docs/media/nixi-demo.gif` goes directly under the tagline, linked to the
    Pages site.
  - A new section **"A first session"** after the intro and before *Install*,
    with the seven scenes above as small stills (`width="420"`) and captions.
    No other section changes.
- **`docs/_config.yml`** (new): no theme, and `exclude:` lists
  `architecture.md`, `FORK.md`, `model-verification.md`, `release.md`,
  `testing.md` and `reviews`, so that only the site is published. This
  follows nixarchy's own `_config.yml`, which excludes its developer docs the
  same way.
- **`docs/index.html`** (new): one self-contained static page with inline
  CSS, light and dark via `prefers-color-scheme`, and no JavaScript. It holds
  a hero with the MP4 (`<video controls muted loop playsinline
  poster=…>`), the seven scenes at full crop size, a short "Guide vs
  Mechanic" table taken from the README, and links to the README's Install
  and Options sections and to the three issues. It has no front matter, so
  Jekyll copies it as it is.
- **`docs/media/`** (new): `nixi-demo.gif` (README; ~720 px wide, 30–45 s,
  under 5 MB), `nixi-demo.mp4` (Pages; H.264, `+faststart`, under 8 MB),
  `nixi-demo-poster.png`, and the scene stills as PNG, quantised (`pngquant`
  if available, else `ffmpeg` palette), each under 250 KB.
- **`nix/package.nix`**: the source filter already drops `*.png` and `*.gif`,
  so media never reaches the package. It does not drop `*.mp4`. Change the
  filter to drop the whole `docs` directory (nothing under `docs/` is
  installed), so the package cannot grow because of the site.
- **Enable Pages** once the PR is on `master`:
  `gh api -X POST repos/olafkfreund/nixi-nixarchy/pages -f 'source[branch]=master' -f 'source[path]=/docs'`,
  which gives https://olafkfreund.github.io/nixi-nixarchy/. Approving this
  spec approves that settings change.

### nixarchy repo

- A new issue in nixarchy, and a branch from `origin/main` in the clean clone
  `/mnt/data/Source-home/GitHub/nixarchy`, not the other session's directory.
- **`docs/manual/ai.md`**: a new section **"Nixi, on SUPER + H"** after the
  opening paragraphs. It has the same GIF, three sentences on what Nixi is,
  the Guide/Mechanic distinction in two lines, and a link to the nixi site.
  The existing "If you installed Claude some other way" section, which
  already names Nixi's panel, links up to it.
- **`docs/img/features/nixi.gif`**: the same file as nixi's
  `docs/media/nixi-demo.gif`. `img/` is not excluded in `_config.yml`, and
  the other feature GIFs already live there.
- A section, not a page: #831 (in flight) adds a check that every page in
  `docs/manual/` appears in `nav`, `llms.txt`, `manual/index.md` and the
  README, and it is editing those same four lists. A new page would collide
  with it; a section in an existing page touches none of them. #831's diff
  does not touch `ai.md`.
- The nixarchy PR links this issue's intent, spec and plan rather than
  writing a second set, because the change there is one section that this
  spec already defines.

## Alternatives rejected

- **`gh-pages` branch**: rejected in the intent review.
- **A new `docs/manual/nixi.md` in nixarchy**: collides with #831's list
  checks and its edits to the same files, for no gain over a section.
- **Upload the MP4 through GitHub's UI for the README**: it produces a
  user-attachments URL that lives outside the repo and cannot be reviewed in
  a PR.
- **Re-record a clean take instead of editing this one**: the run is the
  verified evidence behind every claim. A new take would need re-verifying,
  and would still show #19–#21.
- **A Jekyll theme for nixi's site**: one page does not need a theme, and
  nixarchy chose not to use one for the same reason (its `_config.yml`
  explains why).

## Risks

- **Private data leaks through a frame.** Mitigated by the fixed crop, by not
  using the two tour-step PNGs, and by viewing every committed image and a
  frame every 2 s of both videos before committing.
- **Repo size:** at most about 15 MB added. `omarchy plugin add` clones the
  repo, so every plugin-manager user downloads it once. The Nix package is
  unaffected, given the filter change.
- **`omarchy plugin validate`** could reject media or an HTML file in the
  plugin tree. It is run in the Tests step. If it rejects them, `docs/`
  moves to `.omarchyignore` or the equivalent, and the plan records how.
- **The docs go stale when #19–#21 are fixed.** Each limitation note links
  its issue, so fixing an issue means deleting one sentence.
- **Pages exposes `docs/`** if the exclude list misses a file. Checked by
  listing the built site.

## Verification

- `nix build .#nixi` still succeeds, and `nix path-info -S` is unchanged or
  smaller.
- `node --test bridge/*.test.js`, `python3 tools/test_nixi.py`, and
  `omarchy plugin validate` on a clean copy (as `docs/testing.md` describes)
  all pass.
- Every relative link and image in `README.md` and `docs/index.html`
  resolves (a small `grep` plus `test -e` loop). The README renders through
  `gh api markdown` with every image path found.
- Sizes: GIF under 5 MB, MP4 under 8 MB, each still under 250 KB, all
  committed media under 15 MB.
- Privacy: each committed image viewed, and frames every 2 s of both videos
  viewed, with no terminal, calendar, mail or notification content.
- After merge and enabling Pages: the Pages build is `built`,
  https://olafkfreund.github.io/nixi-nixarchy/ returns 200, and `testing.md`
  on it returns 404.
- nixarchy: its site builds on the PR (its existing checks pass), and the
  section renders on the deployed `manual/ai` page after merge.
