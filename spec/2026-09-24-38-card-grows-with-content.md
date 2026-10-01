---
status: approved
issue: 38
intent: intent/2026-09-24-38-card-grows-with-content.md
---

# Spec: The card should grow with the conversation

## Design

### The width is driven by the text, not by the layout

`root.contentWantsRoom` is a plain boolean set by `noteContentWidth(body)`,
called wherever message text enters the model. It is true when a body exceeds
420 characters, contains a fence (` ``` `), or contains a newline followed by a
pipe -- the three shapes that wrap badly at 540px.

Two properties matter more than the threshold:

- **It reads no geometry.** Not height, not width, not `parent`, not `stack`.
  This is what makes the loop impossible rather than merely unlikely. A test
  asserts it, because the constraint is invisible in the code once written.
- **It is monotonic within a conversation.** Once set it is never cleared until
  `close()`. So the card cannot flap as an answer streams past the threshold.

The width becomes
`min(contentWantsRoom ? roomyWidth : compactWidth, parent.width - gapsOut * 2)`,
with `Behavior on width` animating over 180ms.

`roomyWidth` is `min(Style.space(1000) * fontScale, parent.width * 0.7)` -- the
issue asked for "about 900-1100px or about 70% of the panel", and this is both,
whichever binds first.

### The height ceiling follows the panel

`maxHeight` becomes `min(parent.height * 0.85, parent.height - gapsOut * 2)`,
replacing the fixed `Style.space(560)`. The height expression is unchanged:
`min(maxHeight, stack.height + frameInset)` already grows with content, so a
short exchange still produces a short card. Only the ceiling moves.

## Alternatives rejected

**Measure the content and size to fit.** The obvious approach and the wrong one:
it is precisely the feedback loop the intent forbids. Wider wraps less, so the
card shortens, so it narrows again.

**Widen when the content overflows vertically.** Layout-dependent, so the same
loop with extra steps.

**Widen whenever the conversation is non-empty.** Fails "a one-line question
keeps the compact card", which is the behaviour most users see most often.

**Let the width shrink again when a conversation gets shorter.** There is no
such thing here -- messages only accumulate -- and making the flag clearable
would reintroduce flapping for no gain.

## Risks

- **The threshold is a judgement.** 420 characters is roughly a paragraph; a
  long-ish prompt that is still readable at 540px will widen the card
  unnecessarily. Tunable in one place, and erring toward widening is the
  cheaper error.
- **A `\\n|` test will match prose containing a line starting with a pipe.**
  Rare, and the cost is a wider card, not a broken one.
- **Monotonic means a single long paste keeps the card wide** for the rest of
  the conversation. Deliberate: the alternative is flapping.
- **CI cannot see any of this.** The guards are string assertions over the QML,
  which is the repo's existing idiom and the only thing standing between a
  layout bug and a green build.
- Host-specific risk: none.

## Verification

1. `python3 tools/test_nixi.py` -- `test_card_grows_with_content` asserts the
   trigger touches no geometry, the width expression does not reference
   `stack.height`/`implicitHeight`/`maxHeight`, `maxHeight` is panel-relative,
   every `role: "You"` append is followed by `noteContentWidth`, and `close()`
   resets the flag.
2. Each of those broken in turn and observed to fail.
3. `qmllint` on `Conversation.qml`; `nix flake check`; `node --test bridge/*`.
4. Runtime, not run: a one-line question stays compact; a 20-line prompt and an
   answer with a code block widen without clipping; the widening animates; a
   new conversation starts compact again.
