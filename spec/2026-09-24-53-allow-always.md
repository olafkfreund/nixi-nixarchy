---
status: draft
issue: 53
intent: intent/2026-09-24-53-allow-always.md
---

# Spec: Let the user say "yes, and stop asking" once

The intent left five open questions. Each is answered below with the reasoning.

## Design

Nothing new is invented. The agent already offers the choices and the bridge
already forwards them; the card renders two fixed buttons and
`answerPermission(bool)` discards the rest.

### 1. The card renders the agent's options, using the agent's own words

`bridge.js:235` already emits `options` -- an array of
`{ optionId, name, kind }` from the agent. The card renders **one button per
option**, labelled with the agent's own `name`.

That answers the intent's first and hardest question. The agent decides what
"always" means -- this tool, this command pattern, this session, a persisted
rule -- and the card cannot know. Inventing a label ("Always") would assert a
scope Nixi has not been told. Showing the agent's wording is the only honest
option, and it is also less work.

`noPermission` (`Conversation.qml:45`) gains `options: []`, so an agent that
sends none renders no buttons and the existing "nothing pending" bindings are
unaffected.

### 2. Answer with the option, not a boolean

`answerPermission(allow)` becomes `answerPermission(optionId)`, and
`bridge.js:328` resolves with the option the user actually chose instead of
deriving one from a boolean:

```js
pending.resolve(select(pending.options, message.optionId));
```

`choose(options, kind)` stays for the two callers that legitimately pick a kind
rather than honour a choice -- YOLO's auto-approve (`:230`) and the
allow-everything path (`:371`).

### 3. Keyboard stays on the one-shot choices

`Y` and `N` remain bound, and bind specifically to the `allow_once` and
`reject_once` options rather than to button positions. **The persistent choices
get no key.**

This is deliberate. #27 documented that repeated prompting trains Allow into a
reflex; a held key that can grant *standing* approval is the worst possible
target for that reflex. Requiring a deliberate mouse click for the durable
choice is a speed bump exactly where one belongs.

### 4. `reject_always` is included

Same mechanism, no extra cost, and "never ask me to do that again" is its own
relief. Rendering every offered option rather than a hand-picked subset means
this falls out rather than being a feature.

### 5. Degradation

An agent offering only `allow_once`/`reject_once` -- as
`bridge/testing/fake-agent.js` does today -- renders exactly the two buttons it
renders now. The card is unchanged for any agent that has nothing more to offer.

## Alternatives rejected

**Nixi keeps its own "always" list.** The competing-memory mistake #41 cost us:
a second allowlist the agent does not know about, whose scope Nixi would have to
invent. The agent already has the machinery and the knowledge.

**A fixed third button labelled "Always".** Asserts a scope Nixi was not told,
and breaks against an agent that offers a differently-scoped option or none.

**Give the persistent choice a key.** See 3.

**Point the user at YOLO instead.** It already exists and already stops all
prompting, but it is all-or-nothing and permanent -- it removes the prompt for
the destructive operation too. That trade is why a careful user declines it,
which leaves them where they started.

**Make "always" reversible from inside Nixi.** Out of scope, and Nixi cannot do
it honestly: the memory lives wherever the agent put it, and Nixi does not know
where. Worth documenting as a known limitation rather than half-implementing.

## Risks

- **A single click now grants more than it did.** That is the point, but it
  means the card's other weaknesses matter more. #50 proposes a settle window so
  a queued request cannot be answered before it renders; **the always button is
  the one that most needs it**, and #50 is currently parked. Worth stating in
  the PR so the two are not lost from each other.
- **The agent's label may be long or unhelpful.** It is agent-authored text on a
  button, so it needs the same treatment the detail pane already gets: rendered
  as plain text, length-bounded, never markup (see #42).
- **A malformed `options` array** -- missing `optionId`, duplicate kinds,
  unknown kinds -- must not break the card. Unknown kinds should render (the
  agent offered them) but must not be mistaken for `allow_once` by the keyboard
  binding.
- **Guide is unaffected and must stay so.** It cancels every request it
  receives, so no option of any kind is ever presented there. Worth a test
  rather than an assumption.
- Host-specific risk: none.

## Verification

1. **Automated, `bridge/trust-policy.test.js`** -- the harness drives the real
   bridge against a real ACP agent, so it asserts what was actually sent back:
   - choosing an `allow_always` option resolves with **that** `optionId`, not
     `allow_once`
   - `reject_always` likewise
   - YOLO still auto-selects `allow_once` and is not tempted by `allow_always`
   - Guide still cancels, with no option presented
   - an unknown `kind` is passed through when chosen
2. **Automated, `bridge/testing/fake-agent.js`** grows an `allow_always` /
   `reject_always` pair behind an env flag, so the four-option case is reachable
   without changing the existing tests' expectations.
3. **Automated.** `nix flake check`; `node --test bridge/*.test.js`.
4. **Runtime, the actual complaint.** In Mechanic with Claude, trigger a
   permission prompt, choose the agent's always-option, then trigger the same
   shape of action again -- it must not ask. This is the check that decides
   whether the issue is fixed, and it cannot be done in CI.
5. **Runtime, degradation.** An agent offering only two options shows two
   buttons, and `Y`/`N` still work.
