---
status: draft
issue: 51
author: olafkfreund
---

# Intent: A fact the agent teaches itself should be visible to the user

## Problem

Any line the agent emits beginning `LEARNED:` is removed from the visible
transcript and appended to `~/.local/share/nixi/LEARNED.md`
(`bridge/learned.js:27-33` -- `take()` returns `null`, so the line never reaches
the card). `bin/nixi-context:86` reads that file as one of its *notes* sources,
and `:205` surfaces it as "From the notes -- ...", which `bridge/grounding.js`
prepends to later prompts as background from the machine's own manual store.

So untrusted agent output writes persistent state that is re-injected as trusted
context in later, unrelated sessions, and the user never sees the write happen.

The hiding is deliberate and the reason is good: a bare `LEARNED:` line in the
transcript is noise, and the feature itself is genuinely useful -- a tutor that
remembers what it worked out about this machine is better than one that does
not. The consequence may not have been intended: the user cannot notice, refuse,
or correct a belief their tutor has formed about their system.

There is a sharper detail in `learned.js`'s own header. It says this works in
Guide, "where every agent write is cancelled". It is the one agent-driven disk
write Guide does **not** cancel -- and it is the one that steers future turns.

The file handling itself is right and is not the problem: `lstat` symlink
refusal, mode 0600, `O_EXCL` temp, atomic rename. The problem is the channel.

## Proposed outcome

- When Nixi records something it has learned about the machine, the user can
  see that it did.
- The user can inspect and clear what has been recorded, without knowing the
  file exists or where it lives.
- The feature keeps working: the agent still accumulates useful local knowledge
  across sessions, and the transcript does not become noisy.

## Affected users and systems

- Every user with an agent connected, in both trust levels.
- `bridge/learned.js`, `bridge/bridge.js`'s event stream, `Conversation.qml`'s
  transcript, and possibly a new affordance for viewing or clearing the store.
- `bin/nixi-context` and `bridge/grounding.js` are the consumers and need no
  change unless the storage format does.

## Constraints

- Must not make the transcript noisy. If every fact becomes a full message, the
  cure is worse: users stop reading the transcript, which is the thing this is
  trying to protect.
- Must not break the existing file guarantees -- symlink refusal, 0600, atomic
  rename -- or the 300-char x 5-per-turn bounds.
- Must not require the user to know about a file. Anything that amounts to
  "go and read ~/.local/share/nixi/LEARNED.md" has not solved it.
- Guide's behaviour needs deciding explicitly rather than inherited: today this
  is the one write Guide permits, and whatever happens should be a stated
  decision.

## Open questions

1. Visible how? A quiet inline "Noted: <fact>" in the transcript is cheapest and
   keeps the write where the user is already looking. A count or an indicator
   with a way to expand is less noisy but easier to ignore. This is the main
   design decision.
2. Confirmed, or just visible? Gating each fact behind a yes is stronger and
   risks exactly the prompt fatigue #27 was about. Visible-but-automatic is
   weaker and much more likely to be lived with.
3. Should Guide still be allowed to write facts at all? It is currently the sole
   exception to "Guide changes nothing on your machine", and that phrase is in
   the README. Either the exception is justified and documented, or Guide stops
   writing -- see #41, where the same class of mismatch was resolved by
   correcting the documentation.
4. Is there a way to clear or edit what has been learned? Not strictly required
   to make the write visible, but a user who sees a wrong fact recorded will
   immediately want to remove it, and having no answer is its own problem.
