---
status: approved
issue: 133
spec: spec/2026-10-30-133-proactive-companion.md
previous: plan/2026-10-30-133-proactive-companion-b.md
---

# Plan: Proactive companion — phase (c)

Phase (c) of the approved intent covers rows 11 to 16 of its table, plus spec
§7:
- the fun looks
- the "long command finished" shell hook
- local quips

It builds on phases (a) and (b), which have merged (snowflake #9 and #10;
nixarchy #1523; nixi #134 and #135).

## Approved decisions this plan carries

- **Everything is off by default and behind `proactive`.** New keys:
  `look_coding`, `look_night`, `look_weather`, `look_party`, `react_quips`.
  The shell hook is a Home Manager option, off by default.
- **Window class only, never a title.** `Desk` turns the class into a single
  boolean, `coding`, against a fixed allow-list. The class string is never
  stored.
- **Top-zone looks (nightcap, party hat, umbrella) show only when no skin is
  worn.** Skins own the top of his head (spec §5). Glasses take the eye zone,
  and shades (fullscreen) win over them.
- **Priority per zone:**
  - eyes: fullscreen shades > coding glasses
  - top: party hat > umbrella > nightcap
- **No new network calls.** Weather comes from the existing opt-in
  `ambient_weather` source. The party hat comes from the existing opt-in
  `gog` calendar fetch, plus fixed dates.
- **Quips are local, in `app/quips.json`, editable without code.** A quip never
  repeats until its list is used up. No model calls. Quips that come with looks
  are visual nudges through `Nudge`, so the phase (b) budget, breakpoints and
  meeting silence apply. They are never spoken.
- **The command-done hook sends only the command's first word and its
  duration.** It fires only when the command took 30 s or more and its terminal
  is not focused. It arrives as an ordinary notification
  (`notify-send -a nixi-job`), so the shell, the takeover and give-back all
  apply unchanged.

## Repositories and branches

| Repo | Branch from | Branch |
|---|---|---|
| snowflake (`~/Source/GitHub/nixoarchy-snowflake-133c`, a new worktree) | `origin/main` | `feat/133-proactive-c` |
| nixi (this repo) | `master` | `feat/133-proactive-c` |

No nixarchy change.

## Steps

### Snowflake

1. **`Desk.coding`** (`app/server.py`, `class Desk`)
   - `on_event`, for `activewindow>>CLASS,TITLE`:
     - Take only `CLASS`, by splitting once on `,`, lower-cased.
     - Set `coding_now = cls in CODERS`. Keep `coding_since`, the monotonic time
       a coder window took focus (0 when not coding). Drop the class right
       away.
   - `CODERS = {"kitty", "foot", "alacritty", "ghostty",
     "com.mitchellh.ghostty", "org.wezfurlong.wezterm", "code", "code-oss",
     "codium", "vscodium", "dev.zed.zed", "zed", "neovide", "emacs",
     "jetbrains-idea", "jetbrains-pycharm", "jetbrains-goland"}`, plus any
     class that starts with `jetbrains-`.
   - `Ambient.situation()` adds `coding`, which is true once `coding_since` is
     60 s old and `proactive` is on.
   - Test (`tests/test_desk.py`): an `activewindow>>kitty,SECRET` stream gives
     `coding` after 60 s on a fake clock, and `SECRET`/`kitty` never appear in
     `vars(Desk)`.

   Trap: `activewindow` already re-asks `j/activewindow` for fullscreen (phase b
   review fix). Do not add a second request.

2. **Weather condition, night, party** (`app/server.py`, `Ambient`)
   - When `ambient_weather` is on, the existing weather fetch also runs
     `omarchy weather icon` (same TTL).
   - Map the glyph:
     - `rain`: U+E318, U+E333, U+E308, U+E3AD, U+E31D
     - `snow`: U+E327, U+E30A, U+E31A
     - anything else: none

     The source is `omarchy-weather-icon`'s case table: wttr.in codes, rain
     176/263/353/266…/200…, snow 179/227/230/323/326/368/329….
   - `night`: local hour ≥ 23 or < 5, the same window as the page's
     `nightTime`.
   - `party`: today is Jan 1, Dec 24, 25 or 31, or any calendar item today
     (all-day ones included) has a summary containing `birthday` or
     `bursdag` (Norwegian).
     - That needs the gog fetch to keep all-day items as dates. Extend the
       existing parser without changing the timed `events` list.
     - Only the boolean is kept, never a title.
   - All of these go into `situation`, gated on `proactive` and their own
     `look_*` key.
   - Tests:
     - glyph mapping, including an unknown glyph → none
     - the night window edges (22:59, 23:00, 04:59, 05:00)
     - party from fixed dates, and from a fake all-day "Anna's birthday" item
       (assert that title is not kept)

   Trap: `omarchy weather icon` exits 1 offline. Treat that as none, not an
   error.

3. **Quips** (`app/quips.json`, `app/server.py`)
   - `quips.json` maps event → list of short lines with `{n}`/`{pct}` slots:
     - `break`, `welcome`, `ram`, `cpu`: these move into the file;
       `Nudge.QUIPS` is replaced
     - `rain`, `snow`, `night`, `party`, `coding`, `done`

     Write 3 to 5 friendly lines each: no names, no sarcasm about the user, and
     snow is the snowflake's favourite.
   - `quip(event, **slots)` keeps a shuffled bag per event in memory and draws
     until the bag is empty, then reshuffles. A broken or missing file falls
     back to the built-in lines.
   - With `react_quips` on, `Nudge` offers a visual-only quip once per day per
     event when `rain`, `snow`, `night` or `party` turns on, and once per
     coding session of 2 hours or more ("Two hours of code. Water?").
   - Tests: no repeat until the list is used up; the fallback on a corrupt file;
     slot formatting; once a day.

4. **Page: the looks, the command-done arrival, the proud generation**
   (`app/static/index.html`)
   - `drawSit` gains these parts, in the same flat style:
     - **`glasses`** (eye zone): round thin frames over the eye centres
       (±27.5, -4.5), sized for the 47×81 eyes (about 44×44 rings over their
       upper middle) in the accent colour, with a bridge. Lifted while he talks,
       like the shades. Hidden when the shades are on.
     - **`nightcap`** (top zone): a soft drooping cone from the top arm with a
       pom-pom, in his pupil colour, swaying with `G.sitW`.
     - **`umbrella`** (top zone): a small canopy above his head with a curved
       handle, plus a few falling drops in snow, drawn from the existing frame
       loop: no new rAF and no new timer. When `snow` is on instead, no
       umbrella: he gets the `excited` mood once (he loves snow) and the
       existing frost tips.
     - **`partyhat`** (top zone): a striped cone with a pom-pom; one
       `confetti()` burst when it goes on.

     Top-zone parts render only when `LOOK.skin === 'none'`. The priority rules
     are as above, with the same 3 s on / 8 s off hysteresis, and each part
     joins the "settled, skip writes" check.
   - **Command done:** an arrival with `ev.app === 'nixi-job'` uses a `done`
     variant: the `t_beam` face, green sparks and the `done` sound. The text is
     the notification's own title ("Done in 42s"), which the takeover shows
     only with `notify_details`. Without it, the label reads "A long command
     finished".
   - **New generation:** on the `ambient` event with `glint` and `proactive`,
     `poke('t_beam',1800)` and `burstLines('#77b6e1',8)`.
   - Verify: a headless render (the phase b method) with every look forced on,
     in pairs: glasses alone, then nightcap + glasses, umbrella, party hat, and
     shades replacing glasses. Check nothing collides with the tie or
     headphones. Run the `node` parse check and the unit tests.

5. **Settings** (`app/server.py`, `app/static/index.html`)
   - Defaults (all false) and `NOTIFY_FLAGS` for the five new keys, plus
     `label.tg` toggles in the Desktop section:
     - "Glasses while coding"
     - "Nightcap at night"
     - "Dress for the weather" (needs the weather look)
     - "Party hat on special days" (birthdays need the calendar)
     - "Little jokes"

   Deviations (snowflake `a843e4d`):
   - The party hat and umbrella in his pupil blue vanished against his blue
     arms. The hat is now pink with white stripes and a yellow pom-pom, drawn
     1.2× in an inner group (`frame()` owns the outer transform). The umbrella
     is rain-coat yellow. Both were checked in a headless render with the
     headphones and tie on.
   - The top-zone parts are drawn before the headphones, so the band passes in
     front of the hat brims.
   - Snow gets no frost tips beyond what the existing weather look already
     draws.

### nixi

6. **Shell hook option** (`nix/hm-module.nix`)
   - `services.nixi.companion.commandDone.enable` (default false) and
     `commandDone.seconds` (default 30).
   - When enabled, set `programs.bash.initExtra` and `programs.zsh.initContent`.
     These are only appended when those programs are enabled; that is HM's own
     behaviour.
     - bash: a `DEBUG` trap records the start once per command line. A
       `PROMPT_COMMAND` function computes the elapsed time and exit status.
     - zsh: `preexec`/`precmd`.
     - In both, at or above the threshold, skip it if this terminal is the
       focused window: walk this shell's parent PIDs through `/proc` against
       `hyprctl activewindow -j | jq .pid`. This forks only after a long
       command, never per prompt.
     - Otherwise run
       `notify-send -a nixi-job "Done in ${s}s" "<first word>"`, or
       `"Failed after ${s}s (exit N)"`.
   - Only the first word of the command is sent, taken with a parameter
     expansion from history, never the full command line.
   - A shell test in `tools/test_nixi.py`, the way existing checks evaluate the
     module:
     - the generated snippet parses under `bash -n` and `zsh -n` (zsh only if
       present)
     - a fake `notify-send` on `PATH` gets the first word only, for
       `sleep 31 # secret`

   Traps:
   - `nixi-watch` and the module already set some shell bits; check for
     collisions with `grep -n "initExtra\|initContent" nix/hm-module.nix`.
   - A `DEBUG` trap must chain any existing trap and must not run in
     `PROMPT_COMMAND` itself.
   - `SECONDS` is per shell, so it is fine.

7. **README:**
   - the five switches
   - the hook option, with an example (`services.nixi.companion.commandDone.enable = true;`)
   - that only the command's first word and its duration are sent

8. **Review, live check, PRs**
   - A fresh `opus` reviewer gets this plan and the diffs.
   - Live check on p620, the same way as phase (b): build the worktree package
     and run its launcher directly, with no system switch.
     - Focus a terminal for a minute: glasses.
     - Run the generated hook snippet in a scratch bash with `sleep 31`, from an
       unfocused terminal: a "done" arrival.
     - Night, weather and party are covered by unit tests with fake clocks and
       fake data, and the headless render shows their looks. The live check
       covers only the looks that real signals can trigger now.
   - Then the two PRs, linked; merge when green.

## Review fixes (step 8)

A fresh Opus review found three blocking bugs in the bash half of the hook. All
were reproduced, then fixed in nixi (`share/command-done.sh`,
`tools/test_nixi.py`) by the session model:
- **A DEBUG trap replaced other tools' traps.** `trap -p` inside a function
  sees none. It also clobbered `$_` (`mkdir x && cd $_`). Now there is no DEBUG
  trap at all: `PS0` stamps the start once per command line, in this shell,
  never for an empty line. It uses `${__nixi_job_nil[__nixi_job_start=SECONDS,0]}`,
  which expands to nothing. `PS0` is re-appended at each prompt if another tool
  replaced it.
- **Idle time counted, and internal names reported.** With a hook appended
  after ours, or bash-preexec (the user's `.bashrc` loads it), the clock started
  at the prompt and the body read `__bp_interactive_mode`. Now the start comes
  only from `PS0`. The name comes from `history 1`, only when `HISTCMD`
  advanced and only after a command over the threshold, so there is no fork per
  prompt. The exit status honours bash-preexec's `__bp_last_ret_value`, and our
  function goes first in `PROMPT_COMMAND`.
- **More than the first word leaked.** The first word now:
  - skips leading `NAME=value` words
  - drops any word that still holds `=`
  - strips a leading `(`, `{` or `!`
  - keeps the basename only

  This applies in both bash and zsh.
- Under tmux/zellij the focus check cannot see the terminal, so it always
  notifies there. This is documented in the hook.
- The test now drives a real interactive `bash --norc -i` and covers: the plain
  case, `NAME=value`, a path, a subshell, idle time with a later hook, an
  existing DEBUG trap kept, `$_` intact, below threshold and failure. zsh is
  checked through its hook functions, with the fake as a function, because
  NixOS's `/etc/zshenv` resets `PATH`. It was also checked by hand under a pty,
  and with the user's real bash-preexec 0.7.0 loaded before and after.

## Implementers

- Steps 1-5 go to the `coder` agent (Sonnet), through `SendMessage`.
- Step 6 (Nix and shell) also goes to the coder.
- Steps 7-8, every render check and the live check are done by the session
  model.

## Tests

| Where | Command | Expected |
|---|---|---|
| snowflake | `python3 -m unittest discover -s tests` | all pass; new and extended tests |
| snowflake | headless render | each look and each pair without collisions |
| nixi | `python3 tools/test_nixi.py` | passes, including the hook snippet test |
| nixi | `nix flake check` | green in CI |
| desktop | step 8 | as written |

## Rollback

- **Users:** each look, quips and the hook have their own switch.
  `proactive` turns off everything on the snowflake side.
- **Code:** revert the PRs. No new state is written, except the quip bags,
  which live in memory.
