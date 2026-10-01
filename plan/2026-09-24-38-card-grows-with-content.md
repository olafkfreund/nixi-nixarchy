---
status: approved
issue: 38
spec: spec/2026-09-24-38-card-grows-with-content.md
---

# Plan: The card should grow with the conversation

## Steps

1. `Conversation.qml`: add `contentWantsRoom`, `roomyThreshold` and
   `noteContentWidth(body)` -- reading only the text.
2. Call it at all three `role: "You"` appends and on the streaming
   `setProperty(activeReply, "body", ...)`.
3. Replace `maxHeight`'s fixed `Style.space(560)` with
   `parent.height * 0.85`, keeping the outer `- gapsOut * 2` clamp.
4. Add `compactWidth` / `roomyWidth`; make `width` choose between them on
   `contentWantsRoom`; add `Behavior on width`.
5. Reset `contentWantsRoom` in `close()`.
6. `tools/test_nixi.py`: `test_card_grows_with_content`.
7. Break each assertion and watch it fail.

## Tests

```bash
python3 tools/test_nixi.py
qmllint Conversation.qml
node --test bridge/*.test.js
nix flake check --print-build-logs
```

All four pass. Each guard broken and observed to fail:

| broken | message |
|---|---|
| width keyed on `stack.height` | `the card width ignores the content` |
| fixed 560 ceiling restored | `maxHeight is still a fixed ceiling: …` |
| a `noteContentWidth` call dropped | `a You message is appended without noting its width: …` |
| trigger reads `parent.height` | `noteContentWidth reads 'height' -- the width trigger must not touch geometry` |

## Deviations

Two, both mine, caught by the tests rather than by reading:

1. **A duplicated call.** My first edit inserted `noteContentWidth(text)` twice
   on the steer path, at different indents. Visible only on re-reading the file.
2. **The main submit path was missed.** The single-replace matched the steer
   path instead, so the most common route -- typing a question -- did not feed
   the trigger at all. The "every You append is followed by noteContentWidth"
   assertion is in the suite specifically because I made this mistake; it would
   have shipped a feature that silently did nothing for ordinary use.

A third, smaller: the test's first regex captured only the first line of the
two-line width expression and failed on correct code. I fixed the test, not the
code.

## Rollback

`git revert`. Presentation only, no persisted state: `contentWantsRoom` lives
for the life of a conversation and is never written anywhere.

## Not covered

Everything visual. CI does not run QML, so the string assertions are standing in
for a test that cannot exist here. A human still needs to confirm the compact
card, the widening, the animation, and that a new conversation starts narrow.
