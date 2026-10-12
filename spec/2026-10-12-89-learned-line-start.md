---
status: approved
issue: 89
intent: intent/2026-10-12-89-learned-line-start.md
---

# Spec: A reply means the same thing however the agent chunks it

## Design

Give `createLearnedFilter` in `bridge/learned.js` an `atLineStart` flag,
exactly as #87 gave one to `createChartFilter` in `bridge/chart.js:25`. The flag
records whether the next character in `pending` begins a line.

| Where | Today | After |
|---|---|---|
| state | `pending`, `facts` | plus `let atLineStart = true` |
| complete line in `push` | `take(line)` | `atLineStart ? take(line) : line`, then `atLineStart = true` |
| partial line in `push` | released unless `couldBeMark(pending)` | released unless `atLineStart && couldBeMark(pending)`; on release, `atLineStart = false` |
| `flush` | `take(pending)` | `atLineStart ? take(pending) : pending` |

So a `LEARNED:` marker counts only when its line began at a line start. The rest
of a line whose first part was already sent to the card is never held back and
never read as a marker. That matches what the filter already does when a reply
arrives whole, so behaviour for unsplit replies does not change.

Streaming is unchanged: text is held back only while it could still be a marker,
and that now also requires it to be at a line start, so less is held than today.

`take`, `couldBeMark`, `appendLearned`, the file format and its limits are not
touched. `bridge/bridge.js` is not touched.

**Tested on a scratch copy before writing this spec.** Three replies, each pushed
at every chunk size from 1 to its length and compared with pushing it whole:
master gives 11 mismatches, the change above gives 0. `Done LEARNED: not a fact\n`
in two-character chunks gives `["Done", ["not a fact"]]` on master and the whole
line with no facts after the change.

**Facts already in `LEARNED.md`.** The intent's open question is decided as: no
code. The bridge cannot tell a wrongly harvested fact from a real one, and since
#51 every recorded fact was shown in the card as it was kept, so the user had a
chance to see it. The PR description says the file may hold such a line and
where it is (`~/.local/share/nixi/LEARNED.md`). There is no migration and no
cleanup.

## Alternatives rejected

- **Buffer whole lines before releasing anything.** Simplest to reason about,
  but every line of every answer would wait for its newline, breaking "ordinary
  text streams through without waiting for a newline", which the intent requires
  keeping.
- **Match `LEARNED:` anywhere and strip it in place.** Changes what an unsplit
  reply means (a mid-sentence mention would start harvesting) and would write
  more false facts, not fewer.
- **Merge the two filters into one line-aware pass.** It would remove the
  duplication with `chart.js`, but it is a refactor of a working module to fix a
  one-flag bug. The intent asks for the same shape, not shared code.
- **Clean or flag suspect lines in existing `LEARNED.md` files.** There is no
  reliable signal for which lines are suspect. See the design note above.

## Risks

- **A real fact missed.** A `LEARNED:` line that follows a partial flush of the
  same line was never a real line-start marker, so nothing correct is lost. A
  marker at a real line start (after `\n`) still sets `atLineStart = true` first,
  covered by the existing "however the stream is split" test, which must keep
  passing.
- **`chart.js` chunking shifts.** `learned.js` now releases partial lines that it
  used to hold, so `chart.js` sees different chunk boundaries. Its own
  `atLineStart` makes it insensitive to that. Covered by the chained test below.
- Hosts: none specific. Pure JS in the bridge, the same on every machine.

## Verification

1. New test in `bridge/learned.test.js`: for a set of replies including
   `Done LEARNED: not a fact\n`, a real `LEARNED:` line, an indented one, a
   final one without a newline, and a near miss (`LEARNEDy`), pushing at every
   chunk size from 1 to the length gives the same `{visible, facts}` as pushing
   it whole. It fails on master and passes after the change.
2. New test: the same replies through `learned` chained into `chart` (as at
   `bridge.js:273`, with `finishLearned`'s flush order), at every chunk size,
   gives the same card text as pushing whole.
3. `cd bridge && node --test` — all tests pass (132 on master plus the new ones).
4. `nix flake check` passes in CI.
