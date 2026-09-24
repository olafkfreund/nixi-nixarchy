---
status: approved
issue: 51
spec: spec/2026-09-24-51-learned-visibility.md
---

# Plan: A fact the agent teaches itself should be visible to the user

Approved decisions: a quiet transcript line when a fact is kept; visible rather
than confirmed; **Guide does not write facts at all**; clearing is out of scope
and documented as a gap.

## Steps

1. `bridge/bridge.js` `finishLearned()`: return early when
   `resolveTrust(trust) === "guide"` or there are no facts, before the append.
2. Same function: after a successful append, `emit({ type: "learned", facts })`.
3. `bridge/learned.js` header: correct the claim that bridge-writes-not-agent
   makes this safe in Guide. Who holds the pen is not whose machine is written.
4. `Conversation.qml` `handleAgentLine`: handle `learned` by calling
   `showNixiMessage("Noted: " + fact)` per fact.
5. `bridge/learned.test.js`: the existing bridge test becomes the Mechanic case
   and additionally asserts the `learned` event; add a Guide case asserting
   nothing is written and nothing announced.

## Tests

```bash
node --test bridge/*.test.js         # 79, 2 changed/new
nix flake check --print-build-logs
```

Both new assertions were deliberately broken and observed to fail:

| broken | message |
|---|---|
| Guide gate removed | `Guide wrote to LEARNED.md` |
| `learned` emit removed | `no learned event; got ["ready","status","diagnostic","text","done"]` |

Runtime, not run: in Mechanic, get the tutor to record a fact and confirm a
"Noted:" line appears; in Guide, confirm `~/.local/share/nixi/LEARNED.md` does
not grow.

## Known gap, stated rather than half-built

There is still no way to review or clear what has been learned, short of editing
`~/.local/share/nixi/LEARNED.md` by hand -- which the intent's third constraint
rules out as an answer. Making the writes visible is what makes that gap
discoverable; closing it is a separate piece of work with its own design.

## Deviation

One comment was wrong on first writing and corrected in place: `showNixiMessage`
renders through the same `spacedMarkdown` path as an agent reply, not as
PlainText. The text is still bounded (`MAX_FACT = 300`) and `#42` already strips
uncontained images and non-http links on that path, so the behaviour is right --
but the comment claimed a mechanism that is not the one in use.

## Rollback

`git revert`. Facts already on disk are untouched and keep being read; only new
Guide writes stop. Reverting resumes them.
