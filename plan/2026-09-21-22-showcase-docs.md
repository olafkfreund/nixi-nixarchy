---
status: draft
issue: 22
spec: spec/2026-09-21-22-showcase-docs.md
---

# Plan: Show what Nixi is and how it works

## Approved decisions (from the intent and spec)

- One user story in seven scenes ("Sam", who knows Arch, not NixOS), told in
  the README, on a new nixi Pages site, and in a section of nixarchy's manual.
- All media comes from the razer run of 2026-09-21, kept in
  `~/Videos/nixi-demo-2026-09-21/` (`shots/*.png`, `nixi-showcase.mp4`,
  1920x1080 at 30 fps, 600 s). Every published frame is cropped to
  `900x620+510+170`. `26-tour-step.png` and `27-tour3.png` (calendar and
  mail) are never used.
- Known bugs are stated where they show, each linked: click **Allow**, not Y
  (#20); a long command can be cut short in the prompt (#21); no FAQ-row
  scene (#19). Mechanic also asks before read-only lookups.
- nixi site: `docs/` on `master`. `docs/_config.yml` excludes the engineering
  docs, `docs/index.html` is a static page with no JS, and media lives in
  `docs/media/`.
- README: `✨ Nixi`, the GIF under the tagline, and a new "A first session"
  section before *Install*. Nothing else changes.
- `nix/package.nix`: the source filter drops `docs/`.
- Pages is turned on after merge, from `master` `/docs`.
- nixarchy: a section "Nixi, on SUPER + H" in `docs/manual/ai.md`, plus
  `docs/img/features/nixi.gif`, on a branch from `origin/main` in
  `/mnt/data/Source-home/GitHub/nixarchy`, with a nixarchy issue. The PR links
  these artifacts. No new page, and no edits to `nav`, `llms.txt`,
  `manual/index.md` or README (they belong to #831).
- Size budget: GIF under 5 MB, MP4 under 8 MB, each still under 250 KB,
  everything added to the nixi repo under 15 MB.

## Steps

Media is built in `$CLAUDE_JOB_DIR/tmp/media/` and copied into the repo only
once it has passed its checks.

1. **Stills.** Crop each scene PNG to `900x620+510+170` with ffmpeg, quantise
   it (`pngquant --quality 70-90` via `nix run nixpkgs#pngquant`, falling back
   to an ffmpeg palette), and name it by scene:

   | file | source |
   | --- | --- |
   | `01-search.png` | `s02-search.png` |
   | `02-answer.png` | `s03-answer.png` |
   | `03-your-machine.png` | `s05-sysinfo-full.png` |
   | `04-guide-changes-nothing.png` | `06-guide-refuses.png` |
   | `05-mechanic-asks.png` | `s12-loop4.png` |
   | `06-mechanic-done.png` | `s14-done.png` |
   | `07-undo.png` | `s17-undone.png` |
   | `08-tour.png` | `25-tour.png` |
   | `09-learn.png` | `29-learn-answer.png` |
   | `10-calculator.png` | `30-calc.png` |

   → verify: view each of the 10 files; each is under 250 KB and shows only
   the card on wallpaper.

2. **MP4 edit (about 80 s).** Crop the recording to `900x620+510+170`, then
   `trim` and `setpts` these segments of the source and `concat` them. H.264,
   CRF 28, `yuv420p`, `+faststart`, 30 fps, no audio:

   | source | speed | shows |
   | --- | --- | --- |
   | 0:00–0:28 | 2x | open, typing `install` (search rows), the question |
   | 0:28–0:40 | 1x | the install answer streaming, then holding |
   | 0:50–2:06 | 8x | system-info question and answer |
   | 2:06–2:09 | 1x | hold on the full answer |
   | 2:09–2:20 | 2x | `/mechanic`, typing the request |
   | 2:20–5:25 | 30x | the read-only permission prompts |
   | 5:25–5:31 | 1x | hold on the write prompt |
   | 5:31–7:50 | 12x | allowed; agent writes and verifies |
   | 7:50–7:55 | 1x | hold on the result |
   | 7:55–9:45 | 12x | "undo it", its prompts, the restore |
   | 9:45–9:52 | 1x | hold on "back the way it was" |

   Poster = the frame at 7:52, saved as `nixi-demo-poster.png`.
   → verify: duration 70–95 s, size under 8 MB. Tile one frame every 2 s into
   contact sheets and view them all: only the card, no terminal, calendar,
   mail or notification.

3. **GIF (30–45 s).** A shorter cut from the same crop: 0:00–0:40 at 2x,
   2:09–2:20 at 2x, 5:25–5:29 at 1x, 5:31–7:50 at 12x, 7:50–7:54 at 1x,
   7:55–9:45 at 12x, 9:45–9:49 at 1x. Scale to 720 px wide, 10 fps,
   `palettegen=stats_mode=diff` and `paletteuse=dither=bayer:bayer_scale=5`,
   looping. If it exceeds 5 MB, first drop to 8 fps, then to 640 px.
   → verify: size under 5 MB. View the contact sheet as in step 2.

4. **Copy media into the repo:** `docs/media/` receives the ten stills,
   `nixi-demo.mp4`, `nixi-demo-poster.png` and `nixi-demo.gif`.
   → verify: `du -sh docs/media` is under 15 MB.

5. **`docs/_config.yml`:** no theme, a title and description, and `exclude:`
   `architecture.md`, `FORK.md`, `model-verification.md`, `release.md`,
   `testing.md`, `reviews`.
   → verify: file reviewed. The Pages build is checked in step 12.

6. **`docs/index.html`:** a static page with inline CSS and light/dark via
   `prefers-color-scheme`. It holds the hero (title, tagline, `<video controls
   muted loop playsinline poster="media/nixi-demo-poster.png">`), "Sam's
   first session" (scenes 1–7, stills 01–07 with the captions from the
   spec, including the #20 and #21 notes), "No AI needed" (08–10), a Guide vs
   Mechanic table taken from the README, and links to the README's Install
   and Options sections, the repo, nixarchy, and #19–#21. All links are
   relative or absolute GitHub URLs, and it has no front matter.
   → verify: every `src`/`href` into `media/` exists (grep plus `test -e`);
   `python3 -m html.parser` style parse finds no errors; the page is opened
   locally and viewed.

7. **`README.md`:**
   - Line 1 `❄ Nixi` becomes `✨ Nixi`. In the "Open it" row, "The ❄ in the
     bar" becomes "The ✨ in the bar".
   - Under the tagline: `<p align="center"><a
     href="https://olafkfreund.github.io/nixi-nixarchy/"><img
     src="docs/media/nixi-demo.gif" alt="…" width="720"></a></p>`.
   - After the Archy note, before `## Install`: a new `## A first session`
     section with the seven scenes (stills 01–07 at `width="420"`, one to
     two sentences each), a line on the built-ins with 08–10, and a link to
     the site.
   → verify: `grep -c '❄' README.md` is 0; every `docs/media/` path in the
   README exists; `gh api markdown -f text=@README.md` renders without
   error; `git diff README.md` touches only those three places.

8. **`nix/package.nix`:** add `|| base == "docs"` to the filter in
   `cleanSourceWith` (line 72).
   → verify: `nix build .#nixi` succeeds and `nix path-info -S ./result`
   is no larger than before (measured before the change).

9. **Repo checks:** `node --check bridge/bridge.js`,
   `node --test bridge/*.test.js`, `python3 tools/test_nixi.py`,
   `git diff --check`, and `omarchy plugin validate` on a clean `rsync` copy
   (as in `docs/testing.md`).
   → verify: all pass. If `plugin validate` rejects `docs/` content, stop.
   Record here how it is excluded (an ignore file, or a validate-time
   exclude) and do that in the same commit.

10. **Commit and PR (nixi).** One commit, `docs: show what Nixi is and how
    it works (#22)`, on `docs/22-showcase-docs`. Open a PR to `master` that
    links the intent, spec and plan, and embeds the GIF.
    → verify: CI on the PR is green.

11. **nixarchy.** Open an issue ("Show Nixi in the manual"). On a new branch
    `docs/<n>-nixi-in-ai-manual` from `origin/main` in
    `/mnt/data/Source-home/GitHub/nixarchy`:
    - `docs/img/features/nixi.gif`, the same bytes as nixi's
      `docs/media/nixi-demo.gif`.
    - `docs/manual/ai.md`: after the opening paragraph, a section
      `## Nixi, on SUPER + H` with the GIF, what Nixi is (three sentences),
      Guide vs Mechanic (two lines), and a link to
      https://olafkfreund.github.io/nixi-nixarchy/. The existing sentence
      "Nixi's panel — the one `SUPER + H` opens —" links to the new
      section's anchor.
    - PR linking nixi #22's intent, spec and plan.
    → verify: `git diff --stat origin/main` shows exactly those two files;
    the repo's own checks pass on the PR (including the docs link checker if
    it has one).

12. **After merge (nixi): enable Pages.**
    `gh api -X POST repos/olafkfreund/nixi-nixarchy/pages -f 'source[branch]=master' -f 'source[path]=/docs'`
    → verify: `gh api repos/olafkfreund/nixi-nixarchy/pages` reports
    `status: built`; `curl -sI https://olafkfreund.github.io/nixi-nixarchy/`
    returns 200; `…/media/nixi-demo.mp4` returns 200; `…/testing.html` and
    `…/testing.md` return 404.

## Tests

| check | expected |
| --- | --- |
| `nix build .#nixi` | succeeds; closure no larger |
| `node --test bridge/*.test.js` | 41/41 pass |
| `python3 tools/test_nixi.py` | "all checks passed" |
| `omarchy plugin validate <clean copy>` | passes |
| media sizes | GIF < 5 MB, MP4 < 8 MB, stills < 250 KB, `docs/media` < 15 MB |
| privacy review | every still and every 2 s of both videos viewed: card only |
| links | every README and `index.html` media path exists |
| Pages (after merge) | 200 for the site and MP4; 404 for `testing.md` |

## Rollback

- Before merge: close the PRs; nothing else has changed.
- After merge: `git revert` the docs commit (media, README, `_config.yml`,
  `index.html`, the `package.nix` filter line). Turn Pages off with
  `gh api -X DELETE repos/olafkfreund/nixi-nixarchy/pages`. In nixarchy,
  revert the one commit. No user machine is affected either way: the Nix
  package does not contain `docs/`.
