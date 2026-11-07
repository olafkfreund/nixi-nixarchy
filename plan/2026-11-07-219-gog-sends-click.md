---
status: approved
issue: 219
spec: spec/2026-11-07-219-gog-sends-click.md
coders:
  1: codex   # small, tricky matching logic where a miss is a hidden send
  2: coder   # wiring the predicate into known guard points, plus tests
  3: coder   # two small QML guards
  4: coder   # the companion side, several pieces in one file plus a new test
reviewers:
  - codex    # read-only review of the whole diff, looking for a path that skips the click
  - agy      # a second, independent read of the same diff
---

# Plan: sending with gog needs a click

## Decisions carried over from the approved spec

- A **click-only** command is a herdr write or a gog send. Every guard that applies to a herdr write applies to it.
- **A gog send** is a command that mentions the word `gog` (after removing quotes, backslashes and `\`-newlines;
  an argv is joined with spaces) and either the word `api` or a send word: `send`, `reply`, `reply-all`,
  `replyall`, `forward`, `fwd`, `autoreply`, `post`, `create`. Exception: the phrase `drafts create|reply|forward|
  update` doesn't count by itself; any send word elsewhere still does; `drafts send|post` always counts.
  False positives are accepted. A wrapper script or alias without the word `gog` is a stated residual.
- **The audit detail** `{kind: "gog", command, to}` reads only fixed places: the gog words before the first flag,
  kept only if on the fixed list (`send`, `gmail send`, `gmail reply`, `gmail reply-all`, `gmail forward`,
  `gmail autoreply`, `gmail drafts send`, `chat messages send`, `api`, and the aliases `mail send`, `gmail
  replyall`, `gmail fwd`, `gmail drafts post`, `chat messages create|post`), else `"unknown"`; `to` is the values of
  `--to`, `--cc`, `--bcc` (`--to x` and `--to=x`); without those, for reply/reply-all/forward/drafts send/chat
  messages send, the one positional right after the command words. Ambiguous gives `""`. No other argument is ever
  read. A gog line has no `text` field.
- **Bridge:** no "always" offered or matched, no YOLO auto-yes, skipped by "allow all pending", the card carries
  `confirm: "click"`, Guide cancels as today, and every decision is audited.
- **Nixi card:** `Y` can't answer a `confirm: "click"` card, by either route. `N` still answers no.
- **Companion:** Ask mode asks with `confirm="click"` and never uses "always" for one. Trust and Root keep
  `bypassPermissions` and add a `Bash`-only `PreToolUse` hook to the same `approve.py`; `/api/approve` allows a
  non-click-only command at once in those modes and asks for a click-only one. Read-only is unchanged. A body-free
  `DATA_DIR/sends.log` line (mode `0600`) for each click-only decision: `allow`, `deny` or `timeout`.
- Herdr writes keep every guard they have; they gain the card's `Y` fix and, in the companion, the same guard.

The spec's one unverified point was checked before this plan: with `--permission-mode bypassPermissions` and a
`PreToolUse` hook on `Bash`, Claude Code ran the hook and obeyed its deny (the command's file was never written).
Reproducer: a hook script that prints a `deny` decision for any command containing `PROBE_DENY`; `claude -p
--permission-mode bypassPermissions --settings <hook>.json "run: echo PROBE_DENY > <file>"`. The hook logged the
command, and `<file>` didn't exist afterwards.

## Where the work happens

- Steps 1-3: nixi-nixarchy, worktree `/mnt/code/Source-home/GitHub/nixi-219`, branch `feat/219-gog-sends-click`,
  from `origin/master` `51cfd71`.
- Step 4: nixoarchy-snowflake, a new worktree `/mnt/code/Source-home/GitHub/nixi-219-code`, branch
  `feat/219-gog-sends-click`, from `origin/main` `3725751`.
- Line numbers below are from those commits.

## Steps

1. **`bridge/send-policy.js`** (codex). `git mv bridge/herdr-policy.js bridge/send-policy.js` and
   `git mv bridge/herdr-policy.test.js bridge/send-policy.test.js`; update the three imports
   (`bridge/always.js:7`, `bridge/bridge.js:18`, the test's line 3) and the comment at `always.js:17`. Keep
   `isHerdrWrite` and `herdrWriteDetail` byte-for-byte. Add `isGogSend`, `isClickOnly` and `gogSendDetail` as in the
   decisions above, with the residual written next to the regex as the herdr one is (`herdr-policy.js:1-6`).
   Tests in `send-policy.test.js`, one table of commands:
   - count, as a string and as an argv: `gog send`, `gog gmail send`, `gog mail send`, `gog gmail reply`,
     `reply-all`, `replyall`, `forward`, `fwd`, `autoreply`, `gog gmail drafts send`, `drafts post`,
     `gog chat messages send|create|post`, `gog api …`, `g""og gmail send`, `g\og gmail send`, `gog gmail drafts
     create x; gog gmail send y`, and a `\`-newline split;
   - don't count: `gog gmail list`, `gog gmail search x`, `gog chat spaces list`, `gog gmail drafts create`,
     `drafts reply`, `drafts forward`, `drafts update`, `blog send` (word boundary), `echo gogs`;
   - `gogSendDetail` returns the recipient for `--to a@b` and `--to=a@b`, the id for `gog gmail reply 123`, and
     `""` when unclear; for `--body`, `--body=…`, `--body-html`, `--body-file`, `--raw-file`, `--subject` and a
     quoted body holding a send word, no field of the result contains that text;
   - the existing herdr cases pass unchanged.
   → verify: `node --test bridge/send-policy.test.js`.
   Traps: a miss is a hidden send, so when in doubt it counts. Don't touch `herdrWriteDetail`.

2. **Bridge guard points** (coder). In `bridge/bridge.js`, use `isClickOnly` at `461` (`offersAlways`),
   `541` (`herdrWrite`, renamed `clickOnly`, used at `546`, `551` and `580`), `903` (allow all pending), and for the
   audit calls at `536`, `794` and `851`. `auditSend` (`756-768`): for a gog send write `{ts, ...gogSendDetail, cwd,
   decision, optionKind}` with no `text`; the raw-command fallback at `758-759` stays for herdr only. In
   `bridge/always.js:37`, `rememberable` uses `isClickOnly`. The fake agent needs a gog case: in
   `bridge/testing/fake-agent.js`, beside `PLEASE_HERDR` (`145-146`), a `PLEASE_GOG` text that makes a `Bash` call
   `gog gmail send --to me@example.com --subject s --body secret-body`. Tests in `bridge/herdr-bridge.test.js`, with
   its existing harness (`runBridge`): a gog send in YOLO isn't auto-approved and its card has `confirm: "click"` and no
   `allow_always`; allow-all leaves it pending; a stored `always.json` entry for it doesn't match; Guide cancels it
   and the audit line has no `text` and doesn't contain `secret-body` or the subject; a herdr write behaves as before. In `bridge/always.test.js`: `rememberable` is
   false for a gog send.
   → verify: `node --test 'bridge/*.test.js'` (Node 24 won't take a folder).
   Traps: every audit path must keep writing for herdr exactly as today; `#95` tests must stay green.

3. **The card's `Y`** (coder). `Conversation.qml:1546-1556`: if `root.pendingPermission.confirm === "click"` and the
   key is `Y`, accept the event, answer nothing, and show "click to confirm sends" the way the card shows its other
   ticks. `WindowShortcuts.qml:14-19`: add `&& conversation.pendingPermission.confirm !== "click"` to the `Y`
   shortcut's `enabled`. `N` unchanged. The hint at `Conversation.qml:1990` ("Clear the message box to answer with Y
   or N") says "Click yes or no: a send can't be answered by a key" on a click-only card.
   → verify: `nix flake check` parses the QML only (`flake.nix:36-40`), so the guards are checked as the repo checks
   the older key guards, by source assertions in `tools/test_nixi.py` (`test_permission_keys_guard`, `622`): the
   composer's permission branch tests `confirm` before `Qt.Key_Y`, the `Y` shortcut's `enabled` names `confirm`, and
   the hint has a click-only text. Run `python3 tools/test_nixi.py`. Step 6 checks both routes by hand.
   Traps: `pendingPermission` may be the empty object; guard on `.confirm` only, as `Conversation.qml:968` does.

4. **The companion** (coder), in `/mnt/code/Source-home/GitHub/nixi-219-code`:
   - `app/server.py:796`: next to `CHAINED_RE`, a `click_only(cmd)` function with the same rules as step 1
     (herdr, or gog with `api` or a send word, the drafts exception), and `send_detail(cmd)`, the Python twin of
     `gogSendDetail` (herdr: the pane only). A comment names `bridge/send-policy.js` as the twin.
   - `Approvals.ask` (`server.py:830-867`), for `Bash`: when `click_only(cmd)`, skip the `self.always` lookup,
     set `can_always = False`, never add to `self.always`, and publish `approve` with `confirm="click"`. When
     `trust()` is `trust` or `root` and the command isn't click-only, or the tool isn't `Bash`, return
     `{"ok": True}` at once with no card.
   - After a click-only decision, append one JSON line to `DATA_DIR / "sends.log"`, created with mode `0o600` and
     `chmod`ed to `0o600` once per run if it already existed, as the bridge does (`bridge.js:767-770`): `ts`,
     `send_detail`, and `decision` (`allow`, `deny`, or `timeout` when `item["ans"]` is `None`).
   - `server.py:4923-4926`: for `trust` and `root`, after `bypassPermissions`, add `"--settings",
     send_hooks_file()`, a new function beside `hooks_file()` (`4892`) that writes a `PreToolUse` hook on `Bash`
     only, running the same `approve.py`, to its own file under `DATA_DIR`.
   - New `tests/test_approvals.py` through `tests/nixi_env.py`, run from `tests/`: the same command table as step 1
     for `click_only`; Ask mode gives `confirm: "click"`, no always (an `always` answer counts once) and no lookup
     in `self.always`; a plain command is unchanged; Trust and Root allow a plain command with no `approve` event
     and ask for a gog send; `sends.log` has one line each for allow, deny and timeout, with no body or subject
     from the test command, and its `to` is the test's `--to` recipient; an existing `sends.log` with mode `0644`
     ends up `0600`; `send_hooks_file()` names `Bash` only. `BUS.pub` is captured, nothing real runs.
   → verify: `cd tests && python -m unittest test_approvals` and the full suite.
   Traps: never a real `claude`, `gog`, `pactl` or `hyprctl` in a test; import `server` only under the throwaway
   HOME from `nixi_env` (#176); `approve.py` with no Nixi running stays out of the way, as today.

5. **Review and PRs** (me). Run both suites. Reviews: a fresh Opus reviewer on the plan and the diff, then Codex
   and agy, read-only. Two PRs, each linking the intent, spec and plan, with `@codex review`. Record which steps
   which coder did.

6. **Deploy and check** (me). Merge both PRs, bump `nixi` and `nixi-companion` in `nixos_config`, CI, merge, post
   on the agent bus, switch p620 from the clean worktree, restart Nixi with the live Hyprland signature. With the
   user, in Mechanic: ask the agent to send a test mail to yourself with gog; "yes" does nothing, `Y` does nothing
   in the Nixi card, typed in the empty composer and pressed with the window focused (the two routes), a click sends
   it. In YOLO the card still appears. `sends.log` has the command and recipient,
   not the body. In the companion's Trust mode, a gog send asks and an `ls` doesn't.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/nixi-219 && node --test 'bridge/*.test.js' && python3 tools/test_nixi.py && nix flake check
cd /mnt/code/Source-home/GitHub/nixi-219-code/tests && python -m unittest discover -p 'test_*.py'
```

All pass. `test_character_fit` can be flaky under load; rerun it alone before treating it as a failure.

## Rollback

Revert the two PRs and bump the inputs back. `sends.log` lines and old `always.json` entries are left as they are;
nothing else is stored.

## Deviations

- **Step 1** (Codex): one fix on review. A flag straight after `reply` (`gog gmail reply --body x 123`) was taken
  as the message id; a positional starting with `-` is now ignored, with a test.
- **Step 3**: no separate "click to confirm sends" tick. The hint line under the composer stays visible on a
  click-only card and says "Click yes or no: a send can't be answered by a key", so the reason is on screen
  when `Y` is swallowed.
- **Tests**: `node --test bridge/` doesn't take a folder on Node 24; the commands use `'bridge/*.test.js'`.
- **Step 4** (coder): `tests/test_no_herdr_writes.py` fails if `server.py` holds the herdr write verbs, so the
  companion's herdr audit regex is generic (`herdr [--session x] agent|pane <word> <pane>`) and still keeps only
  the pane. On review its send-word match was stricter than the bridge's (`(?![\w-])` against `\b`), so
  `send-later` and `--gmail-no-send` counted in the bridge only; it now uses `\b`, with both cases in both tests.
- **Review fixes (step 5).**
  - Opus review, critical: Claude Code applies the user's own allow rules (`Bash(env:*)`, `Bash(timeout:*)` …)
    before the bridge sees a request, so `env gog gmail send …` ran with no card. `claudePermissions` now asks for
    `Bash(*gog *)` and `Bash(*gog)`, beside the herdr rules (`trust-policy.js:272`), with a test. The companion uses
    a hook and wasn't affected.
  - Codex, both repos: a body or subject that looked like `--to=…` or `--bcc=…` was read as a recipient and logged.
    Value flags (`--body`, `--subject`, `--body-html`, `--body-file`, `--raw-file`, `--text`, `--html`, `--file`,
    `--attach`) now consume their value, and `to` keeps only email addresses; anything else gives `""`.
  - Opus review: the gog skill's own form, `gog -a "$ACCT" --no-input gmail send …`, logged `unknown`. gog's global
    flags before the command words are skipped. `chat dm send|create|post` and `calendar respond|rsvp|reply` are on
    the list, and `respond`/`rsvp` count as send words.
  - Opus review: `g$'o'g` and `g${X}og` evaded detection. `${…}` and `$` are removed before matching, in both
    twins. `isHerdrWrite` stays byte-for-byte as the plan says, so herdr keeps that residual.
  - Codex on the PR: removing `${…}` also removed a send inside `${UNSET:-$(gog …)}`. Detection now checks both the
    quote-stripped text and the `${…}`-removed text. And the audit tokenizer split one shell argument
    (`--body="a "--bcc=x`) into several, so a body part could be logged as a recipient; it now keeps whole shell
    words. The Python twin already did both (raw text, `shlex`); both tests are in both repos.
  - Codex on the PRs, round three: a send word built by an expansion (`"${U:-se}nd"`) got past detection, and
    heredoc lines were read as recipient flags. Rather than chase shell syntax, two blunt rules in both twins:
    a gog command containing `$` or a backtick counts as a send, and a command with `<<` or a newline logs no
    recipient (the command name only). False positives cost a card.
  - Codex, round four: brace expansion (`s{e..e}nd`) also builds a send word, and the bridge read a recipient from
    inside `$(…)`. The rule now counts any gog command with `$`, a backtick, `{`, `*`, `?` or `[`, and logs no
    recipient when the command holds `$`, a backtick, `<<` or a newline.
  - Codex, round five: `g${UNSET:-o}g` builds the program name, and process substitution (`<(…)`) let a body reach
    the audit. A third reading keeps a default's word; `<(`/`>(` also means no recipient.
  - **Where this stops.** Each round found a new shell construct that hides a send from a text match. Text
    matching can't defeat an agent that is deliberately evading it (a wrapper script already does), and the intent's
    goal is that no accident sends: a misheard yes, a key, "always" or YOLO. From here, a finding that needs a
    deliberately obfuscated command is recorded as residual, not fixed; one an ordinary command can trigger is fixed.
