---
status: draft
issue: 219
author: olafkfreund
---

# Intent: sending with gog needs a click

## Problem

In Mechanic, the agent can send mail or a chat message for you with the `gog` CLI
(`gog gmail send`, `gog chat messages send`). Today that command is treated like any
other command, so it can be approved without anyone clicking:

- by a spoken "yes" to the card;
- by a remembered "always" (`bridge/always.js`), so later sends get no card at all;
- with no card at all in YOLO (`bridge/bridge.js:551`), or by "allow all pending" in
  YOLO (`bridge/bridge.js:903`).

A misheard "yes", or the agent sending more than you meant, puts a message in someone
else's inbox, and that can't be undone. The #206 intent says a voice yes never sends.

There is already one class of command that only a click can approve: a herdr write,
which types into another agent's session (#95). Its guard (`isHerdrWrite` in
`bridge/herdr-policy.js`) is applied at each of the places above, and the card goes
out with `confirm: "click"`. A gog send has none of this.

"Click only" is enforced by the clients, not the bridge: the bridge receives only an
option id (`bridge/bridge.js:776`). The companion's page refuses the voice, Enter and
`y` for a `confirm: "click"` card (`app/static/index.html:2882-2894`, 4027). The Nixi
card keeps such a card through YOLO (`Conversation.qml:967`), but its `Y` key still
approves it (`Conversation.qml:1546-1556`, which doesn't check `confirm`), so even a
herdr write can be approved there without a click today.

The companion also has its own agent mode, without the nixi bridge, with its own
approval code and its own "always" (`app/server.py:830` in nixoarchy-snowflake). A
gog send there gets an ordinary card too.

## Proposed outcome

A command that sends with gog is treated like a herdr write, in every trust level, in
the bridge and in the companion's own agent mode:

- The card says "click yes or no", and the voice, Enter, `y` and `Y` can't answer it,
  in the companion and in the Nixi card. This also fixes the card's `Y` for herdr writes.
- It is never offered or matched as "always".
- YOLO never auto-approves it, and "allow all pending" skips it.
- In Guide it is refused, as every non-read command is today.
- The audit trail records that a send was asked and how it was answered: which gog
  command, and where it went (the recipient when the command names one, otherwise
  the message, draft or Chat space id). Never the body, and never the raw command,
  which can hold `--body` or `--text`. It records the decision, not delivery.

What counts as a send (gog v0.48.0's own help): `gog send`, `gmail send`, `reply`,
`reply-all`, `forward`, `autoreply`, `drafts send` (alias `post`), and
`chat messages send` (aliases `create`, `post`), with their aliases such as
`mail send`. `gog api` can reach any endpoint, so it counts as a send too. Reading
mail and chat with gog (list, search, get) and creating a draft are unchanged: no
extra card.

## Affected users and systems

- nixi-nixarchy: the bridge (`bridge/herdr-policy.js` or its successor,
  `bridge/always.js`, `bridge/bridge.js`), the Nixi card's `Y` key
  (`Conversation.qml`), and their tests.
- nixoarchy-snowflake: the companion's own agent mode (`app/server.py` approvals and
  "always"), and its tests. The page already honours `confirm: "click"`.
- Anyone using Mechanic or YOLO with an agent that has gog: one more click per send.

## Constraints

- Fail-safe like the herdr guard: a false positive is an extra card, never a hidden send.
  Matching command text can't see every route (a wrapper script, a shell alias); that
  residual is stated, as it is for herdr.
- Herdr writes keep every guard they have. The only change for them is that the Nixi
  card's `Y` no longer approves one.
- No message body in logs, the audit file or diagnostics.
- Comes before #210 (mail replies by voice), which depends on it.

## Open questions

1. **The companion's own agent mode:** in this task, or its own issue? Recommendation:
   in this task. The outcome is "a voice yes never sends", and that mode has the same gap.
2. **`gog api`:** treat every call as a send (an extra card on reads too), or only
   calls that aren't GET? Recommendation: every call. It's rare, and a false positive
   is only a card.
