---
status: approved
issue: 89
author: olafkfreund
---

# Intent: A reply means the same thing however the agent chunks it

## Problem

`bridge/learned.js` hides `LEARNED: <fact>` lines from the card and the bridge
appends those facts to `~/.local/share/nixi/LEARNED.md`. Whether a line is a
`LEARNED:` line is decided without knowing whether it starts at the beginning
of a line. Once part of a line has been passed to the card, the filter treats
the next chunk as the start of a new line.

So the same reply gives different results depending on where the agent's stream
happens to split it. Verified on master (#89):

| `Done LEARNED: not a fact\n` pushed | card shows | facts harvested |
|---|---|---|
| whole | `Done LEARNED: not a fact` | none |
| two characters at a time | `Done` | `not a fact` |

Two harms:

1. **The card silently cuts the reply short.** Everything after `Done` is gone,
   with no sign anything was removed.
2. **A sentence that only mentions the marker becomes a remembered fact.** It is
   written to `LEARNED.md`, which `nixi-context` searches. That file grounds
   every later answer on this machine, so one bad split keeps misleading the
   tutor after the session ends. It is the most lasting kind of mistake the
   bridge can make.

Chunk sizes come from the agent, not the user, so nobody can reproduce this from
the card. That is why it has gone unnoticed, and also why a test has to cover it.

The existing test (`learned.test.js`, "however the stream is split") splits the
reply only once, so the second chunk always starts after a newline. The defect
needs a split after part of a line has already been flushed, which that test
never produces.

## Proposed outcome

- Any reply gives the same visible text and the same facts whether it arrives
  whole or in chunks of any size.
- `LEARNED:` counts only at the start of a line, as it already does when the
  reply arrives whole. Text that mentions the marker mid-sentence reaches the
  card unchanged and is never written to disk.
- A test proves this the way #87 proved it for `bridge/chart.js`: the same text
  pushed at many chunk sizes matches pushing it whole.

## Affected users and systems

- `bridge/learned.js` (`createLearnedFilter`) and `bridge/learned.test.js`.
- `bridge/chart.js` sits downstream (`bridge.js:273`:
  `charts.push(learned.push(...))`), so `learned.js`'s partial flushes decide
  where `chart.js`'s chunks split. Its chunking fuzz from #87 must keep passing.
- Every user with an agent connected, in both trust levels. The filter runs in
  Guide too, although the bridge only writes the file in Mechanic (#51).
- `~/.local/share/nixi/LEARNED.md` on machines where this has already fired.

## Constraints

- Ordinary text must keep streaming as soon as it arrives. Today the filter holds
  back only a line that could still be the marker ("ordinary text streams through
  without waiting for a newline"). The fix must not hold back whole lines.
- Use the shape #87 used for `chart.js`, an `atLineStart` flag, rather than a
  different design for the same problem. Two filters chained together should
  agree on what a line start is.
- No change to `appendLearned`, the file format or its limits.

## Open questions

1. Facts this bug already wrote to `LEARNED.md` cannot be told apart from real
   ones. Should the fix do anything about existing files (nothing, a release note
   pointing users to the file, or a one-off check), or is that out of scope?
