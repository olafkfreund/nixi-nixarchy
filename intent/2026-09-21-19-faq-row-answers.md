---
status: draft
issue: 19
author: olafkfreund
---

# Intent: Choosing a FAQ row shows its answer

## Problem

Typing in the card shows matching FAQ questions as search rows ("Install an
app", "Why did my install not happen?" …). Choosing one, by click plus Return
or its Ctrl+N slot twice, does nothing. The shell logs, once per attempt:

    Conversation.qml[969:-1]: TypeError: Cannot call method 'append' of undefined

`Conversation.qml:969` calls `root.messages.append(...)`, but `messages` is a
`ListModel { id: messages }` (line 1331), an id and not a property of `root`,
so `root.messages` is undefined. `showNixiMessage()` on the next line uses the
bare id and works. It has been broken since 51d177a (#8) introduced FAQ rows.

This matters more than one broken row. The FAQ is one of the three features
the README says need **no AI and no network**, so someone without an agent
set up gets no answers from it at all. `tools/test_nixi.py`'s
`test_nixi_rows_are_searchable` checks that `faqAnswered` is wired, and so
passes, while the handler throws.

## Proposed outcome

- Choosing a FAQ row puts the question and its written answer in the card,
  with no agent and no network, and the card stays open.
- A test fails if the handler refers to the model by a name that does not
  exist.
- The README and site note "choosing one does nothing yet" (#19) is removed.

## Affected users and systems

- Everyone using the card's search, and especially people with no agent.
- `Conversation.qml`, `tools/test_nixi.py`, `README.md`, `docs/index.html`.

## Constraints

- No behaviour change beyond the fix: the row still does not start an agent
  turn.
- Verified on a real nixarchy desktop, not only by a test: QML errors only
  appear at runtime.

## Open questions

None.
