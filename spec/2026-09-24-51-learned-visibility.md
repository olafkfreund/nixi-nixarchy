---
status: approved
issue: 51
intent: intent/2026-09-24-51-learned-visibility.md
---

# Spec: A fact the agent teaches itself should be visible to the user

The intent left four open questions. Answered below, with the reasoning, so the
approver can overturn a decision rather than re-derive it.

## Design

`bridge/bridge.js:283-288` `finishLearned()` is the single choke point: it
flushes the filter, emits the visible text, and appends the facts. Both changes
land there.

### 1. Visible how? A quiet transcript line, when a fact is kept

The bridge emits `{ type: "learned", facts: [...] }` after a successful append,
and the card renders each as a short Nixi line -- `Conversation.qml` already has
`showNixiMessage()` for exactly this kind of message.

Chosen over a counter or an indicator because the intent's binding constraint is
that the user must not have to know a file exists. A line where they are already
reading satisfies that; an indicator they must notice and expand does not. It is
one short line per fact, at most 5 per turn, and only on turns where the tutor
actually learned something -- which is rare.

### 2. Visible, not confirmed

No per-fact prompt. #27 is the precedent and it is decisive: prompting on
something frequent and mostly-benign trains the user to dismiss it, which
destroys the value of the prompts that matter. A fact is not a machine change;
making it visible is proportionate.

### 3. Guide does not write facts at all

This is the substantive decision.

Guide's promise, which `README.md` still states after #47 corrected the rest of
that paragraph, is that **nothing on your machine changes**. #41 settled the
principle that makes this tractable: reading is not changing, writing is. That
is precisely why Guide keeps unprompted reads and why the docs were corrected
rather than the code.

`LEARNED.md` is a write. Worse, it is a write that **steers later sessions** --
`bin/nixi-context:86` reads it as a notes source and `grounding.js` prepends the
result to future prompts. A user who chose "explain, do not change" is currently
accumulating durable state that alters the tutor's future behaviour, invisibly.
That is the opposite of what they asked for, and the most consequential kind of
change to make silently.

`learned.js`'s own header argues the other way -- "the bridge writes the file,
never the agent, so this works in Guide, where every agent write is cancelled".
That is true about the mechanism and beside the point about the promise. Who
holds the pen does not change whose machine is being written to.

So: in Guide, facts are discarded and nothing is shown. The header comment is
corrected to say so.

### 4. Clearing is out of scope, and the design says why

A user who sees a wrong fact will want to remove it. There is no answer here
beyond editing the file, which violates constraint 3. Noting it as a known gap
rather than half-building an editor: the visibility change is what makes the gap
discoverable in the first place, and a management UI is a separate piece of
work with its own design.

## Alternatives rejected

**Keep writing in Guide and document it.** The #41 resolution for reads. It does
not transfer: that argument turned on reading being non-destructive and
non-persistent. This persists and it feeds back.

**Prompt per fact.** See 2.

**Show a count with an expander.** Less noisy, easier to ignore, and the whole
point is that the user currently cannot see this at all.

**Write in Guide but mark the facts as Guide-authored.** More state, same
promise broken, and nothing downstream distinguishes them.

## Risks

- **Transcript noise.** Bounded at `MAX_FACTS = 5` per turn and only on turns
  that produce facts. If it proves noisy in practice the fallback is a single
  summarising line, which is a small change from here.
- **Guide users lose accumulated learning.** They never knowingly had it. Facts
  already on disk are not deleted -- they continue to be read. Only new writes
  stop.
- **A fact is agent-authored text** reaching the transcript, so it must render
  as plain text and stay length-bounded, like every other agent-supplied string
  in the card (#42). `MAX_FACT = 300` already bounds it.
- Host-specific risk: none.

## Verification

1. `node --test bridge/*.test.js` -- extend `bridge/learned.test.js` and the
   behavioural harness: a Mechanic turn emitting `LEARNED:` appends AND emits a
   `learned` event; a Guide turn emitting the same appends **nothing** and emits
   no event; the visible transcript still has the marker line stripped in both.
2. `nix flake check`.
3. Each new assertion must be shown to fail without the change.
4. Runtime: in Mechanic, get the tutor to record a fact and confirm a "Noted"
   line appears; in Guide, confirm `~/.local/share/nixi/LEARNED.md` does not
   grow.
