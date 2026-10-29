---
status: approved
issue: 121
author: olafkfreund
---

# Intent: Conversation.qml is split into parts a reader can hold

## Problem

`Conversation.qml` is 2,558 lines. It holds the conversation's state and the bridge
protocol (`handleAgentLine`), plus several pieces with their own job:
- inline components for scroll physics (`ScrollPhysics`, ~783) and window shortcuts
  (`WindowShortcuts`, ~900);
- the inline search results (~1837-2120);
- the file preview card (~2180-2337);
- the permission layer (~2339-2526).

A change to any of them means reading or editing the whole file. The 2026-10-29 review
flagged it, and #119 and #120 had to coordinate to avoid editing the same lines.

There's no user-visible bug. This is maintainability only.

## Proposed outcome

- The self-contained parts live in their own QML files, and `Conversation.qml` keeps the
  conversation state, the bridge protocol and the layout that ties them together.
- The card behaves exactly as before: the same look, keys, scrolling, permission card,
  file preview and search.
- Something checks that the split QML still loads, so a broken split fails a check
  instead of the card on someone's desktop.

## Affected users and systems

- Everyone using the nixi card (Omarchy overlay), on every host it's installed on.
- `Conversation.qml`; new QML files next to it; `nix/package.nix` (it lists every QML
  file by name, at line 160 and in the install check at line 251); `install.py` if it
  copies plugin files by name; CI.

## Constraints

- No behaviour change. A pure move, with property and signal plumbing only where a moved
  part used `root` or ids directly.
- There's no QML test harness today. The split must come with a load check (for example
  `qmllint`, or quickshell loading the plugin headless), or be checked live on p620
  before merge.
- Smallest useful split first. Moving the tightly coupled parts (the permission layer
  reads and writes root state everywhere) is only worth it if the plumbing stays small.

## Open questions

- Which parts move? I'd propose the two inline components and the file preview card
  first (self-contained), and the permission layer and inline search only if the spec
  finds the coupling manageable.
- Which load check? `qmllint` may not know quickshell's types. The spec measures what
  works.
