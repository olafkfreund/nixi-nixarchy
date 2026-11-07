---
status: draft
issue: 219
intent: intent/2026-11-07-219-gog-sends-click.md
---

# Spec: sending with gog needs a click

Line numbers are from nixi-nixarchy `origin/master` `51cfd71` and nixoarchy-snowflake `origin/main` `3725751`.

## Design

One idea: a **click-only** command is a herdr write or a gog send. Every place that guards a herdr write today
guards a click-only command instead. Nothing else in the approval flow changes.

### 1. One predicate, in the bridge

`bridge/herdr-policy.js` becomes `bridge/send-policy.js` (a `git mv`, so history follows). It keeps
`isHerdrWrite` and `herdrWriteDetail` unchanged and adds:

- `isGogSend(toolCall)`: the command (an argv is joined, as `isHerdrWrite` does; quotes, backslashes and
  line continuations are removed as well) mentions `gog` as a word **and** either names `api`, or names any
  send word: `send`, `reply`, `reply-all`, `replyall`, `forward`, `fwd`, `autoreply`, `post`, `create`.
  Any word in the command counts, not a parsed subcommand: `gog gmail search 'forward'` is a false positive,
  which costs a card and nothing else. So is `gog calendar create`, which can email invitations, so a card
  there is welcome.
- `isClickOnly(toolCall) = isHerdrWrite(toolCall) || isGogSend(toolCall)`.
- `gogSendDetail(toolCall)` for the audit line: `{ kind: "gog", command, to }`. `command` is the gog words up to
  the first flag or value, from a fixed list (`gmail send`, `gmail reply`, `chat messages send`, `api`, …);
  `to` is the value of `--to`/`--cc`/`--bcc` when given, otherwise the first positional id after the
  subcommand (message, draft or Chat space id). Values that look like a body are never read: `--body`,
  `--text`, `--subject`, `--html`, `--file` and stdin are skipped by name. When it doesn't parse, it returns
  `{ kind: "gog", command: "unknown", to: "" }`, never the raw text.

Why words, not a parser: the herdr guard's rule (`herdr-policy.js:1-6`) is that detection must not miss one,
and gog has aliases and a generic `api`. A shell alias or a wrapper script that hides the word `gog` is still
not seen; that residual is the same as herdr's and is written next to the regex.

### 2. The bridge's guard points

`bridge/bridge.js`, each `isHerdrWrite` that guards approval becomes `isClickOnly`:

| Line | What it guards |
|---|---|
| 461 | `offersAlways`: no "always" option on the card |
| 541-551 | YOLO skips its auto-yes |
| 580 | the card goes out with `confirm: "click"` |
| 903 | "allow all pending" skips it |

`bridge/always.js:37` (`rememberable`) uses `isClickOnly`, so a click-only command is never stored and never
matched, also from an entry written before this change.

The audit calls (536, 546, 794, 851) run for any click-only command. `auditSend` picks the detail by kind:
`herdrWriteDetail` for a herdr write, as today; `gogSendDetail` for a gog send, and then no `text` field at
all. The existing fallback that copies the raw command (`bridge.js:758-759`) is kept for herdr only, so a gog
body can't reach `sends.log` through it.

Guide is unchanged: a gog send is a non-read command, so it's cancelled, and the cancel is audited as for a
herdr write.

### 3. The Nixi card's `Y`

`Conversation.qml:1546-1556`: when `root.pendingPermission.confirm === "click"`, a bare `Y` is swallowed
(accepted, no answer) and a tick says "click to confirm sends", as the companion's page does. `N` still
answers no. Enter already doesn't answer a card. This also covers herdr writes.

### 4. The companion's own agent mode

When the companion runs its agent without the nixi bridge, approvals come from the agent's permission hook
through `/api/approve` (`server.py:6650`) to `Approvals.ask` (`server.py:830`). There is no YOLO there.

- A new `CLICK_ONLY_RE` next to `CHAINED_RE` (`server.py:796`) with the same two rules as the bridge: the word
  `herdr`, or the word `gog` with `api` or a send word, after removing quotes and backslashes. Its comment
  names `send-policy.js` as the twin to keep in step.
- In `ask()`, for Bash: `click = bool(CLICK_ONLY_RE.search(...))`. A click-only command is never looked up in
  or added to `self.always`, `can_always` is false, and the `approve` event carries `confirm="click"`. The
  page already refuses the voice, Enter and `y` for that (`index.html:2882-2894`, 4027).
- Herdr writes in this mode get the same guard. They had none; it's the same predicate, so they aren't
  split out.

The companion's endpoint still accepts `yes` without knowing how it was entered (`server.py:6666`), as the
bridge does. Click-only is a client rule, as the intent says.

## Alternatives rejected

- **Parse gog's argv exactly.** Misses aliases and new subcommands, and a miss is a hidden send.
- **Make every gog command click-only.** Reading mail would need a click too; the intent keeps reads free.
- **Rely on gog's `--gmail-no-send` flag.** It blocks Gmail only, not Chat, and the agent chooses its flags.
- **Enforce the click in the bridge.** The bridge can't tell a click from a voice yes: the protocol carries
  an option id only. Changing that protocol is a larger change for every client, and the intent doesn't ask
  for it.

## Risks

- **False positives:** a read whose text contains a send word (a search for "reply", `gog calendar create`)
  gets a card and loses "always". Accepted.
- **Two copies of the rule** (JS and Python) can drift. Both test files run the same table of commands.
- **Old "always" entries** for a gog send stay in `always.json` but no longer match. `/always list` still
  shows them, and `forget` removes them.
- No host is affected beyond the Nixi bridge and the companion. Nothing is deployed until both PRs merge.

## Verification

- `bridge/send-policy.test.js` (from `herdr-policy.test.js`): every send form in the intent, as a string and
  as an argv, with quotes and backslashes (`g""og gmail send`), counts. `gog gmail list`, `gog gmail search
  x`, `gog chat spaces list` and `gog gmail drafts create` don't. Herdr cases unchanged. `gogSendDetail` never
  returns a body, subject or file argument, and returns the recipient or the id.
- `bridge/herdr-bridge.test.js` (its existing harness drives the bridge end to end): a gog send in YOLO is not auto-approved and its card has
  `confirm: "click"`; "allow all pending" leaves it; the card offers no "always"; a stored entry for it isn't
  matched; Guide cancels it and the audit line has no `text`.
- QML: the existing card tests, plus `Y` on a `confirm: "click"` card answers nothing. If there's no QML test
  harness for keys, by hand on p620.
- Companion: `tests/test_approvals.py` (new, via `tests/nixi_env.py`): a gog send gets `confirm: "click"`, no
  "always" (an `always` answer counts once), and isn't found in `self.always`; a plain command is unchanged.
  The same command table as the JS test.
- By hand on p620, in Mechanic: ask the agent to send yourself a test mail with gog. Say "yes": nothing
  happens. Click yes: it sends. In YOLO, the card still appears. `sends.log` has the command and recipient,
  not the body.

## Rollback

Revert the two PRs. The audit file only gains lines; nothing else is stored.
