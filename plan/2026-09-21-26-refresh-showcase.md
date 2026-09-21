---
status: approved
issue: 26
spec: spec/2026-09-21-26-refresh-showcase.md
---

# Plan: Refresh the showcase once the fixes ship

## Approved decisions

- **A full refresh:**
  - scene 2 answered with the package manager panel;
  - scene 5 with the whole command in the prompt, answered with **Y**;
  - a new "Written answers" still (a FAQ row answered, #19);
  - the #19, #20 and #21 notes removed; #27's read-only note kept.
- **Starts only after #19, #20 and #21 are merged** into nixi `master`.
- **The nixarchy pin bump is part of this task**, as a lock bump in
  `/mnt/data/Source-home/GitHub/nixarchy` from `origin/main`. `nix flake
  update nixi` onto nixi `master`, the pin paragraph in `flake.nix`
  rewritten, and merged when CI is green. `nixos_config` and razer's rebuild
  are **yours**, and named in that PR as the next step.
- **The recording uses the reversible swap, not a rebuild.** Seven Home
  Manager symlinks are pointed at a nixi `master` build copied into razer's
  store, then pointed back and checked with `readlink`:
  - the plugin directory;
  - `~/.config/nixi/{AGENTS,CLAUDE,KNOWLEDGE,SKILL}.md` and `faq.json`;
  - `~/.claude/skills/nixi/SKILL.md`.
- **Same method and limits as #22:**
  - crop `900x620+510+170`, card only, never the terminal with calendar or
    mail;
  - every still and every 2 s of video reviewed;
  - GIF < 5 MB, MP4 < 8 MB, stills < 250 KB.

## Steps

1. **Gate.** Check with `gh pr view` that #19, #20 and #21 are `MERGED`.
   Rebase this branch on `master`.
   → verify: all three merged; the rebase is clean.
2. **nixarchy pin bump.**
   1. Branch `chore/<n>-bump-nixi` from `origin/main`, with a nixarchy issue.
   2. `nix flake update nixi`.
   3. Rewrite the pin paragraph for the new commit, listing #18, #19, #20,
      #21, #23 and #24.
   4. Open a PR and wait for CI.

   → verify: the `nixi` lock node equals nixi `master`'s head; CI green;
   merged.
3. **Build and copy.** `nix build .#nixi` on nixi `master`, then `nix copy
   --to ssh://razer`. Also build the Home Manager `share/` files: they come
   from the same package's `share/nixi/`, which holds CLAUDE, KNOWLEDGE,
   AGENTS, faq and the skill.
   → verify: every source path the swap needs exists on razer
   (`ssh razer test -e`).
4. **Swap.** Save the current `readlink` of all seven links to
   `/tmp/nixi26-links.txt` on razer, point each at its counterpart in the
   new build, and run `omarchy-restart-shell`. Ask for control through
   ai-mirror.
   → verify: `readlink` shows the new targets; the card opens.
5. **Record.** `gpu-screen-recorder -w eDP-1 -f 30`, capped at 10 minutes,
   running:
   1. (scene 2) open the card and ask "how do I install an app?" in Guide;
   2. (new still) type `install` and choose **Install an app**;
   3. (scene 5) `/mechanic`, then "put btop on SUPER+ALT+T"; answer the
      read-only prompts with **Y**; screenshot the write prompt with the
      whole command, then **Allow** it; screenshot the result;
   4. "undo it", allowing with Y;
   5. `/guide`.

   Take full-resolution screenshots at each of those points.
   → verify: `bindings.lua` is identical to a backup taken first (the undo
   worked).
6. **Put razer back.** Restore all seven links from
   `/tmp/nixi26-links.txt`, run `omarchy-restart-shell`, release control,
   and delete the temporary files and the recording on razer.
   → verify: all seven `readlink`s match the saved list; trust is `guide`.
7. **Media.** The same pipeline as #22:
   1. Crop and quantise `02-answer.png`, `05-mechanic-asks.png` and the new
      `11-faq.png`.
   2. Re-cut the MP4 and GIF with `cut.py`-style segments. The timestamps
      come from a contact sheet of the new recording, holding each answer
      still at 1x and speeding up the waits.
   3. Make contact sheets of both, and view them.

   → verify: sizes within budget; every frame shows only the card.
8. **Docs.**
   - `README.md` and `docs/index.html`: scene 2's caption leads with the
     package manager panel; scene 5's says Y/Allow and that the whole
     command is shown; a FAQ entry is added (README: the built-ins line;
     site: a fourth figure under "No AI needed", with the grid going to 4
     columns on wide screens).
   - The #19, #20 and #21 notes are removed; #27's is kept.

   → verify: `grep -c "issues/19\|issues/20\|issues/21"` over both files is
   0; every media path resolves; the page renders in light, dark and at
   390 px.
9. **nixi PR**: `docs: refresh the showcase for the #19–#21 fixes (#26)`,
   with the template, the artifacts and the new GIF.
   → verify: CI green; merged.
10. **nixarchy**: a PR copying the new GIF over `docs/img/features/nixi.gif`
    (the same bytes).
    → verify: CI green; merged; the site serves the new file (by its size).
11. **Live check**: the nixi site and nixarchy's `manual/ai` serve the new
    media.
    → verify: 200s, and the byte sizes match the committed files.

## Tests

| check | expected |
| --- | --- |
| gate | #19, #20, #21 merged |
| nixarchy bump | lock at nixi `master`; CI green |
| razer | 7 links restored; `bindings.lua` unchanged; trust `guide` |
| media | within budget; every frame card-only |
| docs | no #19/#20/#21 notes; all paths resolve |

## Rollback

- Docs: revert the nixi and nixarchy commits.
- The pin: revert the nixarchy bump commit.
- razer: nothing persists. The links are restored in step 6, and Home
  Manager restores them on the next switch in any case.
