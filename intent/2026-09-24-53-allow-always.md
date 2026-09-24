---
status: approved
issue: 53
author: olafkfreund
---

# Intent: Let the user say "yes, and stop asking" once

## Problem

Every permission request must be answered individually, every time, forever.
There is no way to approve a kind of action and have that remembered, so adding
one key binding means answering the same shape of prompt several times over.

The consequence is not just irritation. It is the thing that decides whether
the tool gets used at all: a card that interrupts constantly is one people stop
reaching for, and Nixi's whole value is being the thing a newcomer turns to
instead of guessing.

It is also a safety problem, and #27 already documented it in this repo:
repeated prompting trains the user to click **Allow** as a reflex, which
undermines the one prompt that actually matters.

**This is #27 recurring one level up.** That issue was the same complaint about
read-only lookups and was fixed by allowlisting `Read`, `Grep` and `Glob` --
"stop asking for a whole category". The complaint has come back for writes and
commands, which is evidence the category approach does not generalise. It is
also what produced #41, where the allowlist silently applied to Guide as well
and broke Guide's documented guarantee.

## What already exists, and why it is not enough

**YOLO already stops all prompting.** Clicking MECHANIC in the corner switches
to it, and it auto-approves everything from then on. It works today and needs no
code.

But it is all-or-nothing and permanent. A user who wants to stop being asked
about one routine thing has to give up being asked about anything, including the
destructive operation they did want to see. The careful user -- the one this
card is for -- will decline that trade, which leaves them back at answering
every prompt.

## The capability is already present and is being discarded

ACP defines four permission option kinds: `allow_once`, `allow_always`,
`reject_once`, `reject_always`. Both installed adapters offer them --
`claude-agent-acp-0.70.0` carries 21 references to `allow_always`, `codex-acp`
25.

`bridge/bridge.js:235` already forwards the agent's whole `options` array to the
card. `Conversation.qml` then renders two hardcoded buttons and
`answerPermission(allow)` takes a boolean, which `bridge.js:328` collapses back
to `allow_once`.

So when the agent offers "Allow always", Nixi throws that choice away and
answers "just this once" on the user's behalf. Nothing needs inventing; an
option that is already on the wire needs surfacing.

## Proposed outcome

- A user can approve something and not be asked about it again, without giving
  up prompting for everything else.
- The scope of "always" is whatever the agent means by it, and the card says so
  plainly enough that the user knows what they just agreed to.
- An agent that offers only `allow_once` still works, and the card looks
  unchanged there.
- The card does not gain a third button that is easy to hit by the same reflex
  #27 is about.

## Affected users and systems

- Every Mechanic user, on every prompt -- this is the main interaction of the
  product.
- `Conversation.qml`'s permission card and its `Y`/`N` shortcuts;
  `bridge/bridge.js`'s `choose()` and the permission answer path;
  `bridge/trust-policy.test.js` and the behavioural harness, which assert on
  exactly what the bridge sends back.
- Security-relevant: this widens what a single click can authorise, so it is the
  opposite of #50's direction and the two need to be consistent with each other.

## Constraints

- The remembering belongs to the **agent**, which owns the scope and already has
  the machinery. Nixi must not build a second, competing allowlist that the
  agent does not know about -- that is what #41 cost.
- Guide must be unaffected: it cancels every request it receives, and "always"
  must not become a way to get a persistent yes out of a trust level whose whole
  claim is that nothing changes.
- YOLO must keep working as it does, and must not become reachable by accident
  from a per-decision choice.
- An agent that offers fewer options must degrade cleanly, not render an
  inert button.
- Must not make the reflex worse. A third button next to Allow, answerable by a
  held key, would make one keystroke do more damage than it does today.

## Open questions

1. What does the card tell the user "always" means? The agent decides the scope
   -- this tool, this command pattern, this session, a persisted rule -- and the
   card cannot know. Saying "Always" alone risks the user believing it is
   narrower than it is. Showing the agent's own option label is more honest and
   less predictable.
2. Should it be reversible from inside Nixi? A user who allows always and
   regrets it will look for the undo in the card. If the answer is "restart the
   session" or "edit the agent's settings", that should be a stated decision.
3. Keyboard: `Y`/`N` are bound today. Does the third option get a key at all?
   Leaving it mouse-only is a deliberate speed bump and may be the right one.
4. Does this interact with #50's settle window? That issue proposes disabling
   the buttons briefly so a queued request cannot be answered unseen. A button
   that grants persistent approval is exactly the one that most needs it.
5. Is a `reject_always` button wanted at the same time? It is the same mechanism
   and costs nothing extra, and the absence of a way to say "never ask me to do
   that again" is its own annoyance.
