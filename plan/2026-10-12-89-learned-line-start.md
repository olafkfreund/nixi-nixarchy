---
status: draft
issue: 89
spec: spec/2026-10-12-89-learned-line-start.md
---

# Plan: A reply means the same thing however the agent chunks it

Approved decisions, carried from the spec:

- `createLearnedFilter` in `bridge/learned.js` gets an `atLineStart` flag, the
  same shape as `bridge/chart.js:25`. A `LEARNED:` marker counts only when its
  line began at a line start. The rest of a line whose start was already sent to
  the card is never held back and never harvested.
- Streaming stays as it is: a partial line is held only while it is at a line
  start and could still become the marker.
- `take`, `couldBeMark`, `appendLearned`, the file format and `bridge/bridge.js`
  are not touched.
- No code for facts already in `LEARNED.md`. The PR description says the file
  may hold a wrongly harvested line and where it is
  (`~/.local/share/nixi/LEARNED.md`).
- Proof is a chunking test: every chunk size from 1 to the length gives the same
  result as pushing the reply whole, for `learned.js` alone and chained into
  `chart.js` as at `bridge/bridge.js:273`.

Implemented by the session model: two files and three steps, below the handoff
threshold for a code agent.

## Steps

1. `bridge/learned.test.js`, after the "however the stream is split" test
   (ends line 28): add two tests, written first so they fail on master.

   a. "a reply means the same thing at every chunk size (#89)". Replies:
      - `"Done LEARNED: not a fact\n"`
      - `"Use apply.\nLEARNED: apps are queued\nok LEARNED: no\n  LEARNED: yes"`
      - `"a\nLEAR\nLEARNED: x\nLEARNEDy\n"`

      For each reply and every `n` from 1 to `length - 1`, push it in
      `n`-character chunks with the existing `streamed()` helper and
      `assert.deepEqual` against `streamed([reply])`. Also assert outright that
      the first reply, pushed whole, gives `visible` equal to itself and no
      facts.

   b. "learned and chart agree at every chunk size (#89)". Chain
      `chart.push(learned.push(chunk))` per chunk, then at the end
      `chart.push(learned.flush().visible) + chart.flush()`, the order
      `finishLearned` uses (`bridge/bridge.js:394-396`). Use a temp media
      directory as `chart.test.js:15` (`sandbox`) does, and remove it afterwards.
      Reply: `"Sizes:\n```nixi-chart\ntitle: S\na 1\n```\nDone LEARNED: x\nLEARNED: real\n"`.
      Every chunk size gives the same card text and facts as pushing it whole.
      Import `createChartFilter` from `./chart.js`.

   → verify with `cd bridge && node --test learned.test.js`: both new tests
   **fail** on master, and the existing tests pass.
   Traps: `streamed()` already flushes. Don't double-flush in (a). Chart SVG
   names are content hashes, so text from a whole push and a chunked push into
   the same directory compares equal.

2. `bridge/learned.js:22-62` (`createLearnedFilter`):
   - line 24: add `let atLineStart = true;` after `let pending = "";`, with a
     two-line comment in `chart.js:21-24`'s voice: a marker is a marker only at
     the start of a line, and without this the output depended on where the
     stream was chunked (#89);
   - line 48: `const kept = atLineStart ? take(line) : line;`, then
     `atLineStart = true;` after the `if` on line 49;
   - line 51: `if (pending && !(atLineStart && couldBeMark(pending))) {`, and
     inside it, after `pending = "";`, add `atLineStart = false;`;
   - line 58: `const kept = pending ? (atLineStart ? take(pending) : pending) : null;`.

   → verify with `cd bridge && node --test learned.test.js`: all pass.
   Traps: `flush()` must not reset `atLineStart`. `bridge.js:424` creates a new
   filter per turn, and that resets it.

3. Full check, then commit as `fix(learned): a marker counts only at a line start (#89)`.
   → verify with `cd bridge && node --test` (132 plus 2, all pass) and
   `python3 -I tools/test_nixi.py` ("all checks passed").

## Tests

- `cd bridge && node --test`: everything passes, including the two new tests and
  `chart.test.js`.
- `python3 -I tools/test_nixi.py`: "all checks passed".
- CI `nix flake check`: green on the PR.

## Rollback

Revert the step 3 commit. The change makes no data migration and writes no files
differently, so a revert is complete.
