---
status: approved
issue: 196
spec: spec/2026-11-05-196-settings-over-board.md
coders:
  1: codex   # small, tricky logic in one file; step 2's tests are its real check, so both commit together
  2: coder   # page tests that have to run in headless Chromium
reviewers:
  - codex    # caught the ordering bug in the spec
  - agy      # traced the cause; its last two runs ended in ERROR, so a repeat is reported as such
---

# Plan: Settings opened over a board stays next to Nixi

## Approved decisions

- While a panel is open (`body.pnl`), a board asks for no room. Its state is kept and it returns when
  the panel closes.
- The tab and `#chalk` are hidden too.
- A new board during a panel is held, newest wins, no caption text. It's replayed through `onEvent` as
  the very last thing `panelSize` does on closing, after `sendRegion(true)` has cleared `body.calm`.
- If he can't show a board at that moment, today's rule for a board arriving then applies.
- A board the server closes during a panel also drops any held one.
- Board timers restart while a panel is open.
- Not promised: the fast right-click and gear click, which is only re-tested.

## Steps

Work is on `fix/196-settings-over-board` from `olafkfreund/nixoarchy-snowflake` main, in worktree
`../nixoarchy-snowflake-196`. Merge main first: another session is merging #178 and #188 in the same file.

1. `app/static/index.html`. Lines are from main `a263fed`; search by name if they've moved: CSS 367, `let stgPosted` 2360,
   `sizeWindow` 3725, `stageShow` 2581, `panelSize` 2877, `stageClosedByServer` 2621, `stageTick` 2606.
   - **CSS:** add `body.calm #stgTab,body.calm #chalk` to the rule with `body.calm #stg`.
   - **`let stgPosted=…`:** add `stgHeld=null`.
   - **`sizeWindow`:** with `document.body.classList.contains('pnl')`, leave out `stageWant` and `popWant`.
   - **`stageShow`, first line:** `if(document.body.classList.contains('pnl')){ stgHeld=ev; return; }`, before
     `stgPosted=false; gaugeStop();`.
   - **`panelSize`, last line, after `sendRegion(true)`:**
     `if(!sOn&&!pOn&&stgHeld){ const e=stgHeld; stgHeld=null; onEvent(e); }`. `onEvent` is the top-level event
     handler (2154), not the local `handle` inside `send()`.
   - **`stageClosedByServer`:** set `stgHeld=null` first, whatever the state.
   - **`stageTick`, first line after `now`:** with `body.pnl`, `stgUse=stgQuiet=now; return;`.
   → Nothing is committed on this step alone. It's verified by step 2's tests, which the coder of step 2 runs, and
   steps 1 and 2 commit together only when they pass. Codex reports its diff.
   Traps: Codex's sandbox can't run Chromium. No GPU browser for Nixi pages. Nothing outside this file. Don't commit.

2. `tests/settings_fit.mjs`:
   - update case `6g`'s open assertion from `size:300,266` to `size:244,266`, with its comment and failure message;
     keep its close assertion;
   - add the spec's page cases: open board then Settings; tab then Settings; `stgSize(0)` during Settings; a `stage`
     event during Settings (no caption, old board untouched, shown on close); two events, newest wins; `stage_close`
     clears; `stageTick` with an old `stgUse`; the history panel and Settings-to-panel; a held board closing in hover
     and with `hiddenNow`; hover turned on inside Settings.
   → `cd tests && python3 -m unittest test_settings_fit test_stages_fit`, and each new case fails with its line of
   step 1 removed, tried one at a time and then restored.
   Traps: `check` is `check(cond, message, detail)`, and a string first always passes. The situation logic resets
   `sitOn`. Headless with `--disable-gpu` only. Never import `server` outside `tests/test_speakable._ServerEnv`. The
   machine can be busy: rerun a page timeout alone before calling it a failure, and capture which test failed.

3. Merge, deploy and live check, by the lead with the user.
   - PR with `@codex review`; Opus, Codex and agy review the diff read-only.
   - Full suite on the branch; bump `nixi-companion`; check the bus and tell the other session first.
   - `AGENT_BUS_ANNOUNCED=1 nh os switch .` from a clean worktree, not `just deploy`; for razer use the Justfile's
     `nixos-rebuild switch --flake .#razer --target-host razer --build-host razer --sudo --no-reexec --keep-going`, because `nh` can't
     read sudo without a terminal.
   - `export $(systemctl --user show-environment | grep ^HYPRLAND_INSTANCE_SIGNATURE=); nixi-companion restart`.
   - Live on p620: the spec's list. Close #196 if the fast click no longer fails; if it does, give it its own issue and close #196.

## Tests

```bash
cd tests && python3 -m unittest test_settings_fit test_stages_fit test_accessories_fit
cd tests && python3 -m unittest discover -s .
```

Expected: OK, with `~/.config/nixi-companion/config.json`'s timestamp unchanged by the run.

## Rollback

Revert the merge commit and bump again. There's no stored state: `stgHeld` lives only in the page.
