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
out with `confirm: "click"`. The companion (`app/static/index.html:2882-2894`, Enter
and `y` at 4027) and the Nixi card (`Conversation.qml:967`) already refuse the voice
and keyboard for such a card. A gog send has none of this.

## Proposed outcome

A command that sends with gog is treated like a herdr write, in every trust level:

- The card says "click yes or no", and the voice, Enter and `y` can't answer it.
- It is never offered or matched as "always".
- YOLO never auto-approves it, and "allow all pending" skips it.
- In Guide it is refused, as every non-read command is today.
- The audit trail records that a send was asked and how it was answered (who it went
  to and which gog command), but not the message body.

Reading mail and chat with gog (list, search, get) is unchanged: no extra card.

## Affected users and systems

- nixi-nixarchy bridge: `bridge/herdr-policy.js` (or its successor), `bridge/always.js`,
  `bridge/bridge.js` and their tests.
- Clients need no change, as long as they already honour `confirm: "click"`: the
  companion and the Nixi card do.
- Anyone using Mechanic or YOLO with an agent that has gog: one more click per send.

## Constraints

- Fail-safe like the herdr guard: a false positive is an extra card, never a hidden send.
- Must not change how herdr writes behave.
- No message body in logs, the audit file or diagnostics.
- Comes before #210 (mail replies by voice), which depends on it.

## Open questions

1. Which gog commands count as a send? At least `gmail send`, `gmail reply`, sending a
   draft, and `chat messages send`. Should a command that only creates a draft count too?
   Recommendation: no. A draft sends nothing, and the send that follows still needs a click.
2. Should the audit line for a gog send keep the recipient, or only the command name?
   Recommendation: keep the recipient. It is what you check later, and it isn't the body.
